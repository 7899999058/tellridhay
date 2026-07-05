import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Mic, Check, ChevronRight, ChevronLeft, Download, Share2, MessageCircle, Mail, Copy, X,
  Plus, Search, Scale, BarChart3, BookOpen, Sparkles, Calendar, ArrowRight, RotateCcw,
  Settings, Lock, Building2, Briefcase, Heart, User, Receipt, Layers, ArrowLeftRight, Box, Tag, Camera
} from "lucide-react";

/* ===== Brand ===== */
const BURGUNDY = "#8A1E3C", BURGUNDY_DK = "#6E1430", GOLD = "#E0A82E", GOLD_BRIGHT = "#EFC34B";
const PAPER = "#F6F2EF", INK = "#241318", TINT = "#F3E1E7", SOFT = "#FBEFF2";
const HAIR = "#E9E0DC", EXP = "#C0492F", INC = "#1B7A60";

/* ===== Tally Prime groups (all 28 defaults) ===== */
const GROUPS = {
  "Capital Account": "liability", "Reserves & Surplus": "liability", "Loans (Liability)": "liability",
  "Secured Loans": "liability", "Unsecured Loans": "liability", "Bank OD A/c": "liability",
  "Current Liabilities": "liability", "Duties & Taxes": "liability", "Provisions": "liability",
  "Sundry Creditors": "liability", "Branch / Divisions": "liability", "Suspense A/c": "liability",
  "Fixed Assets": "asset", "Investments": "asset", "Current Assets": "asset", "Bank Accounts": "asset",
  "Cash-in-Hand": "asset", "Deposits (Asset)": "asset", "Loans & Advances (Asset)": "asset",
  "Stock-in-Hand": "asset", "Sundry Debtors": "asset", "Misc. Expenses (ASSET)": "asset",
  "Sales Accounts": "income", "Direct Incomes": "income", "Indirect Incomes": "income",
  "Purchase Accounts": "expense", "Direct Expenses": "expense", "Indirect Expenses": "expense",
};
const GROUP_NAMES = Object.keys(GROUPS);
const nature = (g) => GROUPS[g] || "asset";

/* ===== Account-type config ===== */
const TYPE_CFG = {
  business:   { label: "Business",   income: "Sales",             incomeGroup: "Sales Accounts",   capital: "Capital A/c",  plTitle: "Profit & Loss" },
  profession: { label: "Profession", income: "Professional Fees", incomeGroup: "Direct Incomes",    capital: "Capital A/c",  plTitle: "Income & Expenditure" },
  ngo:        { label: "NGO / Trust", income: "Donations",        incomeGroup: "Indirect Incomes",  capital: "Corpus Fund",  plTitle: "Income & Expenditure" },
  personal:   { label: "Personal",   income: "Income",            incomeGroup: "Indirect Incomes",  capital: "Capital A/c",  plTitle: "Income & Expenses" },
};

/* ===== Helpers ===== */
const todayISO = () => new Date().toISOString().slice(0, 10);
const FY_START = "2025-04-01";
const fmt = (n) => "₹" + Math.abs(Math.round(n)).toLocaleString("en-IN");
const pad = (n) => String(n).padStart(2, "0");
const titleCase = (s) => s.trim().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

/* ===== Nature analysis: asset vs expense vs stock ===== */
const ASSET_WORDS = ["laptop","computer","desktop","printer","furniture","table","chair","machine","machinery","equipment","vehicle","car","bike","scooter","land","building","property","air conditioner","camera","generator","tools","fixture","server"];
const EXPENSE_WORDS = ["rent","salary","salaries","wages","electricity","fuel","petrol","diesel","food","tea","snacks","stationery","internet","recharge","bill","repair","maintenance","commission","interest","charges","courier","postage","printing","travel","conveyance","cleaning"];
const STOCK_WORDS = ["goods","stock","raw material","raw materials","inventory","materials","merchandise"];
function classifyHead(text, fallback) {
  const t = text.toLowerCase();
  if (STOCK_WORDS.some(w => t.includes(w))) return { head: "Purchases", group: "Purchase Accounts", nature: "Stock / Purchase" };
  const isBill = EXPENSE_WORDS.some(w => t.includes(w));
  if (!isBill && ASSET_WORDS.some(w => t.includes(w))) {
    const found = ASSET_WORDS.find(w => t.includes(w));
    return { head: titleCase(found), group: "Fixed Assets", nature: "Fixed Asset" };
  }
  return { head: fallback || "Expenses", group: "Indirect Expenses", nature: "Expense" };
}

/* ===== Voice parser ===== */
const BANK_HINTS = ["bank","sbi","hdfc","icici","axis","kotak","upi","account","a/c"];
function parseAmount(t) {
  const m = t.replace(/,/g, "").match(/(\d+(\.\d+)?)\s*(k|thousand|lakh|lac|hundred)?/i);
  if (!m) return null;
  let n = parseFloat(m[1]); const u = (m[3] || "").toLowerCase();
  if (u === "k" || u === "thousand") n *= 1000; else if (u === "lakh" || u === "lac") n *= 100000; else if (u === "hundred") n *= 100;
  return Math.round(n);
}
function parseSpeech(raw, cfg) {
  const t = (raw || "").toLowerCase();
  const amount = parseAmount(t) || 0;
  const usesBank = BANK_HINTS.some(h => t.includes(h));
  const bankName = /sbi/.test(t) ? "SBI Bank A/c" : (usesBank ? "Bank A/c" : null);
  const cashOrBank = usesBank ? (bankName || "Bank A/c") : "Cash";
  const cbGroup = usesBank ? "Bank Accounts" : "Cash-in-Hand";
  const fromM = t.match(/from ([a-z0-9& ]+?)(?: for | as |,|$)/);
  const toM = t.match(/to ([a-z0-9& ]+?)(?: for | as |,|$)/);
  const forM = t.match(/(?:for|as) ([a-z0-9& ]+)$/);
  let type = "Payment", entries = [], party = "", narration = raw.trim(), natureLabel = "";

  if (/(received|got|receipt|donation|grant)/.test(t)) {
    type = "Receipt"; party = fromM ? titleCase(fromM[1]) : cfg.income;
    const head = /consult|fee|service/.test(t) ? cfg.income : (/(donation|grant)/.test(t) ? "Donations" : (party || cfg.income));
    entries = [{ ledger: cashOrBank, side: "dr", amount, group: cbGroup }, { ledger: head, side: "cr", amount, group: cfg.incomeGroup }];
    natureLabel = "Receipt / Income";
  } else if (/(cash sale|sales|sold)/.test(t)) {
    type = "Sales";
    entries = [{ ledger: cashOrBank, side: "dr", amount, group: cbGroup }, { ledger: "Sales", side: "cr", amount, group: "Sales Accounts" }];
    natureLabel = "Sales";
  } else if (/(deposit|withdraw)/.test(t)) {
    type = "Contra";
    entries = /deposit/.test(t)
      ? [{ ledger: bankName || "Bank A/c", side: "dr", amount, group: "Bank Accounts" }, { ledger: "Cash", side: "cr", amount, group: "Cash-in-Hand" }]
      : [{ ledger: "Cash", side: "dr", amount, group: "Cash-in-Hand" }, { ledger: bankName || "Bank A/c", side: "cr", amount, group: "Bank Accounts" }];
    natureLabel = "Contra (cash⇄bank)";
  } else {
    type = "Payment"; party = toM ? titleCase(toM[1]) : "";
    const cls = classifyHead(t, forM ? titleCase(forM[1]) : (party || "Expenses"));
    entries = [{ ledger: cls.head, side: "dr", amount, group: cls.group }, { ledger: cashOrBank, side: "cr", amount, group: cbGroup }];
    natureLabel = cls.nature;
  }
  return { type, entries, party, narration, amount, natureLabel };
}

/* ===== Document scan (vision) → voucher ===== */
async function scanDocument(dataUrl, mediaType, cfg, apiKey) {
  const base64 = dataUrl.split(",")[1];
  const prompt = `You are an accounting assistant for India. This image is a financial document — an invoice, receipt, payment voucher, cheque, or other document. Extract its details and reply with ONLY a JSON object (no prose, no markdown fences). Schema:
{"docType":"invoice|receipt|voucher|cheque|document|unknown","direction":"payment|receipt|purchase|sales|unknown","amount":<number: grand total in rupees, plain digits>,"party":"<vendor/payee/drawer name>","date":"YYYY-MM-DD","gst":<number or 0>,"gstin":"<string or empty>","description":"<short: what it is for>","paymentMode":"cash|bank|upi|cheque|credit|unknown","chequeNo":"<string or empty>","bank":"<bank name or empty>"}
Rules: amount = grand total, no commas or ₹. A supplier's tax invoice billed TO the reader => direction "purchase". A cheque => docType "cheque", paymentMode "cheque". Give date as YYYY-MM-DD. If unreadable, docType "unknown" and amount 0.`;
  const headers = { "Content-Type": "application/json" };
  if (apiKey) { headers["x-api-key"] = apiKey; headers["anthropic-version"] = "2023-06-01"; headers["anthropic-dangerous-direct-browser-access"] = "true"; }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST", headers,
    body: JSON.stringify({ model: "claude-sonnet-4-6", max_tokens: 1000, messages: [{ role: "user", content: [{ type: "image", source: { type: "base64", media_type: mediaType, data: base64 } }, { type: "text", text: prompt }] }] }),
  });
  const json = await res.json();
  const text = (json.content || []).filter(b => b.type === "text").map(b => b.text).join("").trim();
  const data = JSON.parse(text.replace(/```json|```/g, "").trim());
  return docToDraft(data, cfg, dataUrl);
}
function docToDraft(data, cfg, image) {
  const amount = Math.round(Number(data.amount) || 0);
  const party = (data.party || "").trim();
  const mode = (data.paymentMode || "unknown").toLowerCase();
  const dir = (data.direction || "").toLowerCase();
  const docType = (data.docType || "document").toLowerCase();
  const docLabel = docType.charAt(0).toUpperCase() + docType.slice(1);
  const desc = (data.description || "").trim();
  const cbLedger = mode === "cash" ? "Cash" : (data.bank && mode !== "upi" ? data.bank : "Bank A/c");
  const cbGroup = mode === "cash" ? "Cash-in-Hand" : "Bank Accounts";
  let type = "Payment", entries = [], natureLabel = "";
  const isIncome = dir === "receipt" || dir === "sales";
  if (docType === "cheque" || mode === "cheque") {
    const cls = classifyHead(desc || party, party || "Expenses");
    entries = [{ ledger: cls.head, side: "dr", amount, group: cls.group }, { ledger: data.bank || "Bank A/c", side: "cr", amount, group: "Bank Accounts" }];
    natureLabel = "Cheque payment";
  } else if (isIncome) {
    type = (docType === "invoice" && dir === "sales") ? "Sales" : "Receipt";
    const inLedger = dir === "sales" ? "Sales" : (party || cfg.income);
    const inGroup = dir === "sales" ? "Sales Accounts" : cfg.incomeGroup;
    const drLedger = mode === "credit" ? (party || "Sundry Debtors") : cbLedger;
    const drGroup = mode === "credit" ? "Sundry Debtors" : cbGroup;
    entries = [{ ledger: drLedger, side: "dr", amount, group: drGroup }, { ledger: inLedger, side: "cr", amount, group: inGroup }];
    natureLabel = dir === "sales" ? "Sales" : "Receipt / Income";
  } else {
    const cls = classifyHead(desc || party, party || "Expenses");
    const crLedger = mode === "credit" ? (party || "Sundry Creditors") : cbLedger;
    const crGroup = mode === "credit" ? "Sundry Creditors" : cbGroup;
    entries = [{ ledger: cls.head, side: "dr", amount, group: cls.group }, { ledger: crLedger, side: "cr", amount, group: crGroup }];
    natureLabel = cls.nature;
  }
  const narration = [docLabel, party].filter(Boolean).join(" — ") + (desc ? `: ${desc}` : "") + (data.chequeNo ? ` (Cheque ${data.chequeNo})` : "") + (data.gst ? ` incl. GST ₹${Math.round(data.gst)}` : "");
  const date = data.date && /^\d{4}-\d{2}-\d{2}$/.test(data.date) ? data.date : null;
  return { type, entries, party, narration, amount, natureLabel, source: "photo", image, docLabel, date };
}

/* ===== Seed data ===== */
const seedLedgers = [
  { name: "Capital A/c", group: "Capital Account", opening: -55000 },
  { name: "SBI Bank A/c", group: "Bank Accounts", opening: 40000 },
  { name: "Cash", group: "Cash-in-Hand", opening: 15000 },
  { name: "Sales", group: "Sales Accounts", opening: 0 },
  { name: "Consulting Income", group: "Indirect Incomes", opening: 0 },
  { name: "Office Expenses", group: "Indirect Expenses", opening: 0 },
  { name: "Travelling Exp", group: "Indirect Expenses", opening: 0 },
  { name: "Computer", group: "Fixed Assets", opening: 0 },
];
const mkV = (id, date, type, narration, dr, cr, amount) => ({ id, date, type, narration, entries: [{ ledger: dr, side: "dr", amount }, { ledger: cr, side: "cr", amount }] });
const seedVouchers = [
  mkV("s1", "2025-06-10", "Receipt", "Consulting fees — Janani Society", "SBI Bank A/c", "Consulting Income", 12000),
  mkV("s2", "2025-06-12", "Sales", "Cash sales", "Cash", "Sales", 5000),
  mkV("s3", "2025-06-12", "Payment", "Office supplies — Sharma Stationers", "Office Expenses", "Cash", 1200),
  mkV("s4", "2025-06-15", "Payment", "Fuel — site visit", "Travelling Exp", "Cash", 2000),
  mkV("s5", "2025-06-18", "Payment", "Bought computer", "Computer", "SBI Bank A/c", 30000),
];

/* ===== Balance engine ===== */
function computeBalances(ledgers, vouchers) {
  const bal = {}; ledgers.forEach(l => { bal[l.name] = l.opening || 0; });
  vouchers.forEach(vc => vc.entries.forEach(e => { if (!(e.ledger in bal)) bal[e.ledger] = 0; bal[e.ledger] += e.side === "dr" ? e.amount : -e.amount; }));
  return bal;
}

/* ===== Tally XML ===== */
const esc = (s) => String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const tallyDate = (iso) => { const [y,m,d]=iso.split("-"); return `${y}${m}${d}`; };
function buildTallyXML({ ledgers, vouchers, scope, from, to, company = "TellRidhay" }) {
  const inRange = vouchers.filter(v => v.date >= from && v.date <= to);
  const used = new Set(); inRange.forEach(v => v.entries.forEach(e => used.add(e.ledger)));
  const masters = ledgers.filter(l => scope === "masters" ? true : used.has(l.name) || scope === "both");
  let msgs = "";
  if (scope === "masters" || scope === "both") masters.forEach(l => {
    msgs += `\n   <TALLYMESSAGE xmlns:UDF="TallyUDF">\n    <LEDGER NAME="${esc(l.name)}" ACTION="Create">\n     <PARENT>${esc(l.group)}</PARENT>\n     <OPENINGBALANCE>${(-(l.opening||0)).toFixed(2)}</OPENINGBALANCE>\n    </LEDGER>\n   </TALLYMESSAGE>`;
  });
  if (scope === "vouchers" || scope === "both") inRange.forEach(v => {
    let le = ""; v.entries.forEach(e => {
      le += `\n     <ALLLEDGERENTRIES.LIST>\n      <LEDGERNAME>${esc(e.ledger)}</LEDGERNAME>\n      <ISDEEMEDPOSITIVE>${e.side==="dr"?"Yes":"No"}</ISDEEMEDPOSITIVE>\n      <AMOUNT>${(e.side==="dr"?-e.amount:e.amount).toFixed(2)}</AMOUNT>\n     </ALLLEDGERENTRIES.LIST>`;
    });
    msgs += `\n   <TALLYMESSAGE xmlns:UDF="TallyUDF">\n    <VOUCHER VCHTYPE="${esc(v.type)}" ACTION="Create">\n     <DATE>${tallyDate(v.date)}</DATE>\n     <VOUCHERTYPENAME>${esc(v.type)}</VOUCHERTYPENAME>\n     <NARRATION>${esc(v.narration||"")}</NARRATION>${le}\n    </VOUCHER>\n   </TALLYMESSAGE>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE>\n <HEADER>\n  <TALLYREQUEST>Import Data</TALLYREQUEST>\n </HEADER>\n <BODY>\n  <IMPORTDATA>\n   <REQUESTDESC>\n    <REPORTNAME>${scope==="vouchers"?"Vouchers":"All Masters"}</REPORTNAME>\n    <STATICVARIABLES><SVCURRENTCOMPANY>${esc(company)}</SVCURRENTCOMPANY></STATICVARIABLES>\n   </REQUESTDESC>\n   <REQUESTDATA>${msgs}\n   </REQUESTDATA>\n  </IMPORTDATA>\n </BODY>\n</ENVELOPE>`;
}

/* ===== Persistence ===== */
const STORE_KEY = "tellridhay:v1";
async function loadState(){
  try{ if(typeof window!=="undefined"&&window.storage){const r=await window.storage.get(STORE_KEY); if(r&&r.value)return JSON.parse(r.value);} }catch(e){}
  try{ const s=localStorage.getItem(STORE_KEY); if(s) return JSON.parse(s); }catch(e){}
  return null;
}
async function saveState(s){
  try{ if(typeof window!=="undefined"&&window.storage){ await window.storage.set(STORE_KEY, JSON.stringify(s)); return; } }catch(e){}
  try{ localStorage.setItem(STORE_KEY, JSON.stringify(s)); }catch(e){}
}

/* ===== Logo ===== */
function Logo({ size = 28, variant = "light" }) {
  const id = "g" + variant + size;
  const stops = variant === "dark" ? [GOLD_BRIGHT, GOLD] : ["#B23A57", BURGUNDY_DK];
  const c = variant === "dark" ? GOLD : BURGUNDY;
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={stops[0]} /><stop offset="1" stopColor={stops[1]} /></linearGradient></defs>
      {/* R monogram */}
      <path d="M15 11h11.5c5 0 8.5 3.1 8.5 7.8 0 3.6-2.1 6.3-5.4 7.4L36 37h-6.6l-5.2-9.4H21V37h-6V11Zm6 5.2v6.6h5c2.2 0 3.6-1.3 3.6-3.3 0-2-1.4-3.3-3.6-3.3h-5Z" fill={`url(#${id})`} />
      {/* voice spark */}
      <circle cx="38.5" cy="13.5" r="2.6" fill={variant === "dark" ? GOLD_BRIGHT : GOLD} />
    </svg>
  );
}
function Wordmark({ variant = "light", size = 18 }) {
  const c = variant === "dark" ? GOLD : BURGUNDY;
  return (<span style={{ fontSize: size, color: c }} className="font-bold tracking-tight">Tell<span style={{ color: variant === "dark" ? GOLD_BRIGHT : BURGUNDY }}>Ridhay</span></span>);
}

function Money({ n, kind }) {
  const c = kind === "e" ? EXP : kind === "i" ? INC : INK;
  return <span style={{ color: c }} className="font-mono font-semibold tabular-nums">{fmt(n)}</span>;
}

/* ================================================================= */
export default function App() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("auth");
  const [tab, setTab] = useState("speak");
  const [report, setReport] = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  const [user, setUser] = useState(null);
  const [ledgers, setLedgers] = useState(seedLedgers);
  const [vouchers, setVouchers] = useState(seedVouchers);
  const [settings, setSettings] = useState({ accountType: "business", mode: "complete", wakeOnLock: false, lang: "en-IN" });

  useEffect(() => { (async () => {
    const s = await loadState();
    if (s) { setUser(s.user||null); setLedgers(s.ledgers||seedLedgers); setVouchers(s.vouchers||seedVouchers); setSettings(s.settings||settings); if (s.user) setView("app"); }
    setReady(true);
  })(); }, []);
  useEffect(() => { if (ready) saveState({ user, ledgers, vouchers, settings }); }, [user, ledgers, vouchers, settings, ready]);

  const cfg = TYPE_CFG[settings.accountType];
  const balances = useMemo(() => computeBalances(ledgers, vouchers), [ledgers, vouchers]);
  const todayStats = useMemo(() => {
    const t = todayISO(); let spent = 0, recv = 0;
    vouchers.filter(v => v.date === t).forEach(v => { const a = v.entries[0]?.amount||0; if (["Payment","Purchase"].includes(v.type)) spent+=a; if (["Receipt","Sales"].includes(v.type)) recv+=a; });
    return { spent, recv };
  }, [vouchers]);

  function addVoucher(draft) {
    setLedgers(prev => { const names=new Set(prev.map(l=>l.name)); const add=[]; draft.entries.forEach(e=>{ if(!names.has(e.ledger)) add.push({name:e.ledger,group:e.group||"Indirect Expenses",opening:0}); }); return add.length?[...prev,...add]:prev; });
    setVouchers(prev => [{ id:"v"+Date.now(), date:draft.date||todayISO(), type:draft.type, narration:draft.narration, entries:draft.entries.map(({ledger,side,amount})=>({ledger,side,amount})) }, ...prev]);
  }

  if (!ready) return <div style={{ background: PAPER }} className="min-h-screen grid place-items-center text-stone-400">Loading…</div>;

  return (
    <div style={{ background: "#EAE3DF" }} className="min-h-screen w-full flex justify-center p-3">
      <div style={{ background: PAPER, color: INK }} className="w-full max-w-[420px] rounded-[28px] overflow-hidden shadow-2xl flex flex-col relative">
        {view === "auth" && <Auth onGoogle={() => { setUser({ name:"You", via:"Google" }); setView("onboard"); }} onMobile={() => setView("otp")} />}
        {view === "otp" && <Otp onBack={() => setView("auth")} onDone={() => { setUser({ name:"You", via:"Mobile" }); setView("onboard"); }} />}
        {view === "onboard" && <Onboard settings={settings} setSettings={setSettings} onNext={(needSetup) => setView(needSetup ? "setup" : "app")} />}
        {view === "setup" && <Setup ledgers={ledgers} setLedgers={setLedgers} onDone={() => setView("app")} />}
        {view === "app" && (
          <AppShell
            tab={tab} setTab={(t)=>{setReport(null);setTab(t);}} report={report} setReport={setReport}
            ledgers={ledgers} vouchers={vouchers} balances={balances} todayStats={todayStats} addVoucher={addVoucher}
            settings={settings} cfg={cfg} openSettings={() => setShowSettings(true)}
          />
        )}
        {showSettings && view === "app" && (
          <SettingsSheet settings={settings} setSettings={setSettings} onClose={() => setShowSettings(false)}
            onReset={() => { setLedgers(seedLedgers); setVouchers(seedVouchers); }} />
        )}
      </div>
    </div>
  );
}

/* ===== Auth ===== */
function Auth({ onGoogle, onMobile }) {
  const [mobile, setMobile] = useState("");
  return (
    <div className="p-6 flex flex-col min-h-[640px]">
      <div className="text-center pt-10 pb-7">
        <div className="mx-auto mb-4 w-16 h-16 rounded-2xl grid place-items-center" style={{ background: SOFT }}><Logo size={40} /></div>
        <Wordmark size={26} />
        <p className="text-stone-500 text-sm mt-2">Tell Ridhay. It keeps your books.</p>
      </div>
      <button onClick={onGoogle} className="w-full bg-white border rounded-xl py-3.5 font-semibold text-sm flex items-center justify-center gap-2.5 active:scale-[.99] transition" style={{ borderColor: HAIR }}>
        <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.9a5 5 0 0 1-2.2 3.3v2.7h3.6c2.1-1.9 3.2-4.8 3.2-7.8Z"/><path fill="#34A853" d="M12 23c2.9 0 5.4-1 7.2-2.6l-3.6-2.7c-1 .7-2.3 1.1-3.6 1.1-2.8 0-5.1-1.9-6-4.4H2.3v2.8A11 11 0 0 0 12 23Z"/><path fill="#FBBC05" d="M6 14.4a6.6 6.6 0 0 1 0-4.2V7.4H2.3a11 11 0 0 0 0 9.8L6 14.4Z"/><path fill="#EA4335" d="M12 5.6c1.6 0 3 .5 4.1 1.6l3.1-3.1A11 11 0 0 0 2.3 7.4L6 10.2C6.9 7.6 9.2 5.6 12 5.6Z"/></svg>
        Continue with Google
      </button>
      <div className="flex items-center gap-2.5 text-stone-400 text-xs my-4"><div className="flex-1 h-px" style={{ background: HAIR }} />or use mobile<div className="flex-1 h-px" style={{ background: HAIR }} /></div>
      <div className="bg-white border rounded-xl px-3.5 py-3 flex items-center mb-3" style={{ borderColor: HAIR }}>
        <span className="text-stone-400 text-sm">+91</span>
        <input value={mobile} onChange={e=>setMobile(e.target.value.replace(/\D/g,"").slice(0,10))} placeholder="98765 43210" className="flex-1 outline-none ml-2.5 text-[15px] bg-transparent" inputMode="numeric" />
      </div>
      <button onClick={onMobile} disabled={mobile.length<10} style={{ background: mobile.length<10?"#C9A9B2":BURGUNDY }} className="w-full text-white rounded-xl py-3.5 font-semibold text-sm transition active:scale-[.99]">Send OTP</button>
      <div className="mt-auto pt-6 grid grid-cols-2 gap-2">
        <BrandSwatch variant="light" /><BrandSwatch variant="dark" />
      </div>
    </div>
  );
}
function BrandSwatch({ variant }) {
  const dark = variant === "dark";
  return (
    <div className="rounded-xl p-3 flex items-center gap-2 border" style={{ background: dark ? "#1c1116" : "#fff", borderColor: dark ? "#2c1a20" : HAIR }}>
      <Logo size={22} variant={variant} /><Wordmark size={13} variant={variant} />
    </div>
  );
}

function Otp({ onBack, onDone }) {
  const [code, setCode] = useState("");
  return (
    <div className="p-6 flex flex-col min-h-[640px]">
      <button onClick={onBack} className="text-stone-500 flex items-center gap-1 text-sm mb-6 mt-2"><ChevronLeft size={18}/>Back</button>
      <h2 className="text-2xl font-bold tracking-tight">Enter the code</h2>
      <p className="text-stone-500 text-sm mt-1.5 mb-6">Sent to <b className="text-stone-800">+91 98765 43210</b></p>
      <input autoFocus value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,"").slice(0,6))} placeholder="• • • • • •" inputMode="numeric" className="w-full text-center tracking-[0.5em] text-2xl font-mono bg-white border rounded-xl py-4 outline-none mb-5" style={{ borderColor: HAIR }} />
      <button onClick={onDone} disabled={code.length<4} style={{ background: code.length<4?"#C9A9B2":BURGUNDY }} className="w-full text-white rounded-xl py-3.5 font-semibold text-sm active:scale-[.99] transition">Verify &amp; continue</button>
      <div className="mt-6 rounded-xl p-3 text-[11.5px] leading-relaxed" style={{ background: SOFT, color: BURGUNDY }}>🔒 Your books stay private to your account. (Demo: enter any 4–6 digits.)</div>
    </div>
  );
}

/* ===== Onboarding: account type + mode ===== */
function Onboard({ settings, setSettings, onNext }) {
  const [step, setStep] = useState(0);
  const [setupChoice, setSetupChoice] = useState("auto");
  const types = [
    { id: "business", icon: <Building2 size={18} />, label: "Business", sub: "Trading / shop / company" },
    { id: "profession", icon: <Briefcase size={18} />, label: "Profession", sub: "CA, doctor, consultant, freelancer" },
    { id: "ngo", icon: <Heart size={18} />, label: "NGO / Trust", sub: "Society, trust, charitable body" },
    { id: "personal", icon: <User size={18} />, label: "Personal", sub: "Household / personal money" },
  ];
  const modes = [
    { id: "complete", icon: <Layers size={18} />, label: "Do complete accounts here", sub: "Full double-entry → P&L, Balance Sheet, the works." },
    { id: "rnp", icon: <ArrowLeftRight size={18} />, label: "Only record receipts & payments", sub: "You use other software. Here just capture cash/bank in & out, then export." },
  ];
  const Choice = ({ sel, id, icon, label, sub, onPick }) => (
    <button onClick={() => onPick(id)} style={sel===id?{borderColor:BURGUNDY,background:SOFT}:{borderColor:HAIR}} className="w-full text-left border-[1.5px] rounded-2xl p-4 mb-3 bg-white transition flex items-start gap-3">
      <span className="w-9 h-9 rounded-xl grid place-items-center shrink-0" style={{ background: sel===id?BURGUNDY:TINT, color: sel===id?"#fff":BURGUNDY }}>{icon}</span>
      <div className="flex-1"><div className="font-bold text-[14.5px]">{label}</div><div className="text-stone-500 text-xs mt-0.5 leading-snug">{sub}</div></div>
      <span style={sel===id?{borderColor:BURGUNDY,background:BURGUNDY,boxShadow:"inset 0 0 0 3px #fff"}:{borderColor:HAIR}} className="w-5 h-5 rounded-full border-2 mt-1 shrink-0" />
    </button>
  );
  return (
    <div className="p-6 flex flex-col min-h-[640px]">
      <div className="flex items-center gap-2 mb-1"><Logo size={22} /><Wordmark size={15} /></div>
      <p className="text-[10px] font-semibold tracking-widest uppercase text-stone-400 mt-4 mb-2">Set up · step {step+1} of 2</p>
      {step === 0 ? (<>
        <h2 className="text-[22px] font-bold tracking-tight leading-tight">What are you keeping accounts for?</h2>
        <p className="text-stone-500 text-sm mt-1.5 mb-4">Tailors your ledgers and report titles.</p>
        {types.map(t => <Choice key={t.id} sel={settings.accountType} {...t} onPick={(id)=>setSettings(s=>({...s,accountType:id}))} />)}
        <button onClick={()=>setStep(1)} style={{ background: BURGUNDY }} className="w-full text-white rounded-xl py-3.5 font-semibold text-sm mt-1 active:scale-[.99] transition">Next</button>
      </>) : (<>
        <h2 className="text-[22px] font-bold tracking-tight leading-tight">How will you use TellRidhay?</h2>
        <p className="text-stone-500 text-sm mt-1.5 mb-4">You can switch this later in Settings.</p>
        {modes.map(m => <Choice key={m.id} sel={settings.mode} {...m} onPick={(id)=>setSettings(s=>({...s,mode:id}))} />)}
        <div className="rounded-xl p-3 mb-3 text-[11.5px] leading-relaxed" style={{ background: TINT, color: BURGUNDY_DK }}>
          Then: <b>create ledgers now</b> or <b>let TellRidhay create them as you speak</b>?
          <div className="flex gap-2 mt-2">
            {[["auto","As I go"],["define","I'll name them"]].map(([id,lb])=>(
              <button key={id} onClick={()=>setSetupChoice(id)} style={setupChoice===id?{background:BURGUNDY,color:"#fff"}:{background:"#fff",color:BURGUNDY}} className="flex-1 rounded-lg py-2 text-xs font-semibold border" >{lb}</button>
            ))}
          </div>
        </div>
        <button onClick={()=>onNext(setupChoice==="define")} style={{ background: BURGUNDY }} className="w-full text-white rounded-xl py-3.5 font-semibold text-sm active:scale-[.99] transition">Start using TellRidhay</button>
      </>)}
    </div>
  );
}

/* ===== Ledger setup ===== */
function Setup({ ledgers, setLedgers, onDone }) {
  const [name, setName] = useState(""); const [group, setGroup] = useState("Indirect Expenses");
  const grouped = useMemo(() => { const g={}; ledgers.forEach(l=>{(g[l.group]=g[l.group]||[]).push(l);}); return g; }, [ledgers]);
  return (
    <div className="flex flex-col min-h-[640px]">
      <Header title="Add ledgers" />
      <div className="px-4 flex-1 overflow-y-auto">
        <p className="text-stone-500 text-xs mb-3">Grouped as per Tally Prime.</p>
        {Object.entries(grouped).map(([g,ls])=>(
          <div key={g} className="mb-3"><p className="text-[11px] font-semibold text-stone-500 mb-1.5">{g}</p>
            {ls.map(l=>(<div key={l.name} className="bg-white border rounded-xl px-3 py-2.5 mb-1.5 flex items-center justify-between" style={{borderColor:HAIR}}><span className="text-sm font-semibold">{l.name}</span>{l.opening?<span className="text-[11px] text-stone-400 font-mono">Op. {fmt(l.opening)}</span>:null}</div>))}
          </div>
        ))}
        <div className="bg-white border rounded-2xl p-3 mt-2" style={{borderColor:HAIR}}>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="New ledger name" className="w-full outline-none text-sm border rounded-lg px-3 py-2.5 mb-2" style={{borderColor:HAIR}} />
          <select value={group} onChange={e=>setGroup(e.target.value)} className="w-full text-sm border rounded-lg px-3 py-2.5 mb-2 bg-white" style={{borderColor:HAIR}}>{GROUP_NAMES.map(g=><option key={g}>{g}</option>)}</select>
          <button onClick={()=>{if(name.trim()){setLedgers(p=>[...p,{name:name.trim(),group,opening:0}]);setName("");}}} style={{color:BURGUNDY,background:TINT}} className="w-full rounded-lg py-2.5 font-semibold text-sm flex items-center justify-center gap-1.5"><Plus size={16}/>Add ledger</button>
        </div>
      </div>
      <div className="p-4"><button onClick={onDone} style={{background:BURGUNDY}} className="w-full text-white rounded-xl py-3.5 font-semibold text-sm active:scale-[.99] transition">Done — start using</button></div>
    </div>
  );
}

function Header({ title, right }) {
  return (<div className="px-4 pt-5 pb-3 flex items-center justify-between shrink-0">
    <div className="flex items-center gap-2"><Logo size={26} /><b className="text-[15px]">{title}</b></div>{right}
  </div>);
}

/* ===== App shell ===== */
function AppShell({ tab, setTab, report, setReport, ledgers, vouchers, balances, todayStats, addVoucher, settings, cfg, openSettings }) {
  return (
    <div className="flex flex-col min-h-[660px]">
      <div className="flex-1 overflow-y-auto">
        {report === "pl" ? <ProfitLoss ledgers={ledgers} balances={balances} cfg={cfg} onBack={()=>setReport(null)} />
          : report === "bs" ? <BalanceSheet ledgers={ledgers} balances={balances} onBack={()=>setReport(null)} />
          : report === "tb" ? <TrialBalance ledgers={ledgers} balances={balances} onBack={()=>setReport(null)} />
          : report === "rnp" ? <ReceiptsPayments ledgers={ledgers} vouchers={vouchers} onBack={()=>setReport(null)} />
          : report === "export" ? <ExportTally ledgers={ledgers} vouchers={vouchers} onBack={()=>setReport(null)} />
          : tab === "speak" ? <Speak todayStats={todayStats} addVoucher={addVoucher} cfg={cfg} settings={settings} openSettings={openSettings} />
          : tab === "ledgers" ? <Ledgers ledgers={ledgers} balances={balances} />
          : tab === "daybook" ? <DayBook vouchers={vouchers} />
          : <Reports setReport={setReport} settings={settings} cfg={cfg} />}
      </div>
      <Nav tab={tab} setTab={setTab} report={report} />
    </div>
  );
}

function Nav({ tab, setTab, report }) {
  const items = [
    { id:"speak", label:"Speak", icon:<path d="M3 12h7l2-4 3 8 2-4h4"/> },
    { id:"ledgers", label:"Ledgers", icon:<><path d="M4 4h12a2 2 0 0 1 2 2v14H6a2 2 0 0 1-2-2Z"/><path d="M8 8h6M8 12h6"/></> },
    { id:"daybook", label:"Day Book", icon:<><rect x="4" y="4" width="16" height="6" rx="1"/><rect x="4" y="13" width="16" height="7" rx="1"/></> },
    { id:"reports", label:"Reports", icon:<path d="M6 20v-7M12 20V6M18 20v-10"/> },
  ];
  const active = (id) => !report && tab === id;
  return (<div className="flex bg-white border-t px-2 pt-1.5 pb-2 shrink-0" style={{ borderColor: HAIR }}>
    {items.map(it=>(<button key={it.id} onClick={()=>setTab(it.id)} className="flex-1 flex flex-col items-center gap-0.5 py-1.5" style={{ color: active(it.id)?BURGUNDY:"#9CA3AF" }}>
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{it.icon}</svg>
      <span className="text-[10px] font-medium">{it.label}</span></button>))}
  </div>);
}

/* ===== Speak ===== */
function Speak({ todayStats, addVoucher, cfg, settings, openSettings }) {
  const [listening, setListening] = useState(false); const [showEx, setShowEx] = useState(false);
  const [draft, setDraft] = useState(null); const [manual, setManual] = useState(""); const [supported, setSupported] = useState(true);
  const [wakeOn, setWakeOn] = useState(false); const [wakeState, setWakeState] = useState("idle"); // idle|armed|heard|capturing
  const recRef = useRef(null); const wakeRef = useRef(null); const wakeOnRef = useRef(false); const capturingRef = useRef(false);
  const cfgRef = useRef(cfg); useEffect(()=>{ cfgRef.current = cfg; }, [cfg]);
  const [scanning, setScanning] = useState(false); const [scanErr, setScanErr] = useState("");
  const fileRef = useRef(null);
  const SR = (typeof window!=="undefined") && (window.SpeechRecognition||window.webkitSpeechRecognition);
  const isNative = (typeof window!=="undefined") && window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  async function nativeCapture(){
    try{
      const { SpeechRecognition: N } = await import("@capacitor-community/speech-recognition");
      const perm = await N.requestPermissions(); if(perm && perm.speechRecognition==="denied"){ setScanErr("Microphone permission denied."); return; }
      setListening(true);
      const res = await N.start({ language: settings.lang||"en-IN", maxResults: 1, partialResults: false, popup: false });
      const text = res && res.matches && res.matches[0];
      handleEntryText(text||"");
    }catch(e){ setListening(false); }
  }
  const WAKE_RE = /hey\s+rid+h?[ae]?y?/i; // "hey ridhay" + common mishears

  function handleEntryText(text){
    capturingRef.current=false; setListening(false); setWakeState(wakeOnRef.current?"armed":"idle");
    const tx=(text||"").trim(); if(tx){ setManual(tx); setDraft(parseSpeech(tx, cfgRef.current)); }
  }
  function startCapture(){ if(!recRef.current) return; try{ capturingRef.current=true; setListening(true); recRef.current.start(); }catch(e){} }
  function stopWake(updateState=true){ try{ wakeRef.current && wakeRef.current.stop(); }catch(e){} if(updateState) setWakeState("idle"); }
  function startWake(){
    if(!SR){ setSupported(false); return; }
    try{
      const w=new SR(); w.lang=settings.lang||"en-IN"; w.continuous=true; w.interimResults=true;
      w.onresult=(e)=>{ if(capturingRef.current) return;
        let txt=""; for(let i=e.resultIndex;i<e.results.length;i++){ txt+=e.results[i][0].transcript+" "; }
        const m=txt.match(WAKE_RE);
        if(m){ const after=txt.slice(txt.toLowerCase().indexOf(m[0].toLowerCase())+m[0].length).trim();
          stopWake(false); setWakeState("heard");
          if(after && /\d/.test(after)) setTimeout(()=>handleEntryText(after),200);
          else { setWakeState("capturing"); setTimeout(startCapture,280); }
        }
      };
      w.onerror=()=>{};
      w.onend=()=>{ if(wakeOnRef.current && !capturingRef.current){ try{ w.start(); }catch(e){} } };
      wakeRef.current=w; w.start(); setWakeState("armed");
    }catch(e){ setSupported(false); }
  }
  function toggleWake(){ if(!supported) return; const next=!wakeOn; setWakeOn(next); wakeOnRef.current=next; if(next) startWake(); else stopWake(true); }

  useEffect(() => {
    if (!SR) { if(!isNative) setSupported(false); return; }
    const r = new SR(); r.lang = settings.lang||"en-IN"; r.interimResults=false; r.maxAlternatives=1;
    r.onresult = (e)=>{ handleEntryText(e.results[0][0].transcript); };
    r.onerror = ()=>{ setListening(false); capturingRef.current=false;
      if(wakeOnRef.current){ setWakeState("armed"); setTimeout(()=>{ try{ wakeRef.current?wakeRef.current.start():startWake(); }catch(e){} },300); } else setWakeState("idle"); };
    r.onend = ()=>{ setListening(false); };
    recRef.current = r;
    return ()=>{ try{ r.abort(); }catch(e){} };
  }, [SR, settings.lang]);

  useEffect(()=>{
    if(!draft && wakeOnRef.current && !capturingRef.current){ const id=setTimeout(()=>{ try{ wakeRef.current?wakeRef.current.start():startWake(); }catch(e){} },350); return ()=>clearTimeout(id); }
    if(draft){ try{ wakeRef.current && wakeRef.current.stop(); }catch(e){} }
  }, [draft]);
  useEffect(()=>()=>{ wakeOnRef.current=false; try{ wakeRef.current && wakeRef.current.abort(); }catch(e){} }, []);

  function tapMic(){ setShowEx(false); if(isNative){ nativeCapture(); return; } if(!supported) return; stopWake(false); startCapture(); }
  function runManual(){ if(manual.trim()) setDraft(parseSpeech(manual, cfgRef.current)); }
  function openCamera(){ setShowEx(false); setScanErr(""); if(fileRef.current) fileRef.current.click(); }
  async function onFile(e){
    const f = e.target.files && e.target.files[0]; e.target.value=""; if(!f) return;
    let dataUrl; try{ dataUrl = await new Promise((res,rej)=>{const r=new FileReader();r.onload=()=>res(r.result);r.onerror=rej;r.readAsDataURL(f);}); }catch(err){ setScanErr("Couldn't read that image."); return; }
    setScanErr(""); setScanning(true);
    try{ const dr = await scanDocument(dataUrl, f.type||"image/jpeg", cfgRef.current, settings.scanKey); setScanning(false); setDraft(dr); }
    catch(err){ setScanning(false); setScanErr(settings.scanKey ? "Couldn't scan that — try a sharper, well-lit photo, or type the entry." : "Scanning needs an AI key here — add one in Settings → Document scan, or type the entry."); }
  }
  if (draft) return <Review draft={draft} heard={manual} onCancel={()=>{setDraft(null);setManual("");}} onSave={(d)=>{addVoucher(d);setDraft(null);setManual("");}} />;
  const examples = [
    ["Paid 1,200 to Sharma Stationers for office supplies","Payment · Expense"],
    ["Bought laptop 55,000 by SBI bank","Payment · Fixed Asset"],
    [`Received 12,000 from Janani as ${cfg.income.toLowerCase()}`,"Receipt · Income"],
    ["Cash sales 5,000","Sales"],
  ];
  return (
    <div className="flex flex-col min-h-[600px] relative">
      <Header title="TellRidhay" right={<div className="flex items-center gap-2">
        <span className="text-[11px] font-semibold px-2.5 py-1.5 rounded-full" style={{background:TINT,color:BURGUNDY}}>{cfg.label}</span>
        <button onClick={openSettings} className="text-stone-400"><Settings size={20}/></button>
      </div>} />
      <div className="px-4">
        <div className="bg-white border rounded-2xl px-4 py-3.5 flex justify-between items-end" style={{borderColor:HAIR}}>
          <div><div className="text-[11px] text-stone-500">Paid today</div><div className="text-[22px]"><Money n={todayStats.spent} kind="e"/></div></div>
          <div className="text-right"><div className="text-[11px] text-stone-500">Received</div><div className="text-[22px]"><Money n={todayStats.recv} kind="i"/></div></div>
        </div>
      </div>
      <div className="flex flex-col items-center pt-7 pb-4">
        <button onClick={tapMic} style={{background:BURGUNDY,boxShadow:`0 12px 30px -8px ${BURGUNDY}99`}} className="w-[104px] h-[104px] rounded-full grid place-items-center text-white relative active:scale-95 transition">
          {(listening || wakeState==="armed" || wakeState==="heard" || wakeState==="capturing") && <span style={{borderColor:GOLD}} className="absolute -inset-2 rounded-full border-2 animate-ping"/>}
          <Mic size={40}/>
        </button>
        <div className="mt-4 font-bold text-[16px]">{listening?"Listening…":wakeState==="heard"?"Heard you!":wakeState==="capturing"?"Go ahead…":wakeOn?"Say “Hey Ridhay”":"Tap & speak"}</div>
        <div className="text-stone-500 text-xs mt-1">{!supported?"voice not available here — type below":wakeOn?"wake word on — or just tap":'tap the mic, or turn on “Hey Ridhay”'}</div>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        <button onClick={openCamera} className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold active:scale-[.98] transition" style={{background:BURGUNDY,color:"#fff",boxShadow:`0 8px 20px -8px ${BURGUNDY}88`}}>
          <Camera size={18}/> Scan invoice · receipt · cheque
        </button>
        <div className="flex flex-col items-center gap-2 mt-2">
          <button onClick={toggleWake} disabled={!SR} style={{background:wakeOn?BURGUNDY:TINT,color:wakeOn?"#fff":BURGUNDY,opacity:SR?1:.5}} className="text-xs font-semibold px-3.5 py-2 rounded-full flex items-center gap-2">
            <span className="relative flex h-2 w-2">{wakeOn && <span style={{background:GOLD}} className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"/>}<span style={{background:wakeOn?GOLD:BURGUNDY}} className="relative inline-flex rounded-full h-2 w-2"/></span>
            {wakeOn?'Listening for “Hey Ridhay”':(!SR&&isNative)?'“Hey Ridhay” wake — coming to APK':'Enable “Hey Ridhay” wake'}
          </button>
          <button onClick={()=>setShowEx(true)} style={{background:TINT,color:BURGUNDY}} className="text-xs font-semibold px-3.5 py-2 rounded-full flex items-center gap-1.5"><Sparkles size={14}/>See example entries</button>
        </div>
      </div>
      <div className="px-4 mt-1">
        <div className="bg-white border rounded-2xl p-3" style={{borderColor:HAIR}}>
          <p className="text-[11px] font-semibold text-stone-500 mb-2">Or type an entry</p>
          <div className="flex gap-2">
            <input value={manual} onChange={e=>setManual(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runManual()} placeholder="e.g. Paid 500 cash for tea" className="flex-1 outline-none text-sm border rounded-lg px-3 py-2.5" style={{borderColor:HAIR}} />
            <button onClick={runManual} style={{background:BURGUNDY}} className="text-white rounded-lg px-3.5 grid place-items-center"><ArrowRight size={18}/></button>
          </div>
        </div>
      </div>
      {showEx && (<>
        <div onClick={()=>setShowEx(false)} style={{background:"rgba(36,19,24,.35)"}} className="absolute inset-0 z-10"/>
        <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl p-4 pb-6 z-20" style={{boxShadow:"0 -20px 40px -20px rgba(0,0,0,.4)"}}>
          <div className="w-9 h-1 rounded-full mx-auto mb-3" style={{background:HAIR}}/>
          <h3 className="text-[17px] font-bold mb-0.5">Try saying…</h3>
          <p className="text-stone-500 text-xs mb-3">TellRidhay detects whether it's an expense, an asset, or income.</p>
          {examples.map(([q,sub],i)=>(<button key={i} onClick={()=>{setManual(q);setDraft(parseSpeech(q,cfg));setShowEx(false);}} style={{background:PAPER}} className="w-full text-left rounded-xl px-3 py-2.5 mb-1.5 flex gap-2.5 items-start">
            <span style={{color:GOLD}} className="font-bold">“</span><span className="text-[12.5px] leading-snug">{q}<span className="block text-[11px] text-stone-400 mt-0.5">{sub}</span></span>
          </button>))}
          <button onClick={tapMic} style={{background:BURGUNDY}} className="w-full text-white rounded-xl py-3 font-semibold text-sm mt-2 flex items-center justify-center gap-2"><Mic size={17}/>Start speaking</button>
        </div>
      </>)}
      {scanning && (
        <div style={{background:"rgba(36,19,24,.55)"}} className="absolute inset-0 z-30 flex flex-col items-center justify-center text-white">
          <div className="w-12 h-12 rounded-full border-2 border-white/30 border-t-white animate-spin mb-4"/>
          <div className="font-semibold">Scanning document…</div>
          <div className="text-white/70 text-xs mt-1">Reading amount, party, date &amp; GST</div>
        </div>
      )}
      {scanErr && <div className="absolute left-1/2 -translate-x-1/2 bottom-24 bg-stone-900 text-white text-[11px] px-4 py-2.5 rounded-2xl z-30 text-center max-w-[85%] leading-snug">{scanErr}</div>}
    </div>
  );
}

/* ===== Review ===== */
function Review({ draft, heard, onCancel, onSave }) {
  const [d, setD] = useState(draft); const [date, setDate] = useState(draft.date||todayISO());
  const setAmount = (val)=>{ const amount=parseInt(val.replace(/\D/g,"")||"0",10); setD(p=>({...p,amount,entries:p.entries.map(e=>({...e,amount}))})); };
  const setLedger = (i,name)=> setD(p=>({...p,entries:p.entries.map((e,idx)=>idx===i?{...e,ledger:name}:e)}));
  const dr=d.entries.find(e=>e.side==="dr"), cr=d.entries.find(e=>e.side==="cr");
  const natColor = d.natureLabel?.includes("Asset") ? "#2F6E8C" : d.natureLabel?.includes("Income")||d.natureLabel?.includes("Receipt")||d.natureLabel?.includes("Sales") ? INC : d.natureLabel?.includes("Purchase") ? GOLD : EXP;
  return (
    <div className="flex flex-col min-h-[600px]">
      <Header title="Confirm entry" right={<button onClick={onCancel} className="text-stone-400"><X size={20}/></button>} />
      <div className="px-4 flex-1 overflow-y-auto">
        {d.image ? (
          <div className="flex gap-3 mb-3 items-stretch">
            <img src={d.image} alt="scan" className="w-16 h-16 rounded-lg object-cover border shrink-0" style={{borderColor:HAIR}} />
            <div className="rounded-xl px-3 py-2.5 text-xs leading-snug flex-1 flex items-center" style={{background:SOFT,color:BURGUNDY_DK}}>Scanned {d.docLabel||"document"}{heard?` · ${heard}`:""}</div>
          </div>
        ) : (
          <div className="rounded-xl px-3 py-2.5 text-xs leading-snug mb-3" style={{background:SOFT,color:BURGUNDY_DK}}>Heard: <b>“{heard}”</b></div>
        )}
        <div className="flex items-center gap-2 mb-3">
          <span style={{background:BURGUNDY}} className="inline-flex items-center gap-1.5 text-white text-[11px] font-semibold px-3 py-1.5 rounded-full"><Sparkles size={13}/>{d.type}</span>
          {d.natureLabel && <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full" style={{background:"#fff",border:`1px solid ${natColor}`,color:natColor}}>{d.natureLabel.includes("Asset")?<Box size={12}/>:<Tag size={12}/>}{d.natureLabel}</span>}
        </div>
        <div className="border rounded-2xl overflow-hidden mb-3" style={{borderColor:HAIR}}>
          {[dr,cr].map((e,i)=> e && (<div key={i} className={"flex items-center gap-2.5 px-3 py-3 "+(i===0?"border-b":"")} style={i===0?{borderColor:HAIR}:{}}>
            <span style={e.side==="dr"?{background:"#FBEAE5",color:EXP}:{background:"#E7F1ED",color:INC}} className="w-7 h-7 rounded-lg grid place-items-center text-[11px] font-bold">{e.side==="dr"?"Dr":"Cr"}</span>
            <input value={e.ledger} onChange={ev=>setLedger(d.entries.indexOf(e),ev.target.value)} className="flex-1 text-[13px] font-semibold outline-none bg-transparent"/>
            <span className="font-mono font-semibold text-[13.5px]">{Math.round(e.amount).toLocaleString("en-IN")}</span>
          </div>))}
        </div>
        <Field label="Amount"><input value={d.amount} onChange={e=>setAmount(e.target.value)} inputMode="numeric" className="w-full outline-none bg-transparent font-mono text-lg font-semibold" style={{color:EXP}}/></Field>
        <Field label="Date"><input type="date" value={date} onChange={e=>setDate(e.target.value)} className="w-full outline-none bg-transparent text-[15px]"/></Field>
        <Field label="Narration"><input value={d.narration} onChange={e=>setD(p=>({...p,narration:e.target.value}))} className="w-full outline-none bg-transparent text-[15px]"/></Field>
      </div>
      <div className="p-4 flex gap-2.5">
        <button onClick={onCancel} className="flex-1 bg-stone-100 rounded-xl py-3.5 font-semibold text-sm">Cancel</button>
        <button onClick={()=>onSave({...d,date})} style={{background:BURGUNDY}} className="flex-[2] text-white rounded-xl py-3.5 font-semibold text-sm active:scale-[.99] transition">Save voucher</button>
      </div>
    </div>
  );
}
function Field({ label, children }) {
  return (<div className="mb-3"><label className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 block mb-1.5">{label}</label><div className="border rounded-xl px-3 py-3 bg-white" style={{borderColor:HAIR}}>{children}</div></div>);
}

/* ===== Ledgers ===== */
function Ledgers({ ledgers, balances }) {
  const [q,setQ]=useState("");
  const grouped = useMemo(()=>{ const g={}; ledgers.filter(l=>l.name.toLowerCase().includes(q.toLowerCase())||l.group.toLowerCase().includes(q.toLowerCase())).forEach(l=>{(g[l.group]=g[l.group]||[]).push(l);}); return g; },[ledgers,q]);
  return (
    <div className="flex flex-col min-h-[600px]">
      <Header title="Ledgers" />
      <div className="px-4 flex-1 overflow-y-auto">
        <div className="bg-white border rounded-xl px-3 py-2.5 flex items-center gap-2 mb-3 text-sm text-stone-400" style={{borderColor:HAIR}}><Search size={16}/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search ledgers / groups" className="flex-1 outline-none text-stone-800"/></div>
        {Object.entries(grouped).map(([g,ls])=>{ const nat=nature(g); const sub=ls.reduce((s,l)=>s+Math.abs(balances[l.name]||0),0);
          return (<div key={g} className="mb-3"><div className="flex justify-between text-[11px] font-semibold text-stone-500 mb-1.5"><span>{g}</span><span className="font-mono">{fmt(sub)}</span></div>
            {ls.map(l=>{ const b=balances[l.name]||0; const display=(nat==="liability"||nat==="income")?-b:b;
              return (<div key={l.name} className="bg-white border rounded-xl px-3 py-3 mb-1.5 flex items-center justify-between" style={{borderColor:HAIR}}><span className="text-[13px] font-semibold">{l.name}</span><Money n={display} kind={nat==="expense"?"e":"i"}/></div>);})}
          </div>);})}
      </div>
    </div>
  );
}

/* ===== Day Book ===== */
function DayBook({ vouchers }) {
  const byDate = useMemo(()=>{ const g={}; [...vouchers].sort((a,b)=>b.date.localeCompare(a.date)).forEach(v=>{(g[v.date]=g[v.date]||[]).push(v);}); return g; },[vouchers]);
  const isExp = (t)=>["Payment","Purchase"].includes(t);
  return (
    <div className="flex flex-col min-h-[600px]">
      <Header title="Day Book" />
      <div className="px-4 flex-1 overflow-y-auto">
        {Object.entries(byDate).map(([date,vs])=>(<div key={date} className="mb-3"><p className="text-[11px] font-semibold text-stone-500 mb-1.5">{new Date(date).toLocaleDateString("en-IN",{day:"numeric",month:"short",year:"numeric"})}</p>
          {vs.map(v=>{ const dr=v.entries.find(e=>e.side==="dr"),cr=v.entries.find(e=>e.side==="cr");
            return (<div key={v.id} className="bg-white border rounded-xl px-3 py-3 mb-1.5 flex items-center gap-3" style={{borderColor:HAIR}}>
              <span style={isExp(v.type)?{background:"#FBEAE5"}:{background:"#E7F1ED"}} className="w-9 h-9 rounded-lg grid place-items-center text-base shrink-0">{isExp(v.type)?"⚡":"💰"}</span>
              <div className="flex-1 min-w-0"><b className="text-[13px]">{v.type}</b><div className="text-[11px] text-stone-500 truncate">{dr?.ledger} → {cr?.ledger}</div>{v.narration?<div className="text-[11px] text-stone-400 truncate">{v.narration}</div>:null}</div>
              <Money n={v.entries[0]?.amount||0} kind={isExp(v.type)?"e":"i"}/></div>);})}
        </div>))}
      </div>
    </div>
  );
}

/* ===== Reports menu (mode-aware) ===== */
function Reports({ setReport, settings, cfg }) {
  const Item = ({ icon, title, sub, onClick, gold }) => (
    <button onClick={onClick} style={gold?{borderColor:GOLD,background:"#FCF3E1"}:{borderColor:HAIR}} className="w-full bg-white border rounded-xl p-3.5 flex items-center gap-3 mb-2.5 text-left">
      <span style={{background:gold?"#fff":TINT}} className="w-9 h-9 rounded-lg grid place-items-center">{icon}</span>
      <div className="flex-1"><b className="text-[13.5px] block">{title}</b><span className="text-[11px] text-stone-500">{sub}</span></div><ChevronRight size={18} className="text-stone-300"/>
    </button>
  );
  const complete = settings.mode === "complete";
  return (
    <div className="flex flex-col min-h-[600px]">
      <Header title="Reports" />
      <div className="px-4 flex-1 overflow-y-auto">
        {complete ? (<>
          <Item icon={<BarChart3 size={18} color={BURGUNDY}/>} title={cfg.plTitle} sub="Income, expenses & result" onClick={()=>setReport("pl")} />
          <Item icon={<Scale size={18} color={BURGUNDY}/>} title="Balance Sheet" sub="Assets & liabilities" onClick={()=>setReport("bs")} />
          <Item icon={<Layers size={18} color={BURGUNDY}/>} title="Trial Balance" sub="All ledger balances" onClick={()=>setReport("tb")} />
        </>) : (<>
          <Item icon={<ArrowLeftRight size={18} color={BURGUNDY}/>} title="Receipts & Payments" sub="Cash & bank in / out" onClick={()=>setReport("rnp")} />
        </>)}
        <Item icon={<BookOpen size={18} color={BURGUNDY}/>} title="Day Book" sub="All vouchers" onClick={()=>setReport(null)} />
        <Item icon={<Download size={18} color="#8a6516"/>} title="Export to Tally" sub="XML — masters & vouchers" gold onClick={()=>setReport("export")} />
      </div>
    </div>
  );
}

/* ===== Statement row ===== */
function StmtRow({ label, value, tot, np, sub }) {
  const style = np?{background:"#FCF3E1",color:"#7a5616",fontWeight:700}:tot?{background:SOFT,fontWeight:700}:{};
  return (<div style={style} className={"flex justify-between px-3 py-2 text-[12.5px] border-b "+(sub?"pl-6 text-stone-500":"")} ><span>{label}</span><span className="font-mono">{value}</span></div>);
}
function StmtHead({ left }) { return (<div style={{background:BURGUNDY}} className="text-white px-3 py-2.5 text-[11px] font-semibold flex justify-between"><span>{left}</span><span>₹</span></div>); }
function BackHeader({ title, onBack }) { return <Header title={title} right={<button onClick={onBack} className="text-stone-400"><X size={20}/></button>} />; }

/* ===== P&L ===== */
function ProfitLoss({ ledgers, balances, cfg, onBack }) {
  const { incomes, expenses, incomeTotal, expTotal, np } = useMemo(()=>{
    const incomes=[],expenses=[]; ledgers.forEach(l=>{ const nat=nature(l.group),b=balances[l.name]||0; if(nat==="income")incomes.push([l.name,-b]); if(nat==="expense")expenses.push([l.name,b]); });
    const incomeTotal=incomes.reduce((s,[,x])=>s+x,0), expTotal=expenses.reduce((s,[,x])=>s+x,0); return {incomes,expenses,incomeTotal,expTotal,np:incomeTotal-expTotal};
  },[ledgers,balances]);
  return (
    <div className="flex flex-col min-h-[600px]"><BackHeader title={cfg.plTitle} onBack={onBack} />
      <div className="px-4 flex-1 overflow-y-auto">
        <div className="bg-white border rounded-2xl overflow-hidden" style={{borderColor:HAIR}}>
          <StmtHead left="Particulars" />
          <StmtRow label="Income" value="" tot />{incomes.map(([n,x])=><StmtRow key={n} label={n} value={fmt(x)} sub/>)}<StmtRow label="Total Income" value={fmt(incomeTotal)} tot/>
          <StmtRow label="Expenses" value="" tot />{expenses.map(([n,x])=><StmtRow key={n} label={n} value={fmt(x)} sub/>)}<StmtRow label="Total Expenses" value={fmt(expTotal)} tot/>
          <StmtRow label={np>=0?"Surplus / Net Profit":"Deficit / Net Loss"} value={fmt(np)} np/>
        </div>
        <p className="text-[11px] text-stone-400 mt-3 text-center">Built live from your vouchers.</p>
      </div>
    </div>
  );
}

/* ===== Balance Sheet ===== */
function BalanceSheet({ ledgers, balances, onBack }) {
  const { liab, asset, liabTotal, assetTotal, np } = useMemo(()=>{
    const liab=[],asset=[]; let inc=0,exp=0;
    ledgers.forEach(l=>{ const nat=nature(l.group),b=balances[l.name]||0; if(nat==="income")inc+=-b; else if(nat==="expense")exp+=b; else if(nat==="asset")asset.push([l.name,b]); else liab.push([l.name,-b]); });
    const np=inc-exp, assetTotal=asset.reduce((s,[,x])=>s+x,0); let liabTotal=liab.reduce((s,[,x])=>s+x,0)+np; return {liab,asset,liabTotal,assetTotal,np};
  },[ledgers,balances]);
  return (
    <div className="flex flex-col min-h-[600px]"><BackHeader title="Balance Sheet" onBack={onBack} />
      <div className="px-4 flex-1 overflow-y-auto">
        <div className="bg-white border rounded-2xl overflow-hidden mb-3" style={{borderColor:HAIR}}><StmtHead left="Liabilities" />{liab.map(([n,x])=><StmtRow key={n} label={n} value={fmt(x)}/>)}<StmtRow label={np>=0?"Add: Surplus":"Less: Deficit"} value={fmt(np)} sub/><StmtRow label="Total" value={fmt(liabTotal)} tot/></div>
        <div className="bg-white border rounded-2xl overflow-hidden" style={{borderColor:HAIR}}><StmtHead left="Assets" />{asset.map(([n,x])=><StmtRow key={n} label={n} value={fmt(x)}/>)}<StmtRow label="Total" value={fmt(assetTotal)} tot/></div>
        <p className="text-[11px] text-stone-400 mt-3 text-center">{Math.round(liabTotal)===Math.round(assetTotal)?"✓ Both sides tally.":"Difference in suspense."}</p>
      </div>
    </div>
  );
}

/* ===== Trial Balance ===== */
function TrialBalance({ ledgers, balances, onBack }) {
  const rows = ledgers.map(l=>({ name:l.name, b:balances[l.name]||0 })).filter(r=>Math.round(r.b)!==0);
  const drTot = rows.filter(r=>r.b>0).reduce((s,r)=>s+r.b,0); const crTot = rows.filter(r=>r.b<0).reduce((s,r)=>s-r.b,0);
  return (
    <div className="flex flex-col min-h-[600px]"><BackHeader title="Trial Balance" onBack={onBack} />
      <div className="px-4 flex-1 overflow-y-auto">
        <div className="bg-white border rounded-2xl overflow-hidden" style={{borderColor:HAIR}}>
          <div style={{background:BURGUNDY}} className="text-white px-3 py-2.5 text-[11px] font-semibold flex"><span className="flex-1">Ledger</span><span className="w-16 text-right">Dr</span><span className="w-16 text-right">Cr</span></div>
          {rows.map(r=>(<div key={r.name} className="flex px-3 py-2 text-[12.5px] border-b" style={{borderColor:"#f1eae6"}}><span className="flex-1 truncate">{r.name}</span><span className="w-16 text-right font-mono">{r.b>0?fmt(r.b):""}</span><span className="w-16 text-right font-mono">{r.b<0?fmt(-r.b):""}</span></div>))}
          <div className="flex px-3 py-2 text-[12.5px] font-bold" style={{background:SOFT}}><span className="flex-1">Total</span><span className="w-16 text-right font-mono">{fmt(drTot)}</span><span className="w-16 text-right font-mono">{fmt(crTot)}</span></div>
        </div>
        <p className="text-[11px] text-stone-400 mt-3 text-center">{Math.round(drTot)===Math.round(crTot)?"✓ Dr = Cr":"Out of balance"}</p>
      </div>
    </div>
  );
}

/* ===== Receipts & Payments (for "I use other software" mode) ===== */
function ReceiptsPayments({ ledgers, vouchers, onBack }) {
  const cashBank = new Set(ledgers.filter(l=>["Cash-in-Hand","Bank Accounts","Bank OD A/c"].includes(l.group)).map(l=>l.name));
  const opening = ledgers.filter(l=>cashBank.has(l.name)).reduce((s,l)=>s+(l.opening||0),0);
  const receipts={}, payments={};
  vouchers.forEach(v=>{ const cb=v.entries.find(e=>cashBank.has(e.ledger)); const other=v.entries.find(e=>!cashBank.has(e.ledger)); if(!cb||!other)return;
    if(cb.side==="dr"){ receipts[other.ledger]=(receipts[other.ledger]||0)+cb.amount; } else { payments[other.ledger]=(payments[other.ledger]||0)+cb.amount; } });
  const rTot=Object.values(receipts).reduce((s,x)=>s+x,0), pTot=Object.values(payments).reduce((s,x)=>s+x,0);
  const closing = opening + rTot - pTot;
  return (
    <div className="flex flex-col min-h-[600px]"><BackHeader title="Receipts & Payments" onBack={onBack} />
      <div className="px-4 flex-1 overflow-y-auto">
        <div className="bg-white border rounded-2xl overflow-hidden mb-3" style={{borderColor:HAIR}}>
          <StmtHead left="Receipts" />
          <StmtRow label="Opening balance (cash + bank)" value={fmt(opening)} sub/>
          {Object.entries(receipts).map(([n,x])=><StmtRow key={n} label={n} value={fmt(x)}/>)}
          <StmtRow label="Total receipts" value={fmt(opening+rTot)} tot/>
        </div>
        <div className="bg-white border rounded-2xl overflow-hidden" style={{borderColor:HAIR}}>
          <StmtHead left="Payments" />
          {Object.entries(payments).map(([n,x])=><StmtRow key={n} label={n} value={fmt(x)}/>)}
          <StmtRow label="Closing balance (cash + bank)" value={fmt(closing)} sub/>
          <StmtRow label="Total payments" value={fmt(pTot+closing)} tot/>
        </div>
        <p className="text-[11px] text-stone-400 mt-3 text-center">Pure cash/bank movement — ideal when your main books live elsewhere.</p>
      </div>
    </div>
  );
}

/* ===== Export to Tally ===== */
function ExportTally({ ledgers, vouchers, onBack }) {
  const [scope,setScope]=useState("both"); const [from,setFrom]=useState(FY_START); const [to,setTo]=useState(todayISO());
  const [sheet,setSheet]=useState(false); const [toast,setToast]=useState("");
  const inRange = vouchers.filter(v=>v.date>=from&&v.date<=to);
  const xml = useMemo(()=>buildTallyXML({ledgers,vouchers,scope,from,to}),[ledgers,vouchers,scope,from,to]);
  const filename = `TellRidhay_Tally_${from}_to_${to}.xml`;
  const flash=(m)=>{setToast(m);setTimeout(()=>setToast(""),2600);};
  const blobFile=()=>{ const blob=new Blob([xml],{type:"application/xml"}); return {blob,file:new File([blob],filename,{type:"application/xml"})}; };
  function download(){ const {blob}=blobFile(); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download=filename; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url); flash("XML downloaded"); }
  async function systemShare(){ const {file}=blobFile(); try{ if(navigator.canShare&&navigator.canShare({files:[file]})){ await navigator.share({files:[file],title:"TellRidhay Tally Export",text:"Tally XML from TellRidhay"}); return; } if(navigator.share){ await navigator.share({title:"TellRidhay Tally Export",text:"Tally XML from TellRidhay"});} else throw 0; }catch(e){ download(); flash("Share unavailable — downloaded instead"); } }
  function whatsapp(){ download(); window.open(`https://wa.me/?text=${encodeURIComponent(`TellRidhay — Tally XML (${from} to ${to}). File downloaded — please attach "${filename}".`)}`,"_blank"); }
  function email(){ download(); window.open(`https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent("TellRidhay — Tally XML export")}&body=${encodeURIComponent(`Tally XML for ${from} to ${to}. File downloaded as "${filename}" — attach before sending.`)}`,"_blank"); }
  async function copy(){ try{ await navigator.clipboard.writeText(xml); flash("XML copied"); }catch(e){ flash("Copy failed"); } }
  const ShareBtn = ({icon,label,onClick,bg}) => (<button onClick={()=>{setSheet(false);onClick();}} className="flex flex-col items-center gap-2 py-2"><span style={{background:bg}} className="w-14 h-14 rounded-2xl grid place-items-center">{icon}</span><span className="text-[11px] font-medium text-stone-600">{label}</span></button>);
  return (
    <div className="flex flex-col min-h-[600px] relative"><BackHeader title="Export to Tally" onBack={onBack} />
      <div className="px-4 flex-1 overflow-y-auto">
        <p className="text-stone-500 text-xs mb-3">Tally Prime–compatible XML.</p>
        <div className="flex rounded-xl p-1 mb-3" style={{background:"#efe7e3"}}>{[["both","Both"],["masters","Masters"],["vouchers","Vouchers"]].map(([id,lb])=>(<button key={id} onClick={()=>setScope(id)} style={scope===id?{background:"#fff",color:BURGUNDY,boxShadow:"0 1px 4px rgba(0,0,0,.08)"}:{color:"#8a7d78"}} className="flex-1 py-2 rounded-lg text-xs font-semibold">{lb}</button>))}</div>
        <label className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 block mb-1.5">Period — any range</label>
        <div className="flex items-center gap-2 mb-3">
          <div className="flex-1 bg-white border rounded-xl px-3 py-2.5 flex items-center gap-2" style={{borderColor:HAIR}}><Calendar size={15} className="text-stone-400"/><input type="date" value={from} max={to} onChange={e=>setFrom(e.target.value)} className="flex-1 outline-none text-[13px] bg-transparent"/></div>
          <span className="text-stone-400 text-xs">to</span>
          <div className="flex-1 bg-white border rounded-xl px-3 py-2.5 flex items-center gap-2" style={{borderColor:HAIR}}><Calendar size={15} className="text-stone-400"/><input type="date" value={to} min={from} onChange={e=>setTo(e.target.value)} className="flex-1 outline-none text-[13px] bg-transparent"/></div>
        </div>
        <div className="flex gap-2 mb-3 flex-wrap">{[["This month",()=>{const d=new Date();setFrom(`${d.getFullYear()}-${pad(d.getMonth()+1)}-01`);setTo(todayISO());}],["This FY",()=>{setFrom(FY_START);setTo(todayISO());}],["All",()=>{setFrom("2000-01-01");setTo(todayISO());}]].map(([lb,fn])=>(<button key={lb} onClick={fn} className="text-[11px] font-semibold text-stone-600 rounded-lg px-3 py-1.5" style={{background:"#efe7e3"}}>{lb}</button>))}</div>
        <div className="rounded-xl px-3 py-2.5 text-[12px] font-medium mb-3" style={{background:TINT,color:BURGUNDY}}>In range: {inRange.length} voucher{inRange.length!==1?"s":""} · {ledgers.length} ledgers</div>
        <div className="rounded-xl p-3 font-mono text-[9.5px] leading-relaxed overflow-x-auto mb-3" style={{background:"#241318"}}><pre style={{color:"#E7B9C6"}} className="whitespace-pre-wrap">{xml.slice(0,340)}…</pre></div>
      </div>
      <div className="p-4"><button onClick={()=>setSheet(true)} style={{background:GOLD,color:"#3a2a08"}} className="w-full rounded-xl py-3.5 font-bold text-sm flex items-center justify-center gap-2 active:scale-[.99] transition"><Download size={18}/>Export Tally XML</button></div>
      {toast && <div className="absolute left-1/2 -translate-x-1/2 bottom-24 bg-stone-900 text-white text-xs px-4 py-2.5 rounded-full z-30">{toast}</div>}
      {sheet && (<>
        <div onClick={()=>setSheet(false)} style={{background:"rgba(36,19,24,.4)"}} className="absolute inset-0 z-20"/>
        <div className="absolute left-0 right-0 bottom-0 bg-white rounded-t-3xl p-4 pb-7 z-30" style={{boxShadow:"0 -20px 40px -20px rgba(0,0,0,.4)"}}>
          <div className="w-9 h-1 rounded-full mx-auto mb-3" style={{background:HAIR}}/>
          <h3 className="text-[16px] font-bold">Share Tally XML</h3><p className="text-stone-500 text-[11px] mb-3">{filename}</p>
          <div className="grid grid-cols-4 gap-1">
            <ShareBtn label="WhatsApp" onClick={whatsapp} bg="#E7F7EC" icon={<MessageCircle size={24} color="#25D366"/>} />
            <ShareBtn label="Email" onClick={email} bg="#FBEAE5" icon={<Mail size={24} color={EXP}/>} />
            <ShareBtn label="Share…" onClick={systemShare} bg="#E8EEF2" icon={<Share2 size={24} color="#3F6E8C"/>} />
            <ShareBtn label="Copy XML" onClick={copy} bg="#F3EEF7" icon={<Copy size={24} color="#7B5EA7"/>} />
          </div>
          <button onClick={()=>{setSheet(false);download();}} style={{background:BURGUNDY}} className="w-full text-white rounded-xl py-3.5 font-semibold text-sm mt-3 flex items-center justify-center gap-2"><Download size={18}/>Download to device</button>
          <p className="text-[10.5px] text-stone-400 text-center mt-3 leading-relaxed">“Share…” opens your phone's full share sheet (Gmail, WhatsApp, Drive…). For WhatsApp/Email the file is downloaded so you can attach it.</p>
        </div>
      </>)}
    </div>
  );
}

/* ===== Settings ===== */
function SettingsSheet({ settings, setSettings, onClose, onReset }) {
  const [wakeNote, setWakeNote] = useState(false);
  const set = (k,v)=>setSettings(s=>({...s,[k]:v}));
  const Seg = ({ k, options }) => (
    <div className="flex rounded-xl p-1 mt-1.5" style={{background:"#efe7e3"}}>{options.map(([id,lb])=>(<button key={id} onClick={()=>set(k,id)} style={settings[k]===id?{background:"#fff",color:BURGUNDY,boxShadow:"0 1px 4px rgba(0,0,0,.08)"}:{color:"#8a7d78"}} className="flex-1 py-2 rounded-lg text-[12px] font-semibold">{lb}</button>))}</div>
  );
  return (
    <div className="absolute inset-0 z-40 flex flex-col" style={{background:PAPER}}>
      <Header title="Settings" right={<button onClick={onClose} className="text-stone-400"><X size={20}/></button>} />
      <div className="px-4 flex-1 overflow-y-auto pb-6">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mb-1">Type of account</p>
        <Seg k="accountType" options={[["business","Business"],["profession","Profession"],["ngo","NGO"],["personal","Personal"]]} />
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mt-5 mb-1">How you use it</p>
        <button onClick={()=>set("mode","complete")} className="w-full text-left border rounded-xl p-3 mt-1.5 bg-white flex items-start gap-2.5" style={settings.mode==="complete"?{borderColor:BURGUNDY}:{borderColor:HAIR}}>
          <Layers size={16} color={BURGUNDY} className="mt-0.5"/><div><b className="text-[13px]">Complete accounts here</b><div className="text-[11px] text-stone-500">Full double-entry · P&L, Balance Sheet, Trial Balance.</div></div>
        </button>
        <button onClick={()=>set("mode","rnp")} className="w-full text-left border rounded-xl p-3 mt-2 bg-white flex items-start gap-2.5" style={settings.mode==="rnp"?{borderColor:BURGUNDY}:{borderColor:HAIR}}>
          <ArrowLeftRight size={16} color={BURGUNDY} className="mt-0.5"/><div><b className="text-[13px]">Only receipts & payments</b><div className="text-[11px] text-stone-500">I use other software · just record cash/bank in & out, then export.</div></div>
        </button>

        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mt-5 mb-1">Voice</p>
        <div className="bg-white border rounded-xl p-3" style={{borderColor:HAIR}}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5"><Lock size={17} color={BURGUNDY}/><div><b className="text-[13px]">Wake &amp; record on lock screen</b><div className="text-[11px] text-stone-500">Say “Hey Ridhay” to record even when locked.</div></div></div>
            <button onClick={()=>{ set("wakeOnLock",!settings.wakeOnLock); setWakeNote(true); }} className="w-11 h-6 rounded-full relative transition" style={{background:settings.wakeOnLock?BURGUNDY:"#d6cfca"}}>
              <span className="absolute top-0.5 w-5 h-5 bg-white rounded-full transition-all" style={{left:settings.wakeOnLock?"22px":"2px"}}/>
            </button>
          </div>
          {wakeNote && (<div className="mt-2.5 rounded-lg p-2.5 text-[11px] leading-relaxed" style={{background:"#FCF3E1",color:"#7a5616"}}>⚠️ Always-listening on a locked phone needs the installed TellRidhay app and microphone permission. In this in-browser preview it can't run in the background — it's ready for the native build.</div>)}
        </div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mt-3 mb-1">Language</p>
        <Seg k="lang" options={[["en-IN","English"],["hi-IN","हिन्दी"],["kn-IN","ಕನ್ನಡ"]]} />

        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mt-5 mb-1">Document scan</p>
        <div className="bg-white border rounded-xl p-3" style={{borderColor:HAIR}}>
          <b className="text-[13px] flex items-center gap-2"><Camera size={15} color={BURGUNDY}/>Anthropic API key</b>
          <div className="text-[11px] text-stone-500 mt-0.5 mb-2">Needed for invoice/receipt scanning when the app runs outside Claude (e.g. GitHub Pages). Stored only on this device.</div>
          <input type="password" value={settings.scanKey||""} onChange={e=>set("scanKey",e.target.value.trim())} placeholder="sk-ant-…" className="w-full outline-none text-sm border rounded-lg px-3 py-2.5 font-mono" style={{borderColor:HAIR}} />
        </div>

        <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400 mt-5 mb-2">Brand</p>
        <div className="grid grid-cols-2 gap-2"><BrandSwatch variant="light"/><BrandSwatch variant="dark"/></div>

        <button onClick={()=>{onReset();onClose();}} className="w-full text-stone-400 text-xs flex items-center justify-center gap-1.5 py-4 mt-3"><RotateCcw size={13}/>Reset to sample data</button>
      </div>
    </div>
  );
}
