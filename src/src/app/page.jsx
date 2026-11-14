"use client";
import { useEffect, useState } from "react";

const money = value => "GH₵" + Number(value || 0).toFixed(2);
const networks = ["MTN MoMo", "Telecel Cash", "AT Money"];

export default function HomePage() {
  const [user, setUser] = useState(null);
  const [data, setData] = useState(null);
  const [mode, setMode] = useState("login");
  const [tab, setTab] = useState("Home");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [amount, setAmount] = useState("");
  const [network, setNetwork] = useState("Telecel Cash");
  const [paymentReference, setPaymentReference] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);

  async function refresh() {
    const auth = await fetch("/api/auth/me");
    const authData = await auth.json();
    setUser(authData.user || null);
    if (authData.user) {
      const response = await fetch("/api/finance");
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to load your account.");
      setData(result);
    } else setData(null);
  }

  useEffect(() => { refresh().catch(e => setError(e.message)); }, []);

  async function authenticate(event) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/" + (mode === "register" ? "register" : "login"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullName, email, password })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sign-in failed.");
      await refresh(); setPassword("");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function submitAction(payload) {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/finance", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Request failed.");
      setNotice(result.message || "Saved."); setAmount(""); setMobileNumber(""); setPaymentReference("");
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setUser(null); setData(null); setTab("Home");
  }

  if (!user) return <div className="authwrap"><form className="authcard" onSubmit={authenticate}>
    <div className="brand"><span className="logo">F</span> FarmRise Ghana</div>
    <h1 className="heading">{mode === "register" ? "Create your account" : "Welcome back"}</h1>
    <p className="muted">Your farming account, wallet and investments in one place.</p>
    {mode === "register" && <div className="field"><label>FULL NAME</label><input value={fullName} onChange={e => setFullName(e.target.value)} required placeholder="Your full name" /></div>}
    <div className="field"><label>EMAIL ADDRESS</label><input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com" /></div>
    <div className="field"><label>PASSWORD</label><input type="password" value={password} onChange={e => setPassword(e.target.value)} required minLength={8} placeholder="At least 8 characters" /></div>
    {error && <p className="error">{error}</p>}
    <button className="btn" disabled={busy}>{busy ? "Please wait…" : mode === "register" ? "Create account" : "Log in"}</button>
    <p className="muted" style={{textAlign:"center",marginTop:16}}>{mode === "register" ? "Already have an account?" : "New to FarmRise?"}{" "}
      <a href="#" onClick={e => {e.preventDefault();setMode(mode === "register" ? "login" : "register");setError("");}} style={{color:"#c91f35",fontWeight:800}}>{mode === "register" ? "Log in" : "Create account"}</a>
    </p>
  </form></div>;

  const wallet = data?.wallet || {};
  const plans = data?.plans || [];
  const requests = data?.requests || [];
  const investments = data?.investments || [];
  const transactions = data?.transactions || [];
  const submitDeposit = () => submitAction({action:"request_deposit",amount,network:"Telecel Cash",mobileNumber,reference:paymentReference});
  const submitWithdrawal = () => submitAction({action:"request_withdrawal",amount,network,mobileNumber});

  return <div className="shell">
    <header className="topbar"><div className="brand"><span className="logo">F</span> FarmRise</div><button className="iconbtn" onClick={() => setTab("Profile")}>☰</button></header>
    <main className="content">
      {tab === "Home" && <>
        <div className="eyebrow">YOUR FARMRISE ACCOUNT</div><h1 className="heading">Welcome, {user.name?.split(" ")[0] || "Farmer"}</h1>
        <div className="wallet"><div className="eyebrow">TOTAL BALANCE</div><div className="total">{money(wallet.balance)}</div>
          <div className="walletgrid"><div className="walletmini"><span>WITHDRAWABLE</span><b>{money(wallet.withdrawable_balance)}</b></div><div className="walletmini"><span>BONUS FUNDS</span><b>{money(wallet.bonus_balance)}</b></div></div>
          <p className="muted">Bonus funds can be used to invest but cannot be withdrawn.</p>
        </div>
        <div className="actions"><button className="btn" onClick={() => setTab("Deposit")}>＋ Deposit Funds</button><button className="btn secondary" onClick={() => setTab("Withdraw")}>↑ Withdraw</button></div>
        <div className="sectiontitle">Available Plans</div><p className="muted">Choose a livestock portfolio. Projected returns are illustrative, not guaranteed.</p>
        <div className="plans">{plans.slice(0,3).map(plan => <PlanCard key={plan.id} plan={plan} onChoose={() => {setSelectedPlan(plan);setAmount(String(plan.min_amount));setTab("Invest");}} />)}</div>
        <div className="sectiontitle">Recent Withdrawals</div>{requests.filter(r => r.type === "withdrawal").slice(0,5).map(r => <div className="listrow" key={r.id}><span>Withdrawal request<br/><small className="muted">{new Date(r.created_at).toLocaleDateString()}</small></span><b>{money(r.amount)}</b><span className="muted">{r.status}</span></div>)}
      </>}

      {tab === "Invest" && <>
        <div className="eyebrow">GROW WITH FARMRISE</div><h1 className="heading">My Investments</h1><p className="muted">Choose a livestock plan or review your active investments.</p>
        {selectedPlan && <div className="wallet"><b>{selectedPlan.name}</b><p className="muted">Minimum {money(selectedPlan.min_amount)} · {selectedPlan.duration_days} days · projected {selectedPlan.return_percent}%</p>
          <div className="field"><label>INVESTMENT AMOUNT (GH₵)</label><input type="number" min={selectedPlan.min_amount} value={amount} onChange={e => setAmount(e.target.value)} /></div>
          <button className="btn" disabled={busy || !amount} onClick={() => submitAction({action:"invest",planId:selectedPlan.id,amount})}>Invest now</button>
          <button className="btn secondary" style={{width:"100%",marginTop:8}} onClick={() => setSelectedPlan(null)}>Cancel</button>
        </div>}
        <div className="plans">{plans.map(plan => <PlanCard key={plan.id} plan={plan} onChoose={() => {setSelectedPlan(plan);setAmount(String(plan.min_amount));}} />)}</div>
        <div className="sectiontitle">My Investments</div>{investments.map(item => <div className="listrow" key={item.id}><span><b>{item.plan_name}</b><br/><small className="muted">{new Date(item.created_at).toLocaleDateString()}</small></span><b>{money(item.amount)}</b><span className="muted">{item.status}</span></div>)}
      </>}

      {tab === "Deposit" && <>
        <div className="eyebrow">WALLET</div><h1 className="heading">Deposit Funds</h1><p className="muted">Send your deposit to the official FarmRise Telecel Cash number below.</p>
        <div className="notice"><b>Step 1 — Send your money</b><br/>Open Telecel Cash and send the exact amount you want to deposit to:<br/><br/><b style={{fontSize:22,color:"#202124"}}>0503951664</b><br/><b>Recipient: Anita Cujoe</b><br/><br/>Make sure the recipient name matches before confirming your transfer. Never share your MoMo PIN or OTP.</div>
        <div className="field"><label>AMOUNT YOU SENT (GH₵)</label><input type="number" min="1" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Enter amount sent" /></div>
        <div className="field"><label>YOUR MOBILE NUMBER</label><input inputMode="tel" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} placeholder="05XXXXXXXX" /></div>
        <div className="field"><label>TRANSACTION ID / REFERENCE</label><input value={paymentReference} onChange={e => setPaymentReference(e.target.value)} placeholder="Enter the reference from your receipt" /></div>
        <div className="notice"><b>Step 2 — Submit for verification</b><br/>After sending the money, enter your payment details above and submit. Your deposit will show as pending until an admin checks the receiving Telecel Cash account and approves it. Only then will the money be added to your wallet.</div>
        <button className="btn" style={{width:"100%"}} disabled={busy || !amount || !mobileNumber || !paymentReference.trim()} onClick={submitDeposit}>I have sent the money</button>
        <div className="sectiontitle">Recent Deposits</div>{requests.filter(r => r.type === "deposit").map(r => <div className="listrow" key={r.id}><span>{money(r.amount)}<br/><small className="muted">{r.network} · {r.mobile_number}</small></span><b>{r.status}</b></div>)}
      </>}

      {tab === "Withdraw" && <>
        <div className="eyebrow">WALLET</div><h1 className="heading">Withdraw Funds</h1><p className="muted">Request a transfer to your Ghana Mobile Money account.</p>
        <div className="wallet"><span className="eyebrow">WITHDRAWABLE BALANCE</span><div className="total">{money(wallet.withdrawable_balance)}</div></div>
        <div className="field"><label>AMOUNT (GH₵)</label><input type="number" min="1" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" /></div>
        <div className="sectiontitle">Mobile Money Network</div><div className="networkgrid">{networks.map(n => <button type="button" className={"network "+(network===n?"active":"")} onClick={() => setNetwork(n)} key={n}>{n}</button>)}</div>
        <div className="field"><label>MOBILE MONEY NUMBER</label><input inputMode="tel" value={mobileNumber} onChange={e => setMobileNumber(e.target.value)} placeholder="024XXXXXXX" /></div>
        <div className="notice">Your request is reviewed by the FarmRise administrator before payment is sent. No automatic transfer is claimed.</div>
        <button className="btn" style={{width:"100%"}} disabled={busy || !amount || !mobileNumber} onClick={submitWithdrawal}>Request withdrawal</button>
        <div className="sectiontitle">Recent Withdrawals</div>{requests.filter(r => r.type === "withdrawal").map(r => <div className="listrow" key={r.id}><span>{money(r.amount)}<br/><small className="muted">{r.network} · {r.mobile_number}</small></span><b>{r.status}</b></div>)}
      </>}

      {tab === "Profile" && <>
        <div className="eyebrow">ACCOUNT</div><h1 className="heading">Profile Settings</h1>
        <div className="profilebox"><div className="sectiontitle" style={{marginTop:0}}>Account Information</div><div className="listrow"><span className="muted">Full name</span><b>{user.name}</b></div><div className="listrow"><span className="muted">Email</span><b>{user.email}</b></div><div className="listrow"><span className="muted">User ID</span><b>{user.id}</b></div></div>
        <div className="actions"><button className="btn secondary" onClick={() => setTab("Home")}>Back</button><button className="btn" onClick={logout}>Log out</button></div>
        <div className="sectiontitle">Recent Activity</div>{transactions.slice(0,10).map(item => <div className="listrow" key={item.id}><span>{item.description || item.type}<br/><small className="muted">{new Date(item.created_at).toLocaleDateString()}</small></span><b>{money(item.amount)}</b></div>)}
      </>}
      {notice && <p className="success">{notice}</p>}{error && <p className="error">{error}</p>}
    </main>
    <nav className="nav">{[["Home","⌂"],["Invest","♧"],["Deposit","＋"],["Withdraw","↓"],["Profile","♙"]].map(([name,icon]) => <button className={tab===name?"active":""} onClick={() => {setTab(name);setSelectedPlan(null);setError("");setNotice("");}} key={name}><b>{icon}</b>{name}</button>)}</nav>
  </div>;
}

function PlanCard({plan,onChoose}) {
  const name = String(plan.name || "").toLowerCase();
  const isBoer = name.includes("boer");
  const isSheep = name.includes("sheep");
  const isRabbit = name.includes("rabbit");
  const isKid = name.includes("kid") || name.includes("young goat");
  const animalClass = isSheep ? "sheep" : isRabbit ? "rabbit" : isBoer || name.includes("goat") ? "goat" : "pig";
  const photo = isSheep
    ? "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c3/Schof_11.jpg/960px-Schof_11.jpg"
    : isRabbit
      ? "https://cdn.holidoit.com/media/experiences/1213/images/full/cena-tipica-in-agriturismo-fuori-bergamo-a-cenate-sopra-36890.webp"
      : isBoer
        ? "https://static.wixstatic.com/media/119b4e_87a627e4d583415eb4baa171892b7aa9~mv2.jpg/v1/fill/w_700%2Ch_574%2Cal_c%2Cq_85/119b4e_87a627e4d583415eb4baa171892b7aa9~mv2.jpg"
        : isKid
          ? "https://www.kmetijazoran.insipia.si/Galerija/slike/galerija2/DSC_2390.jpg"
          : "https://vet.ed.ac.uk/sites/default/files/styles/convert_to_webp/public/thumbnails/image/piglet_0.jpg.webp?itok=M8v68ciC";
  return <article className="plan"><div className={"animal "+animalClass}><img src={photo} alt={plan.name + " livestock"} loading="lazy" /><span className="returntag">+{Number(plan.return_percent).toFixed(1)}%</span></div><div className="planbody">
    <div className="planname">{plan.name}</div><div className="muted">{plan.description}</div>
    <div className="planmeta"><span>Minimum investment</span><b>{money(plan.min_amount)}</b></div>
    <div className="planmeta"><span>Projected return</span><b className="red">{money(Number(plan.min_amount)*(1+Number(plan.return_percent)/100))}</b></div>
    <div className="planmeta"><span>Duration</span><b>{plan.duration_days} days</b></div>
    <button className="btn" onClick={onChoose}>Invest Now</button>
  </div></article>;
}