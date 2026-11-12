import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db, ensureFinanceSchema } from "../../../lib/db";
import { readToken } from "../../../lib/session";

export const runtime = "nodejs";

const money = value => Number(value);
const validNetwork = value => ["MTN MoMo", "Telecel Cash", "AT Money"].includes(value);
const adminSecret = () => process.env.ADMIN_KEY || process.env.ADMIN_ACCESS_KEY || "";

async function getUser() {
  const jar = await cookies();
  const token = jar.get("farmrise_session")?.value;
  return token ? await readToken(token) : null;
}

async function loadAdminData() {
  const pool = db();
  const [totals, users, requests, plans, transactions, payouts] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS users, COALESCE((SELECT SUM(balance) FROM wallets),0)::numeric(14,2) AS wallet_total FROM users"),
    pool.query("SELECT u.id,u.full_name,u.email,COALESCE(w.balance,0) AS balance,COALESCE(w.withdrawable_balance,0) AS withdrawable_balance,COALESCE(w.bonus_balance,0) AS bonus_balance FROM users u LEFT JOIN wallets w ON w.user_id=u.id ORDER BY u.created_at DESC"),
    pool.query("SELECT r.*,u.full_name,u.email FROM finance_requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC LIMIT 200"),
    pool.query("SELECT * FROM investment_plans ORDER BY id"),
    pool.query("SELECT t.*,u.full_name FROM wallet_transactions t JOIN users u ON u.id=t.user_id ORDER BY t.created_at DESC LIMIT 300"),
    pool.query("SELECT p.*,u.full_name,u.email FROM admin_payouts p JOIN users u ON u.id=p.user_id ORDER BY p.created_at DESC LIMIT 200")
  ]);
  return { totals: totals.rows[0], users: users.rows, requests: requests.rows, plans: plans.rows, transactions: transactions.rows, payouts: payouts.rows };
}

async function userFinance(user) {
  const pool = db();
  await pool.query("INSERT INTO wallets(user_id) VALUES($1) ON CONFLICT(user_id) DO NOTHING", [user.id]);
  const [wallet, plans, requests, investments, transactions] = await Promise.all([
    pool.query("SELECT balance,withdrawable_balance,bonus_balance FROM wallets WHERE user_id=$1", [user.id]),
    pool.query("SELECT * FROM investment_plans WHERE active=TRUE ORDER BY id"),
    pool.query("SELECT * FROM finance_requests WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [user.id]),
    pool.query("SELECT * FROM investments WHERE user_id=$1 ORDER BY created_at DESC", [user.id]),
    pool.query("SELECT * FROM wallet_transactions WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100", [user.id])
  ]);
  return { wallet: wallet.rows[0] || { balance: 0, withdrawable_balance: 0, bonus_balance: 0 }, plans: plans.rows, requests: requests.rows, investments: investments.rows, transactions: transactions.rows };
}

export async function GET(request) {
  try {
    await ensureFinanceSchema();
    const key = request.headers.get("x-admin-key") || "";
    if (key && adminSecret() && key === adminSecret()) return NextResponse.json(await loadAdminData());
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    return NextResponse.json(await userFinance(user));
  } catch (error) {
    console.error("FarmRise finance GET error", error);
    return NextResponse.json({ error: "Unable to load finance information." }, { status: 500 });
  }
}

async function adminPost(body) {
  const pool = db();
  const action = body.action;
  if (action === "adjust_wallet") {
    const amount = money(body.amount);
    const bucket = body.bucket === "bonus" ? "bonus_balance" : "withdrawable_balance";
    if (!Number.isInteger(Number(body.userId)) || !Number.isFinite(amount) || amount <= 0) throw new Error("Choose a user and enter a valid amount.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE", [body.userId]);
      if (!result.rowCount) throw new Error("Wallet not found.");
      const current = money(result.rows[0][bucket]);
      const next = body.kind === "deduct" ? current - amount : current + amount;
      if (next < 0) throw new Error("The wallet does not have enough funds.");
      const delta = body.kind === "deduct" ? -amount : amount;
      await client.query("UPDATE wallets SET " + bucket + "=$1,balance=balance+$2,updated_at=NOW() WHERE user_id=$3", [next, delta, body.userId]);
      await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_type,description,admin_note) VALUES($1,$2,$3,$4,$5,$6)", [body.userId, body.kind === "deduct" ? "admin_deduction" : "admin_credit", amount, bucket === "bonus_balance" ? "bonus" : "withdrawable", body.reason || "Admin wallet adjustment", body.reason || "Admin wallet adjustment"]);
      await client.query("COMMIT");
      return { message: "Wallet updated and transaction recorded." };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  if (action === "admin_payout") {
    const amount = money(body.amount), userId = Number(body.userId);
    const network = String(body.network || ""), mobileNumber = String(body.mobileNumber || "").replace(/\s/g, "");
    const reason = String(body.reason || "").trim();
    if (!Number.isInteger(userId) || !Number.isFinite(amount) || amount <= 0 || !validNetwork(network) || !/^0\d{9}$/.test(mobileNumber) || !reason) throw new Error("Select a user, enter a valid amount, network, 10-digit MoMo number and reason.");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query("SELECT withdrawable_balance FROM wallets WHERE user_id=$1 FOR UPDATE", [userId]);
      if (!locked.rowCount) throw new Error("Wallet not found.");
      if (money(locked.rows[0].withdrawable_balance) < amount) throw new Error("The user's withdrawable balance is too low.");
      await client.query("UPDATE wallets SET withdrawable_balance=withdrawable_balance-$1,balance=balance-$1,updated_at=NOW() WHERE user_id=$2", [amount, userId]);
      const payout = await client.query("INSERT INTO admin_payouts(user_id,amount,network,mobile_number,reason,status) VALUES($1,$2,$3,$4,$5,'pending') RETURNING id", [userId, amount, network, mobileNumber, reason]);
      await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_type,description,admin_note,status,network,mobile_number,payout_id) VALUES($1,'admin_payout_pending',$2,'withdrawable',$3,$4,'pending',$5,$6,$7)", [userId, amount, "Admin payout reserved; awaiting actual MoMo transfer", reason, network, mobileNumber, payout.rows[0].id]);
      await client.query("COMMIT");
      return { message: "Payout recorded as pending. Send the MoMo payment through your authorized provider, then mark it as sent.", payoutId: payout.rows[0].id };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  if (action === "review_payout") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query("SELECT * FROM admin_payouts WHERE id=$1 FOR UPDATE", [body.id]);
      if (!result.rowCount) throw new Error("Payout not found.");
      const payout = result.rows[0];
      if (payout.status !== "pending") throw new Error("This payout has already been reviewed.");
      if (body.status === "sent") {
        await client.query("UPDATE admin_payouts SET status='sent',admin_note=$1,completed_at=NOW() WHERE id=$2", [body.note || "Transfer confirmed by admin", payout.id]);
        await client.query("UPDATE wallet_transactions SET status='completed',type='admin_payout_sent' WHERE payout_id=$1 AND status='pending'", [payout.id]);
      } else if (body.status === "failed" || body.status === "cancelled") {
        await client.query("UPDATE wallets SET withdrawable_balance=withdrawable_balance+$1,balance=balance+$1,updated_at=NOW() WHERE user_id=$2", [payout.amount, payout.user_id]);
        await client.query("UPDATE admin_payouts SET status=$1,admin_note=$2,completed_at=NOW() WHERE id=$3", [body.status, body.note || "Payout not completed; funds returned", payout.id]);
        await client.query("UPDATE wallet_transactions SET status='reversed',type='admin_payout_reversed' WHERE payout_id=$1 AND status='pending'", [payout.id]);
        await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_type,description,admin_note) VALUES($1,'payout_refund',$2,'withdrawable','Refund of failed admin payout',$3)", [payout.user_id, payout.amount, body.note || "Payout failed"]);
      } else throw new Error("Choose sent, failed or cancelled.");
      await client.query("COMMIT");
      return { message: "Payout status updated." };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  if (action === "review_request") {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query("SELECT * FROM finance_requests WHERE id=$1 FOR UPDATE", [body.id]);
      if (!found.rowCount || found.rows[0].status !== "pending") throw new Error("Request is missing or already reviewed.");
      const req = found.rows[0];
      if (body.status === "approved") {
        if (req.type === "deposit") {
          await client.query("UPDATE wallets SET withdrawable_balance=withdrawable_balance+$1,balance=balance+$1,updated_at=NOW() WHERE user_id=$2", [req.amount, req.user_id]);
          await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_type,description,admin_note) VALUES($1,'deposit',$2,'withdrawable','Deposit approved',$3)", [req.user_id, req.amount, body.note || "Deposit verified by admin"]);
        } else if (req.type === "withdrawal") {
          const wallet = await client.query("SELECT withdrawable_balance FROM wallets WHERE user_id=$1 FOR UPDATE", [req.user_id]);
          if (!wallet.rowCount || money(wallet.rows[0].withdrawable_balance) < money(req.amount)) throw new Error("User no longer has enough withdrawable funds.");
          await client.query("UPDATE wallets SET withdrawable_balance=withdrawable_balance-$1,balance=balance-$1,updated_at=NOW() WHERE user_id=$2", [req.amount, req.user_id]);
          await client.query("INSERT INTO admin_payouts(user_id,amount,network,mobile_number,reason,status) VALUES($1,$2,$3,$4,$5,'pending')", [req.user_id, req.amount, req.network || "MTN MoMo", req.mobile_number || "", "Approved user withdrawal request"]);
          await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_type,description,admin_note,status,network,mobile_number) VALUES($1,'withdrawal_pending',$2,'withdrawable','Withdrawal approved; awaiting manual transfer',$3,'pending',$4,$5)", [req.user_id, req.amount, body.note || "Approved by admin", req.network, req.mobile_number]);
        }
      }
      await client.query("UPDATE finance_requests SET status=$1,admin_note=$2,reviewed_at=NOW() WHERE id=$3", [body.status, body.note || null, req.id]);
      await client.query("COMMIT");
      return { message: "Request " + body.status + "." };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  if (action === "create_plan") {
    const name = String(body.name || "").trim(), minAmount = money(body.minAmount), days = Number(body.days), returnPercent = money(body.returnPercent);
    if (!name || !Number.isFinite(minAmount) || minAmount <= 0 || !Number.isInteger(days) || days < 1 || !Number.isFinite(returnPercent) || returnPercent < 0) throw new Error("Enter a plan name, minimum amount, duration and non-negative projected return.");
    await pool.query("INSERT INTO investment_plans(name,description,min_amount,duration_days,return_percent) VALUES($1,$2,$3,$4,$5)", [name, String(body.description || ""), minAmount, days, returnPercent]);
    return { message: "Investment plan created." };
  }
  if (action === "toggle_plan") {
    await pool.query("UPDATE investment_plans SET active=$1 WHERE id=$2", [Boolean(body.active), body.id]);
    return { message: "Investment plan updated." };
  }
  throw new Error("Unknown admin action.");
}

async function userPost(user, body) {
  const pool = db(), action = body.action, amount = money(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10000000) throw new Error("Enter a valid amount.");
  if (action === "request_deposit") {
    const network = String(body.network || ""), mobileNumber = String(body.mobileNumber || "").replace(/\s/g, "");
    if (!validNetwork(network) || !/^0\d{9}$/.test(mobileNumber)) throw new Error("Choose a network and enter a valid 10-digit mobile money number.");
    await pool.query("INSERT INTO finance_requests(user_id,type,amount,network,mobile_number,status) VALUES($1,'deposit',$2,$3,$4,'pending')", [user.id, amount, network, mobileNumber]);
    return { message: "Deposit request saved. No money has been collected and no USSD prompt has been sent yet." };
  }
  if (action === "request_withdrawal") {
    const network = String(body.network || ""), mobileNumber = String(body.mobileNumber || "").replace(/\s/g, "");
    if (!validNetwork(network) || !/^0\d{9}$/.test(mobileNumber)) throw new Error("Choose a network and enter a valid 10-digit mobile money number.");
    const wallet = await pool.query("SELECT withdrawable_balance FROM wallets WHERE user_id=$1", [user.id]);
    if (!wallet.rowCount || money(wallet.rows[0].withdrawable_balance) < amount) throw new Error("Insufficient withdrawable balance.");
    await pool.query("INSERT INTO finance_requests(user_id,type,amount,network,mobile_number,status) VALUES($1,'withdrawal',$2,$3,$4,'pending')", [user.id, amount, network, mobileNumber]);
    return { message: "Withdrawal request submitted for admin review." };
  }
  if (action === "invest") {
    const planId = Number(body.planId);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const plan = await client.query("SELECT * FROM investment_plans WHERE id=$1 AND active=TRUE", [planId]);
      if (!plan.rowCount) throw new Error("This investment plan is not available.");
      if (amount < money(plan.rows[0].min_amount)) throw new Error("The amount is below this plan's minimum.");
      const wallet = await client.query("SELECT * FROM wallets WHERE user_id=$1 FOR UPDATE", [user.id]);
      if (!wallet.rowCount || money(wallet.rows[0].balance) < amount) throw new Error("Insufficient wallet balance.");
      let remaining = amount;
      const fromWithdrawable = Math.min(remaining, money(wallet.rows[0].withdrawable_balance));
      remaining -= fromWithdrawable;
      const fromBonus = remaining;
      if (fromBonus > money(wallet.rows[0].bonus_balance)) throw new Error("Insufficient wallet balance.");
      await client.query("UPDATE wallets SET withdrawable_balance=withdrawable_balance-$1,bonus_balance=bonus_balance-$2,balance=balance-$3,updated_at=NOW() WHERE user_id=$4", [fromWithdrawable, fromBonus, amount, user.id]);
      await client.query("INSERT INTO investments(user_id,plan_id,plan_name,amount,status) VALUES($1,$2,$3,$4,'active')", [user.id, planId, plan.rows[0].name, amount]);
      await client.query("INSERT INTO wallet_transactions(user_id,type,amount,balance_type,description) VALUES($1,'investment',$2,'mixed',$3)", [user.id, amount, "Investment in " + plan.rows[0].name]);
      await client.query("COMMIT");
      return { message: "Investment recorded. Projected returns are not guaranteed." };
    } catch (error) { await client.query("ROLLBACK"); throw error; }
    finally { client.release(); }
  }
  throw new Error("Unknown action.");
}

export async function POST(request) {
  try {
    await ensureFinanceSchema();
    const body = await request.json();
    const key = request.headers.get("x-admin-key") || "";
    if (key && adminSecret() && key === adminSecret()) return NextResponse.json(await adminPost(body));
    const user = await getUser();
    if (!user) return NextResponse.json({ error: "Please sign in." }, { status: 401 });
    return NextResponse.json(await userPost(user, body));
  } catch (error) {
    console.error("FarmRise finance POST error", error);
    return NextResponse.json({ error: error.message || "Unable to complete this request." }, { status: 400 });
  }
}