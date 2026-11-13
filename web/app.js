// ---------- helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TREND = { up: "▲ ขาขึ้น", down: "▼ ขาลง", side: "▬ ไซด์เวย์" };

const store = {
  get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; } },
  set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* เต็ม/ปิดใช้ */ } },
};

const state = { data: null, quotes: {}, status: null };
const routes = {};

let toastTimer = null;
function toast(msg) {
  const el = $("#toast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3000);
}

// ---------- API ----------
async function api(path, body) {
  const opts = {};
  if (body !== undefined) {
    opts.method = "POST";
    opts.headers = { "Content-Type": "application/json", "x-app-pass": store.get("pass") || "" };
    opts.body = JSON.stringify(body);
  }
  let r;
  try { r = await fetch(path, opts); } catch (e) { throw new Error("เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ต"); }
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) {
    location.hash = "#/settings";
    throw new Error("รหัสผ่านไม่ถูกต้อง ใส่รหัสในหน้าตั้งค่า");
  }
  if (!r.ok) throw new Error(j.error || "บันทึกไม่สำเร็จ ลองอีกครั้ง");
  return j;
}

async function change(action) {
  state.data = await api("/api/change", action);
}

async function loadQuote(symbol) {
  try {
    const q = await api("/api/candles?symbol=" + encodeURIComponent(symbol));
    q.stale = false;
    state.quotes[symbol] = q;
    store.set("c:" + symbol, q);
  } catch (e) {
    const old = store.get("c:" + symbol);
    if (old) { old.stale = true; state.quotes[symbol] = old; }
  }
  return state.quotes[symbol] || null;
}

// ---------- banner ----------
function updateBanner() {
  const el = $("#banner");
  const d = state.data;
  let html = "";
  if (d && d.devices === 0) {
    html = 'ยังไม่ได้เปิด noti — <a href="#/settings">ไปหน้าตั้งค่า</a>';
  } else if (d && state.status) {
    const now = new Date();
    const markets = [...new Set(d.symbols.map((s) => Logic.marketOf(s.symbol)))];
    const last = state.status.last_run ? new Date(state.status.last_run).getTime() : 0;
    if (Logic.checkerStale(last, now, markets)) {
      html = "⚠️ ตัวเช็กราคาไม่ทำงานเกิน 45 นาที alert อาจไม่แจ้ง";
    }
  }
  el.innerHTML = html;
  el.hidden = !html;
}

function lastCheckText() {
  const iso = state.status && state.status.last_run;
  if (!iso) return "";
  const t = new Date(iso).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
  return "เช็กล่าสุด " + t;
}

// ---------- list view ----------
function summaryOf(s) {
  const parts = [];
  if (s.sl && s.sl.status === "active") parts.push("SL " + Logic.fmt(s.sl.price));
  if (s.tp && s.tp.status === "active") parts.push("TP " + Logic.fmt(s.tp.price));
  const n = s.alerts.filter((a) => a.status === "active").length;
  if (n) parts.push("🔔 " + n);
  return parts.length ? parts.join(" · ") : "ยังไม่ตั้ง";
}

function rowHtml(s) {
  const q = state.quotes[s.symbol];
  const tag = Logic.marketOf(s.symbol) === "TH" ? '<span class="tag">TH</span>' : "";
  let right = '<span class="muted">…</span>';
  let trend = "";
  if (q) {
    const pct = q.prevClose ? Logic.pctFrom(q.price, q.prevClose) : null;
    const cls = pct == null || pct === 0 ? "muted" : pct > 0 ? "up" : "down";
    const sign = pct > 0 ? "+" : "";
    right = `<b>${Logic.fmt(q.price)}</b><div class="${cls}">${pct == null ? "" : sign + pct.toFixed(1) + "%"}</div>`;
    const t = Logic.trendOf(q.candles.map((c) => c.c));
    if (t) trend = TREND[t] + " · ";
  }
  return `<a class="row" href="#/s/${encodeURIComponent(s.symbol)}">
    <div><span class="name">${esc(Logic.displaySymbol(s.symbol))}</span>${tag}
      <div class="muted">${trend}${esc(summaryOf(s))}</div></div>
    <div class="right">${right}</div></a>`;
}

let reorder = null; // รายชื่อสัญลักษณ์ระหว่างโหมดจัดลำดับ (null = ไม่ได้อยู่ในโหมด)

function reorderRowHtml(sym, i, n) {
  const tag = Logic.marketOf(sym) === "TH" ? '<span class="tag">TH</span>' : "";
  return `<div class="row"><div><span class="name">${esc(Logic.displaySymbol(sym))}</span>${tag}</div>
    <div class="arrows">
      <button type="button" data-move="-1" data-i="${i}" ${i === 0 ? "disabled" : ""} aria-label="เลื่อนขึ้น">▲</button>
      <button type="button" data-move="1" data-i="${i}" ${i === n - 1 ? "disabled" : ""} aria-label="เลื่อนลง">▼</button>
    </div></div>`;
}

function rowsHtml() {
  if (reorder) return reorder.map((sym, i) => reorderRowHtml(sym, i, reorder.length)).join("");
  const d = state.data;
  return d.symbols.length ? d.symbols.map(rowHtml).join("") : '<div class="empty">ยังไม่มีหุ้น เพิ่มตัวแรกด้านล่าง</div>';
}

routes.list = function renderList() {
  const d = state.data;
  const canReorder = d.symbols.length > 1;
  const pill = canReorder ? `<button type="button" class="pill${reorder ? " on" : ""}" id="reorder-btn">${reorder ? "เสร็จ" : "จัดลำดับ"}</button>` : "";
  const gear = reorder ? "" : '<a href="#/settings" aria-label="ตั้งค่า">⚙︎</a>';
  const sub = reorder
    ? '<p class="muted hint">กด ▲ ▼ เพื่อย้าย · กด “เสร็จ” เพื่อบันทึก</p>'
    : `<p class="muted hint" id="last-check">${esc(lastCheckText())}</p>`;
  const addForm = reorder ? "" : `
    <form class="add" id="add-form">
      <input id="add-input" placeholder="เช่น NVDA หรือ PTT.BK" autocomplete="off" autocapitalize="characters" maxlength="12">
      <button class="btn primary" type="submit">＋ เพิ่ม</button>
    </form>
    <p class="muted" style="padding:0 16px">หุ้นไทยเติม .BK ต่อท้าย · สูงสุด 20 ตัว</p>`;
  $("#view").innerHTML = `
    <div class="bar"><h1 class="title">100 Bagger Stocks</h1><span class="bar-right">${pill}${gear}</span></div>
    ${sub}
    <div id="rows">${rowsHtml()}</div>
    ${addForm}`;

  const rb = $("#reorder-btn");
  if (rb) rb.addEventListener("click", async () => {
    if (!reorder) { reorder = state.data.symbols.map((s) => s.symbol); routes.list(); return; }
    const order = reorder.slice();
    if (order.join() !== state.data.symbols.map((s) => s.symbol).join()) {
      rb.disabled = true;
      try {
        await change({ action: "reorder", order });
        toast("บันทึกลำดับแล้ว");
      } catch (err) {
        toast(err.message);
        rb.disabled = false;
        return;
      }
    }
    reorder = null;
    if ((location.hash || "#/") === "#/") routes.list();
  });

  $("#rows").addEventListener("click", (e) => {
    const rb2 = $("#reorder-btn");
    if (rb2 && rb2.disabled) return;
    const b = e.target.closest("button[data-move]");
    if (!b || !reorder) return;
    const i = Number(b.dataset.i);
    const j = i + Number(b.dataset.move);
    if (j < 0 || j >= reorder.length) return;
    [reorder[i], reorder[j]] = [reorder[j], reorder[i]];
    $("#rows").innerHTML = rowsHtml();
  });

  if (!reorder) {
    $("#add-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const symbol = $("#add-input").value.toUpperCase().trim();
      if (!symbol) return;
      const btn = $("#add-form button");
      btn.disabled = true;
      try {
        await change({ action: "add_symbol", symbol });
        toast("เพิ่ม " + Logic.displaySymbol(symbol) + " แล้ว");
        routes.list();
      } catch (err) {
        toast(err.message);
        btn.disabled = false;
      }
    });
  }

  // เติมราคา/แนวโน้มทีละตัว (ไม่วาดทับระหว่างจัดลำดับ)
  d.symbols.forEach(async (s) => {
    if (state.quotes[s.symbol] && !state.quotes[s.symbol].stale) return;
    await loadQuote(s.symbol);
    if ((location.hash || "#/") === "#/" && !reorder) {
      const rowsEl = $("#rows");
      if (rowsEl) rowsEl.innerHTML = rowsHtml();
    }
  });
};

// ---------- settings view ----------
function urlB64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

// เก็บ promise ของการลงทะเบียน SW ไว้ให้ enablePush() รอ/รายงาน error (ไม่ให้เงียบ)
let swReg = null;

async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("เบราว์เซอร์นี้ไม่รองรับ noti");
  }
  if (!state.data.vapid_public_key) throw new Error("ยังไม่ได้ตั้ง VAPID_PUBLIC_KEY ใน Vercel");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    throw new Error("noti ถูกปิดอยู่ เปิดได้ที่ การตั้งค่าไซต์ ของ Chrome → การแจ้งเตือน");
  }
  if (swReg) {
    try { await swReg; } catch (e) { throw new Error("ลงทะเบียน service worker ไม่สำเร็จ: " + (e && e.message ? e.message : e)); }
  }
  // ready จะไม่ resolve ถ้าลงทะเบียนไม่สำเร็จ → จำกัดเวลารอ
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("service worker ยังไม่พร้อม ลองปิดแล้วเปิดแอปใหม่")), 10000);
  });
  let reg;
  try { reg = await Promise.race([navigator.serviceWorker.ready, timeout]); } finally { clearTimeout(timer); }
  let sub;
  try {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlB64ToUint8Array(state.data.vapid_public_key),
    });
  } catch (e) {
    throw new Error("สมัครรับ noti ไม่สำเร็จ: " + (e && e.message ? e.message : e));
  }
  state.data = await api("/api/subscribe", sub.toJSON());
}

routes.settings = function renderSettings() {
  $("#view").innerHTML = `
    <div class="bar"><a href="#/">‹ กลับ</a><h1>ตั้งค่า</h1><span></span></div>
    <div class="field"><label for="pass">รหัสผ่านของแอป (ค่าเดียวกับ APP_PASSCODE ใน Vercel)</label>
      <input id="pass" type="password" autocomplete="off" value="${esc(store.get("pass") || "")}"></div>
    <div class="stack">
      <button class="btn primary" id="save-pass">บันทึกรหัสผ่าน</button>
      <button class="btn" id="enable-push">เปิด noti บนเครื่องนี้</button>
      <button class="btn" id="test-push">ทดสอบ noti</button>
      <p class="muted" id="devices">เครื่องที่รับ noti: ${state.data ? state.data.devices : 0}</p>
    </div>`;

  $("#save-pass").addEventListener("click", () => {
    store.set("pass", $("#pass").value);
    toast("บันทึกรหัสผ่านแล้ว");
  });
  $("#enable-push").addEventListener("click", async () => {
    store.set("pass", $("#pass").value);
    try {
      await enablePush();
      toast("เปิด noti แล้ว");
      $("#devices").textContent = "เครื่องที่รับ noti: " + state.data.devices;
      updateBanner();
    } catch (err) { toast(err.message); }
  });
  $("#test-push").addEventListener("click", async () => {
    store.set("pass", $("#pass").value);
    try {
      const r = await api("/api/test-push", {});
      toast(`ส่งแล้ว ${r.sent} เครื่อง` + (r.failed ? ` (ล้มเหลว ${r.failed})` : ""));
    } catch (err) { toast(err.message); }
  });
};

// ---------- price sheet ----------
const KIND_LABEL = { sl: "Stop Loss", tp: "Take Profit", alert: "Alert ราคา" };

window.Sheet = (function () {
  let cur = null;
  const el = {
    sheet: $("#sheet"), backdrop: $("#sheet-backdrop"), title: $("#sheet-title"), kinds: $("#sheet-kinds"),
    price: $("#sheet-price"), pct: $("#sheet-pct"), warn: $("#sheet-warn"),
    minus: $("#sheet-minus"), plus: $("#sheet-plus"), save: $("#sheet-save"), cancel: $("#sheet-cancel"),
  };

  const stepOf = (last) => (last < 10 ? 0.05 : last < 100 ? 0.25 : last < 1000 ? 1 : 5);
  const value = () => parseFloat(el.price.value);

  function refresh() {
    el.title.textContent = `${Logic.displaySymbol(cur.symbol)} — ${KIND_LABEL[cur.kind]}`;
    el.kinds.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.kind === cur.kind));
    const p = value();
    if (!(p > 0)) {
      el.pct.textContent = "ใส่ราคาที่มากกว่า 0";
      el.warn.hidden = true;
      el.save.disabled = true;
      return;
    }
    el.save.disabled = !!cur.saving;
    const pct = Logic.pctFrom(p, cur.last);
    el.pct.textContent = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}% จากราคาล่าสุด ${Logic.fmt(cur.last)}`;
    const fireKind = cur.kind === "alert" ? Logic.dirFor(p, cur.last) : cur.kind;
    const now = Logic.wouldFireNow(fireKind, p, cur.last);
    el.warn.hidden = !now;
    if (now) el.warn.textContent = "⚠️ ราคาล่าสุดถึงระดับนี้แล้ว จะแจ้งเตือนในรอบเช็กถัดไปทันที";
  }

  function open(opts) {
    cur = { ...opts };
    el.kinds.hidden = !cur.choose;
    el.price.value = Logic.fmt(cur.price);
    el.sheet.hidden = false;
    el.backdrop.hidden = false;
    refresh();
  }

  function close() {
    cur = null;
    el.sheet.hidden = true;
    el.backdrop.hidden = true;
  }

  function nudge(sign) {
    const step = stepOf(cur.last);
    const next = Math.max(step, Math.round(((value() || cur.last) + sign * step) / step) * step);
    el.price.value = Logic.fmt(next);
    refresh();
  }

  async function save() {
    const price = value();
    if (!(price > 0)) return;
    const mine = cur; // เก็บไว้ก่อน await: ระหว่างบันทึก cur อาจถูก close() เป็น null หรือถูกแทนด้วย sheet อื่น
    const done = mine.onSaved;
    const base = { symbol: cur.symbol, price };
    let action;
    if (cur.kind === "sl") action = { ...base, action: "set_sl" };
    else if (cur.kind === "tp") action = { ...base, action: "set_tp" };
    else if (cur.id) action = { ...base, action: "update_alert", id: cur.id, last: cur.last };
    else action = { ...base, action: "add_alert", last: cur.last };
    mine.saving = true;
    el.save.disabled = true;
    try {
      await change(action);
      if (cur === mine) { close(); toast("บันทึกแล้ว"); }
      if (done) done();
    } catch (err) {
      toast(err.message);
      mine.saving = false;
      if (cur === mine) el.save.disabled = false;
    }
  }

  el.kinds.addEventListener("click", (e) => {
    const k = e.target.dataset && e.target.dataset.kind;
    if (k && cur) { cur.kind = k; cur.id = undefined; refresh(); }
  });
  el.price.addEventListener("input", () => cur && refresh());
  el.minus.addEventListener("click", () => cur && nudge(-1));
  el.plus.addEventListener("click", () => cur && nudge(1));
  el.save.addEventListener("click", () => cur && !cur.saving && save());
  el.cancel.addEventListener("click", close);
  el.backdrop.addEventListener("click", close);

  return { open, close };
})();

// ---------- mark sheet ----------
const MARK_SYM = { buy: "▲", sell: "▼", news: "●", other: "■" };

window.MarkSheet = (function () {
  if (!$("#msheet")) return { open() { toast("โหลดแอปใหม่อีกครั้งเพื่อใช้ Mark"); }, close() {} };
  let cur = null;
  const el = {
    sheet: $("#msheet"), backdrop: $("#sheet-backdrop"), title: $("#msheet-title"), kinds: $("#msheet-kinds"),
    note: $("#msheet-note"), count: $("#msheet-count"), save: $("#msheet-save"), cancel: $("#msheet-cancel"),
  };

  function refresh() {
    el.kinds.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b.dataset.kind === cur.kind));
    el.count.textContent = `${[...el.note.value].length}/200`;
    el.save.disabled = !!cur.saving;
  }

  function open(opts) {
    cur = { kind: "buy", note: "", ...opts };
    el.title.textContent = `${Logic.displaySymbol(cur.symbol)} — ${cur.id ? "แก้ mark" : "ปัก mark"} ${Logic.fmtDM(cur.t)}`;
    el.note.value = cur.note || "";
    el.sheet.hidden = false;
    el.backdrop.hidden = false;
    refresh();
  }

  function close() {
    cur = null;
    el.sheet.hidden = true;
    el.backdrop.hidden = true;
  }

  async function save() {
    const mine = cur;
    const done = mine.onSaved;
    const note = el.note.value.trim();
    const action = mine.id
      ? { action: "update_mark", symbol: mine.symbol, id: mine.id, kind: mine.kind, note }
      : { action: "add_mark", symbol: mine.symbol, t: mine.t, kind: mine.kind, note };
    mine.saving = true;
    el.save.disabled = true;
    try {
      await change(action);
      if (cur === mine) { close(); toast("บันทึกแล้ว"); }
      if (done) done();
    } catch (err) {
      toast(err.message);
      mine.saving = false;
      if (cur === mine) el.save.disabled = false;
    }
  }

  el.kinds.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-kind]");
    if (b && cur) { cur.kind = b.dataset.kind; refresh(); }
  });
  el.note.addEventListener("input", () => cur && refresh());
  el.save.addEventListener("click", () => cur && !cur.saving && save());
  el.cancel.addEventListener("click", close);
  el.backdrop.addEventListener("click", close);

  return { open, close };
})();

// ---------- chart view ----------
let activeChart = null;
let chartToken = 0;

function chartLines(s, q) {
  const lines = [];
  const r = Logic.range52w(q.candles);
  if (r) {
    lines.push({ price: r.high, color: "ref", title: "52w สูง" });
    lines.push({ price: r.low, color: "ref", title: "52w ต่ำ" });
  }
  if (s.sl) lines.push({ price: s.sl.price, color: s.sl.status === "active" ? "sl" : "fired", title: "SL" });
  if (s.tp) lines.push({ price: s.tp.price, color: s.tp.status === "active" ? "tp" : "fired", title: "TP" });
  s.alerts.forEach((a) => lines.push({ price: a.price, color: a.status === "active" ? "alert" : "fired", title: "🔔" }));
  return lines;
}

function lineItemHtml(kind, target, line, last) {
  const fired = line.status === "fired";
  const pct = Logic.pctFrom(line.price, last);
  const label = kind === "sl" ? "SL" : kind === "tp" ? "TP" : line.dir === "above" ? "🔔 ขึ้นถึง" : "🔔 ลงถึง";
  let note = `<span class="muted">${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%</span>`;
  if (fired) {
    const when = new Date(line.fired_at).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
    note = `<span class="muted">แจ้งแล้ว ${esc(when)} ที่ ${Logic.fmt(line.fired_price)}</span>`;
  }
  const acts = fired
    ? `<button class="link" data-act="rearm" data-target="${esc(target)}">เปิดใช้ซ้ำ</button>`
    : `<button class="link" data-act="edit" data-kind="${kind}" data-target="${esc(target)}">แก้</button>`;
  return `<div class="line-item ${fired ? "fired" : ""}">
    <span><span class="c-${kind}">${label} ${Logic.fmt(line.price)}</span> ${note}</span>
    <span class="acts">${acts}<button class="link" data-act="remove" data-kind="${kind}" data-target="${esc(target)}">ลบ</button></span></div>`;
}

function fiboItemHtml(f) {
  return `<div class="line-item">
    <span><span class="c-fibo">Fibo ${Logic.fmt(f.p1)} → ${Logic.fmt(f.p2)}</span> <span class="muted">${esc(Logic.fmtDM(f.t1))} – ${esc(Logic.fmtDM(f.t2))}</span></span>
    <span class="acts"><button class="link" data-act="edit" data-kind="fibo" data-target="${esc(f.id)}">แก้</button><button class="link" data-act="remove" data-kind="fibo" data-target="${esc(f.id)}">ลบ</button></span></div>`;
}

function notesHtml(s, openId) {
  const marks = Logic.numberMarks(s.marks || []);
  if (!marks.length) return "";
  const rows = marks.map((m) => {
    const open = m.id === openId;
    const kind = MARK_SYM[m.kind] ? m.kind : "other";
    const text = m.note ? esc(m.note) : '<span class="muted">—</span>';
    const acts = open
      ? '<span class="acts"><button class="link" data-mact="edit">แก้</button><button class="link del" data-mact="remove">ลบ</button></span>'
      : "";
    return `<div class="n${open ? " open" : ""}" data-mark="${esc(m.id)}"><span class="no">${m.n}</span><span class="k-${kind}">${MARK_SYM[kind]}</span><span class="dt">${esc(Logic.fmtDM(m.t))}</span><span class="tx">${text}</span>${acts}</div>`;
  });
  return `<h3>บันทึก</h3>${rows.join("")}`;
}

routes.chart = async function renderChart(symbol) {
  if (activeChart) { activeChart.destroy(); activeChart = null; }
  const token = ++chartToken;
  const find = () => state.data.symbols.find((x) => x.symbol === symbol);
  if (!find()) { location.hash = "#/"; return; }
  const name = esc(Logic.displaySymbol(symbol));

  $("#view").innerHTML = `
    <div class="bar"><a href="#/">‹ ${name}</a>
      <span class="tools" hidden>
        <button type="button" class="tbtn" data-mode="fibo" data-label="Fibo">Fibo</button>
        <button type="button" class="tbtn" data-mode="mark" data-label="Mark">Mark</button>
      </span></div>
    <div class="sub"><span id="c-price" class="muted">กำลังโหลด…</span><span id="c-trend"></span></div>
    <div id="chart"></div>
    <div class="legend muted"><span style="color:#5aa9ff">━ MA50</span> &nbsp;<span style="color:#b08cff">┅ MA200</span> &nbsp;<span style="color:#9fb6ff">━ RSI 14</span> &nbsp;<span style="color:#e0a64a">━ Fibo</span> <span id="c-stale"></span></div>
    <div id="c-draw" class="drawbar" hidden></div>
    <div class="btns">
      <button class="btn sl" data-open="sl">SL</button>
      <button class="btn tp" data-open="tp">TP</button>
      <button class="btn al" data-open="alert">＋ Alert</button>
    </div>
    <div id="c-lines"></div>
    <div id="c-notes" class="notes"></div>
    <div class="stack"><button class="btn danger" id="c-remove">ลบ ${name} ออกจากรายการ</button></div>`;

  // ผูกปุ่มลบก่อนรอราคา: หุ้นที่ Yahoo ไม่ให้ข้อมูลแล้วต้องยังลบออกได้
  $("#c-remove").addEventListener("click", async () => {
    if (!confirm(`ลบ ${Logic.displaySymbol(symbol)} และเส้นทั้งหมดของหุ้นนี้?`)) return;
    try {
      await change({ action: "remove_symbol", symbol });
      location.hash = "#/";
    } catch (err) { toast(err.message); }
  });

  const q = await loadQuote(symbol);
  // ผู้ใช้อาจออกจากหน้านี้ (หรือออกแล้วกลับเข้ามาใหม่) ระหว่างรอ: ห้ามแตะ DOM/กราฟที่ไม่ใช่ของรอบนี้
  if (token !== chartToken) return;
  if (location.hash !== "#/s/" + encodeURIComponent(symbol) && decodeURIComponent(location.hash) !== "#/s/" + symbol) return;
  if (!q) {
    $(".btns").style.display = "none"; // ไม่มีราคา → ตั้ง SL/TP/Alert ไม่ได้
    $("#chart").innerHTML = `<div class="empty">ดึงกราฟไม่ได้<br><button class="btn" id="c-retry">ลองใหม่</button></div>`;
    $("#c-retry").addEventListener("click", () => routes.chart(symbol));
    return;
  }

  const pct = q.prevClose ? Logic.pctFrom(q.price, q.prevClose) : null;
  const cls = pct == null || pct === 0 ? "muted" : pct > 0 ? "up" : "down";
  $("#c-price").className = "";
  $("#c-price").innerHTML = `<b>${Logic.curSym(symbol)}${Logic.fmt(q.price)}</b> <span class="${cls}">${pct == null ? "" : (pct > 0 ? "+" : "") + pct.toFixed(1) + "%"}</span>`;
  const t = Logic.trendOf(q.candles.map((c) => c.c));
  $("#c-trend").innerHTML = t ? `<span class="trend ${t}">${TREND[t]}</span>` : "";
  $("#c-stale").textContent = q.stale ? "· ข้อมูลเก่า" : "";
  $(".tools").hidden = false;

  let mode = null;          // null | "fibo" | "mark"
  let pendingFibo = null;   // Fibo ที่ลากแล้วแต่ยังไม่บันทึก
  let openMarkId = null;    // แถว note ที่กางอยู่
  let savingFibo = false;   // กำลังบันทึก Fibo: ล็อกการลาก/ปุ่มใน drawbar
  let editingFiboId = null; // กำลังแก้ Fibo ที่บันทึกแล้ว (null = วาดชุดใหม่)

  const openSheet = (kind, price, extra) =>
    Sheet.open({ symbol, last: q.price, kind, price, onSaved: redraw, ...extra });

  const chart = AlertChart.create($("#chart"), {
    onLongPress: (price) => openSheet("alert", price, { choose: true }),
    onFiboDrawn: (f) => { if (savingFibo) return; pendingFibo = f; renderDrawbar(); },
    onMarkTap: (tm) => { setMode(null); MarkSheet.open({ symbol, t: tm, onSaved: redraw }); },
  });
  activeChart = chart;
  chart.setData(q.candles);

  function redraw() {
    const s = find();
    if (!s || activeChart !== chart) return;
    chart.setLines(chartLines(s, q));
    // ชุดที่กำลังแก้แสดงเป็นแบบมีจุดจับแทนชุดเดิม
    chart.setFibos((s.fibos || []).filter((f) => f.id !== editingFiboId), pendingFibo);
    chart.setMarks(Logic.numberMarks(s.marks || []));
    const items = [];
    if (s.tp) items.push(lineItemHtml("tp", "tp", s.tp, q.price));
    s.alerts.slice().sort((a, b) => b.price - a.price).forEach((a) => items.push(lineItemHtml("alert", a.id, a, q.price)));
    if (s.sl) items.push(lineItemHtml("sl", "sl", s.sl, q.price));
    (s.fibos || []).forEach((f) => items.push(fiboItemHtml(f)));
    $("#c-lines").innerHTML = items.join("");
    $("#c-notes").innerHTML = notesHtml(s, openMarkId);
  }

  function renderDrawbar() {
    const bar = $("#c-draw");
    if (!mode) { bar.hidden = true; bar.innerHTML = ""; return; }
    bar.hidden = false;
    if (mode === "mark") { bar.innerHTML = '<span class="muted">แตะแท่งเทียนที่ต้องการปัก mark</span>'; return; }
    bar.innerHTML = pendingFibo
      ? `<span class="muted">${Logic.fmt(pendingFibo.p1)} → ${Logic.fmt(pendingFibo.p2)}<br>ลากจุดวงกลมเพื่อปรับ · ลากกลางชุดเพื่อย้าย</span>
         <span class="acts"><button type="button" class="link" data-draw="redo">วาดใหม่</button><button type="button" class="btn primary small" data-draw="save"${savingFibo ? " disabled" : ""}>บันทึก</button></span>`
      : '<span class="muted">ลากนิ้วจากจุดเริ่มไปจุดจบ</span>';
  }

  function setMode(m) {
    mode = m;
    pendingFibo = null;
    editingFiboId = null;
    chart.setMode(m);
    document.querySelectorAll("#view .tbtn").forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle("on", on);
      b.textContent = on ? "ยกเลิก" : b.dataset.label;
      b.disabled = !!m && !on;
    });
    $(".btns").classList.toggle("off", !!m);
    for (const sel of ["#c-lines", "#c-notes"]) {
      const lockEl = $(sel);
      lockEl.classList.toggle("off", !!m);
      lockEl.style.pointerEvents = m ? "none" : "";
      lockEl.style.opacity = m ? ".35" : "";
    }
    renderDrawbar();
    redraw();
  }

  redraw();

  $(".tools").addEventListener("click", (e) => {
    const b = e.target.closest(".tbtn");
    if (!b) return;
    const m = b.dataset.mode;
    if (mode === m) { setMode(null); return; }
    const s = find();
    if (m === "fibo" && (s.fibos || []).length >= 3) { toast("วาด Fibo ได้ไม่เกิน 3 ชุดต่อหุ้น ลบชุดเก่าก่อน"); return; }
    if (m === "mark" && (s.marks || []).length >= 30) { toast("ปัก mark ได้ไม่เกิน 30 อันต่อหุ้น ลบอันเก่าก่อน"); return; }
    setMode(m);
  });

  $("#c-draw").addEventListener("click", async (e) => {
    if (savingFibo) return;
    const act = e.target.dataset && e.target.dataset.draw;
    if (act === "redo") { pendingFibo = null; renderDrawbar(); redraw(); return; }
    if (act !== "save" || !pendingFibo) return;
    const f = pendingFibo;
    savingFibo = true;
    e.target.disabled = true;
    const pts = { t1: f.t1, p1: f.p1, t2: f.t2, p2: f.p2 };
    try {
      await change(editingFiboId
        ? { action: "update_fibo", symbol, id: editingFiboId, ...pts }
        : { action: "add_fibo", symbol, ...pts });
      if (activeChart !== chart) return;
      savingFibo = false;
      setMode(null);
      toast("บันทึก Fibo แล้ว");
    } catch (err) {
      toast(err.message);
    } finally {
      savingFibo = false;
      if (activeChart === chart && mode === "fibo") renderDrawbar();
    }
  });

  $(".btns").addEventListener("click", (e) => {
    const kind = e.target.dataset && e.target.dataset.open;
    if (!kind) return;
    const s = find();
    const existing = kind === "sl" ? s.sl : kind === "tp" ? s.tp : null;
    openSheet(kind, existing ? existing.price : q.price);
  });

  $("#c-lines").addEventListener("click", async (e) => {
    const d = e.target.dataset || {};
    if (!d.act) return;
    const s = find();
    try {
      if (d.act === "edit" && d.kind === "fibo") {
        const f = (s.fibos || []).find((x) => x.id === d.target);
        if (!f) return;
        setMode("fibo");
        editingFiboId = f.id;
        pendingFibo = { t1: f.t1, p1: f.p1, t2: f.t2, p2: f.p2 };
        renderDrawbar();
        redraw();
        return;
      }
      if (d.act === "edit") {
        const line = d.kind === "sl" ? s.sl : d.kind === "tp" ? s.tp : s.alerts.find((a) => a.id === d.target);
        openSheet(d.kind, line.price, d.kind === "alert" ? { id: d.target } : {});
        return;
      }
      if (d.act === "rearm") await change({ action: "rearm", symbol, target: d.target });
      if (d.act === "remove") {
        if (d.kind === "fibo") await change({ action: "remove_fibo", symbol, id: d.target });
        else if (d.kind === "sl") await change({ action: "clear_sl", symbol });
        else if (d.kind === "tp") await change({ action: "clear_tp", symbol });
        else await change({ action: "remove_alert", symbol, id: d.target });
      }
      redraw();
    } catch (err) { toast(err.message); }
  });

  $("#c-notes").addEventListener("click", async (e) => {
    const row = e.target.closest(".n");
    if (!row) return;
    const s = find();
    const m = (s.marks || []).find((x) => x.id === row.dataset.mark);
    if (!m) return;
    const act = e.target.dataset && e.target.dataset.mact;
    if (act === "edit") {
      MarkSheet.open({ symbol, t: m.t, id: m.id, kind: m.kind, note: m.note, onSaved: redraw });
      return;
    }
    if (act === "remove") {
      if (!confirm("ลบ mark นี้?")) return;
      try {
        await change({ action: "remove_mark", symbol, id: m.id });
        openMarkId = null;
        redraw();
      } catch (err) { toast(err.message); }
      return;
    }
    openMarkId = openMarkId === m.id ? null : m.id;
    if (openMarkId) chart.scrollToTime(m.t);
    redraw();
  });
};

// ---------- router ----------
function route() {
  if (!state.data) return;
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/s\/(.+)$/);
  if (window.Sheet) window.Sheet.close();
  if (window.MarkSheet) window.MarkSheet.close();
  if (!m && activeChart) { activeChart.destroy(); activeChart = null; }
  if (m || hash === "#/settings") reorder = null; // ออกจากหน้ารายการ = ทิ้งการจัดลำดับที่ยังไม่บันทึก
  if (m && routes.chart) routes.chart(decodeURIComponent(m[1]));
  else if (hash === "#/settings") routes.settings();
  else routes.list();
  updateBanner();
}

async function boot() {
  if ("serviceWorker" in navigator) {
    swReg = navigator.serviceWorker.register("/sw.js");
    swReg.catch(() => {}); // กัน unhandled rejection ตอนบูต; error จริงจะโผล่ตอนกด "เปิด noti"
  }
  try {
    state.data = await api("/api/data");
  } catch (err) {
    $("#view").innerHTML = `<div class="empty">โหลดข้อมูลไม่ได้<br><button class="btn" onclick="location.reload()">ลองใหม่</button></div>`;
    return;
  }
  window.addEventListener("hashchange", route);
  route();
  api("/api/status").then((s) => {
    state.status = s;
    updateBanner();
    const el = $("#last-check");
    if (el) el.textContent = lastCheckText();
  }).catch(() => {});
}

boot();
