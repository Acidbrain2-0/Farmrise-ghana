"use client";
import { useState } from "react";

const money = value => "GH₵" + Number(value || 0).toFixed(2);
const networks = ["MTN MoMo", "Telecel Cash", "AT Money"];

export default function AdminPage() {
  const [key,setKey] = useState("");
  const [data,setData] = useState(null);
  const [error,setError] = useState("");
  const [success,setSuccess] = useState("");
  const [busy,setBusy] = useState(false);
  const [userId,setUserId] = useState("");
  const [kind,setKind] = useState("deposit");
  const [bucket,setBucket] = useState("withdrawable");
  const [amount,setAmount] = useState("");
  const [reason,setReason] = useState("");
  const [payoutUser,setPayoutUser] = useState("");
  const [payoutAmount,setPayoutAmount] = useState("");
  const [network,setNetwork] = useState(networks[0]);
  const [mobileNumber,setMobileNumber] = useState("");
  const [payoutReason,setPayoutReason] = useState("");
  const [plan,setPlan] = useState({name:"",description:"",minAmount:"5",days:"30",returnPercent:"0"});

  async function load() {
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/finance",{headers:{"x-admin-key":key}});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Access denied.");
      setData(result);
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function act(payload) {
    setBusy(true); setError(""); setSuccess("");
    try {
      const response = await fetch("/api/finance",{method:"POST",headers:{"Content-Type":"application/json","x-admin-key":key},body:JSON.stringify(payload)});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Action failed.");
      setSuccess(result.message || "Saved."); await load();
    } catch(e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!data) return <div className="authwrap"><form className="authcard" onSubmit={e=>{e.preventDefault();load();}}>
    <div className="brand"><span className="logo">F</span> FarmRise Admin</div><h1 className="heading">Private dashboard</h1>
    <p className="muted">Separate from the public FarmRise website. Use the private admin key configured for this project.</p>
    <div className="field"><label>ADMIN ACCESS KEY</label><input type="password" value={key} onChange={e=>setKey(e.target.value)} required placeholder="Enter private admin key" /></div>
    {error && <p className="error">{error}</p>}<button className="btn" disabled={busy}>{busy?"Checking…":"Open admin dashboard"}</button><p className="muted">Keep this key private.</p>
  </form></div>;

  return <main className="admin-shell">
    <div className="admin-top"><div><div className="brand"><span className="logo">F</span> FarmRise Admin</div><p className="muted">Private management · <a href="/" style={{color:"#c91f35"}}>Public site</a></p></div><button className="btn secondary" onClick={()=>setData(null)}>Lock dashboard</button></div>
    <div className="admin-grid">
      <div className="stat">Registered users<b>{data.totals.users}</b></div><div className="stat">Wallet total<b>{money(data.totals.wallet_total)}</b></div><div className="stat">Pending requests<b>{data.requests.filter(r=>r.status==="pending").length}</b></div><div className="stat">Investment plans<b>{data.plans.length}</b></div>
    </div>

    <section className="admin-card"><h2>Direct payout from a user's wallet</h2><p className="muted">This reserves the user's withdrawable balance and records the payout. Complete the actual MoMo transfer through your authorized payment channel, then mark it as sent.</p>
      <div className="admin-form">
        <div><label>User</label><select value={payoutUser} onChange={e=>setPayoutUser(e.target.value)}><option value="">Select user</option>{data.users.map(u=><option value={u.id} key={u.id}>{u.full_name} · {u.email}</option>)}</select></div>
        <div><label>Amount GH₵</label><input type="number" min="0.01" step="0.01" value={payoutAmount} onChange={e=>setPayoutAmount(e.target.value)} placeholder="0.00" /></div>
        <div><label>Network</label><select value={network} onChange={e=>setNetwork(e.target.value)}>{networks.map(n=><option key={n}>{n}</option>)}</select></div>
        <div><label>Recipient MoMo number</label><input value={mobileNumber} onChange={e=>setMobileNumber(e.target.value)} placeholder="024XXXXXXX" /></div>
        <div style={{gridColumn:"span 3"}}><label>Reason / payout note</label><input value={payoutReason} onChange={e=>setPayoutReason(e.target.value)} placeholder="Reason for this payout" /></div>
        <button className="btn" disabled={busy||!payoutUser||!payoutAmount||!mobileNumber||!payoutReason} onClick={()=>act({action:"admin_payout",userId:payoutUser,amount:payoutAmount,network,mobileNumber,reason:payoutReason})}>Reserve funds & record payout</button>
      </div>
    </section>

    <section className="admin-card"><h2>Deposit or adjust a user's wallet</h2><p className="muted">Every wallet change is saved in the transaction history.</p>
      <div className="admin-form">
        <div><label>User</label><select value={userId} onChange={e=>setUserId(e.target.value)}><option value="">Select user</option>{data.users.map(u=><option value={u.id} key={u.id}>{u.full_name} · {u.email}</option>)}</select></div>
        <div><label>Action</label><select value={kind} onChange={e=>setKind(e.target.value)}><option value="deposit">Add money</option><option value="deduct">Deduct money</option></select></div>
        <div><label>Wallet type</label><select value={bucket} onChange={e=>setBucket(e.target.value)}><option value="withdrawable">Withdrawable</option><option value="bonus">Bonus funds</option></select></div>
        <div><label>Amount GH₵</label><input type="number" min="0.01" step="0.01" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0.00" /></div>
        <div style={{gridColumn:"span 3"}}><label>Reason</label><input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Reason for adjustment" /></div>
        <button className="btn" disabled={busy||!userId||!amount} onClick={()=>act({action:"adjust_wallet",userId,kind,bucket,amount,reason})}>Apply wallet change</button>
      </div>
    </section>

    <section className="admin-card"><h2>Registered users and wallet balances</h2><div className="tablewrap"><table className="table"><thead><tr><th>User</th><th>Email</th><th>Total</th><th>Withdrawable</th><th>Bonus</th></tr></thead><tbody>{data.users.map(u=><tr key={u.id}><td>{u.full_name} #{u.id}</td><td>{u.email}</td><td>{money(u.balance)}</td><td>{money(u.withdrawable_balance)}</td><td>{money(u.bonus_balance)}</td></tr>)}</tbody></table></div></section>

    <section className="admin-card"><h2>Deposit and withdrawal requests</h2><p className="notice">Verify each deposit in the receiving Mobile Money account before approving it. Approving a deposit credits the user's wallet. A submitted request alone is not proof of payment.</p><div className="tablewrap"><table className="table"><thead><tr><th>User</th><th>Type</th><th>Amount</th><th>Number / reference</th><th>Network</th><th>Status</th><th>Action</th></tr></thead><tbody>{data.requests.map(r=><tr key={r.id}><td>{r.full_name}<br/>{r.email}</td><td>{r.type}</td><td>{money(r.amount)}</td><td>{r.mobile_number||r.reference||"—"}</td><td>{r.network||"—"}</td><td>{r.status}</td><td>{r.status==="pending" ? <><button className="smallbtn greenbtn" onClick={()=>act({action:"review_request",id:r.id,status:"approved"})}>Approve</button><button className="smallbtn graybtn" onClick={()=>act({action:"review_request",id:r.id,status:"rejected"})}>Reject</button></> : "—"}</td></tr>)}</tbody></table></div></section>

    <section className="admin-card"><h2>Direct payout history</h2><div className="tablewrap"><table className="table"><thead><tr><th>Date</th><th>User</th><th>Amount</th><th>Destination</th><th>Reason</th><th>Status</th><th>Action</th></tr></thead><tbody>{(data.payouts||[]).map(p=><tr key={p.id}><td>{new Date(p.created_at).toLocaleString()}</td><td>{p.full_name}</td><td>{money(p.amount)}</td><td>{p.network}<br/>{p.mobile_number}</td><td>{p.reason}</td><td>{p.status}</td><td>{p.status==="pending"?<><button className="smallbtn greenbtn" onClick={()=>act({action:"review_payout",id:p.id,status:"sent",note:"Transfer confirmed by admin"})}>Mark sent</button><button className="smallbtn graybtn" onClick={()=>act({action:"review_payout",id:p.id,status:"failed",note:"Transfer not completed; funds returned"})}>Failed / refund</button></>:"—"}</td></tr>)}</tbody></table></div></section>

    <section className="admin-card"><h2>Create investment plan</h2><div className="admin-form">
      <div><label>Name</label><input value={plan.name} onChange={e=>setPlan({...plan,name:e.target.value})} /></div>
      <div><label>Minimum GH₵</label><input type="number" value={plan.minAmount} onChange={e=>setPlan({...plan,minAmount:e.target.value})} /></div>
      <div><label>Duration days</label><input type="number" value={plan.days} onChange={e=>setPlan({...plan,days:e.target.value})} /></div>
      <div><label>Projected return %</label><input type="number" value={plan.returnPercent} onChange={e=>setPlan({...plan,returnPercent:e.target.value})} /></div>
      <div style={{gridColumn:"span 3"}}><label>Description</label><input value={plan.description} onChange={e=>setPlan({...plan,description:e.target.value})} /></div>
      <button className="btn" onClick={()=>act({action:"create_plan",...plan})}>Create plan</button>
    </div>
    <div className="tablewrap"><table className="table"><thead><tr><th>Plan</th><th>Minimum</th><th>Days</th><th>Return</th><th>Status</th><th></th></tr></thead><tbody>{data.plans.map(p=><tr key={p.id}><td>{p.name}</td><td>{money(p.min_amount)}</td><td>{p.duration_days}</td><td>{p.return_percent}%</td><td>{p.active?"Active":"Paused"}</td><td><button className="smallbtn graybtn" onClick={()=>act({action:"toggle_plan",id:p.id,active:!p.active})}>{p.active?"Pause":"Activate"}</button></td></tr>)}</tbody></table></div></section>

    <section className="admin-card"><h2>Wallet transaction history</h2><div className="tablewrap"><table className="table"><thead><tr><th>Date</th><th>User</th><th>Action</th><th>Amount</th><th>Balance type</th><th>Reason</th></tr></thead><tbody>{data.transactions.map(t=><tr key={t.id}><td>{new Date(t.created_at).toLocaleString()}</td><td>{t.full_name}</td><td>{t.type}</td><td>{money(t.amount)}</td><td>{t.balance_type}</td><td>{t.admin_note||t.description}</td></tr>)}</tbody></table></div></section>
    {success&&<p className="success">{success}</p>}{error&&<p className="error">{error}</p>}
  </main>;
}