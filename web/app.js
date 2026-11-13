// ---------- helpers ----------
const $ = (sel, el = document) => el.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const TREND = { up: "▲ ขาขึ้น", down: "▼ ขาลง", side: "▬ ไซด์เวย์" };
const STALE_MS = 45 * 60 * 1000;

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
    const anyOpen = d.symbols.some((s) => Logic.isMarketOpen(Logic.marketOf(s.symbol), now));
    const last = state.status.last_run ? new Date(state.status.last_run).getTime() : 0;
    if (anyOpen && now.getTime() - last > STALE_MS) {
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

routes.list = function renderList() {
  const d = state.data;
  const rows = d.symbols.length
    ? d.symbols.map(rowHtml).join("")
    : '<div class="empty">ยังไม่มีหุ้น เพิ่มตัวแรกด้านล่าง</div>';
  $("#view").innerHTML = `
    <div class="bar"><h1>หุ้นของฉัน</h1>
      <span><span class="muted" id="last-check">${esc(lastCheckText())}</span> &nbsp;<a href="#/settings" aria-label="ตั้งค่า">⚙︎</a></span></div>
    <div id="rows">${rows}</div>
    <form class="add" id="add-form">
      <input id="add-input" placeholder="เช่น NVDA หรือ PTT.BK" autocomplete="off" autocapitalize="characters" maxlength="12">
      <button class="btn primary" type="submit">＋ เพิ่ม</button>
    </form>
    <p class="muted" style="padding:0 16px">หุ้นไทยเติม .BK ต่อท้าย · สูงสุด 20 ตัว</p>`;

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

  // เติมราคา/แนวโน้มทีละตัว
  d.symbols.forEach(async (s) => {
    if (state.quotes[s.symbol] && !state.quotes[s.symbol].stale) return;
    await loadQuote(s.symbol);
    if ((location.hash || "#/") === "#/") {
      const rowsEl = $("#rows");
      if (rowsEl) rowsEl.innerHTML = state.data.symbols.map(rowHtml).join("");
    }
  });
};

// ---------- settings view ----------
function urlB64ToUint8Array(b64) {
  const pad = "=".repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
}

async function enablePush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    throw new Error("เบราว์เซอร์นี้ไม่รองรับ noti");
  }
  if (!state.data.vapid_public_key) throw new Error("ยังไม่ได้ตั้ง VAPID_PUBLIC_KEY ใน Vercel");
  const perm = await Notification.requestPermission();
  if (perm !== "granted") {
    throw new Error("noti ถูกปิดอยู่ เปิดได้ที่ การตั้งค่าไซต์ ของ Chrome → การแจ้งเตือน");
  }
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlB64ToUint8Array(state.data.vapid_public_key),
  });
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
    el.save.disabled = false;
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
    const done = cur.onSaved; // เก็บไว้ก่อน await: ถ้าผู้ใช้ออกจากหน้าระหว่างบันทึก cur จะถูก close() เป็น null
    const base = { symbol: cur.symbol, price };
    let action;
    if (cur.kind === "sl") action = { ...base, action: "set_sl" };
    else if (cur.kind === "tp") action = { ...base, action: "set_tp" };
    else if (cur.id) action = { ...base, action: "update_alert", id: cur.id, last: cur.last };
    else action = { ...base, action: "add_alert", last: cur.last };
    el.save.disabled = true;
    try {
      await change(action);
      close();
      toast("บันทึกแล้ว");
      if (done) done();
    } catch (err) {
      toast(err.message);
      if (cur) el.save.disabled = false;
    }
  }

  el.kinds.addEventListener("click", (e) => {
    const k = e.target.dataset && e.target.dataset.kind;
    if (k && cur) { cur.kind = k; cur.id = undefined; refresh(); }
  });
  el.price.addEventListener("input", () => cur && refresh());
  el.minus.addEventListener("click", () => cur && nudge(-1));
  el.plus.addEventListener("click", () => cur && nudge(1));
  el.save.addEventListener("click", () => cur && save());
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

routes.chart = async function renderChart(symbol) {
  if (activeChart) { activeChart.destroy(); activeChart = null; }
  const token = ++chartToken;
  const find = () => state.data.symbols.find((x) => x.symbol === symbol);
  if (!find()) { location.hash = "#/"; return; }
  const name = esc(Logic.displaySymbol(symbol));

  $("#view").innerHTML = `
    <div class="bar"><a href="#/">‹ ${name}</a><span id="c-price" class="muted">กำลังโหลด…</span><span id="c-trend"></span></div>
    <div id="chart"></div>
    <div class="legend muted"><span style="color:#5aa9ff">━ MA50</span> &nbsp; <span style="color:#b08cff">┅ MA200</span> &nbsp; แตะกราฟค้างเพื่อวางเส้น <span id="c-stale"></span></div>
    <div class="btns">
      <button class="btn sl" data-open="sl">SL</button>
      <button class="btn tp" data-open="tp">TP</button>
      <button class="btn al" data-open="alert">＋ Alert</button>
    </div>
    <div id="c-lines"></div>
    <div class="stack"><button class="btn danger" id="c-remove">ลบ ${name} ออกจากรายการ</button></div>`;

  const q = await loadQuote(symbol);
  // ผู้ใช้อาจออกจากหน้านี้ (หรือออกแล้วกลับเข้ามาใหม่) ระหว่างรอ: ห้ามแตะ DOM/กราฟที่ไม่ใช่ของรอบนี้
  if (token !== chartToken) return;
  if (location.hash !== "#/s/" + encodeURIComponent(symbol) && decodeURIComponent(location.hash) !== "#/s/" + symbol) return;
  if (!q) {
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

  const openSheet = (kind, price, extra) =>
    Sheet.open({ symbol, last: q.price, kind, price, onSaved: redraw, ...extra });

  const chart = AlertChart.create($("#chart"), {
    onLongPress: (price) => openSheet("alert", price, { choose: true }),
  });
  activeChart = chart;
  chart.setData(q.candles);

  function redraw() {
    const s = find();
    if (!s || activeChart !== chart) return;
    chart.setLines(chartLines(s, q));
    const items = [];
    if (s.tp) items.push(lineItemHtml("tp", "tp", s.tp, q.price));
    s.alerts.slice().sort((a, b) => b.price - a.price).forEach((a) => items.push(lineItemHtml("alert", a.id, a, q.price)));
    if (s.sl) items.push(lineItemHtml("sl", "sl", s.sl, q.price));
    $("#c-lines").innerHTML = items.join("");
  }
  redraw();

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
      if (d.act === "edit") {
        const line = d.kind === "sl" ? s.sl : d.kind === "tp" ? s.tp : s.alerts.find((a) => a.id === d.target);
        openSheet(d.kind, line.price, d.kind === "alert" ? { id: d.target } : {});
        return;
      }
      if (d.act === "rearm") await change({ action: "rearm", symbol, target: d.target });
      if (d.act === "remove") {
        if (d.kind === "sl") await change({ action: "clear_sl", symbol });
        else if (d.kind === "tp") await change({ action: "clear_tp", symbol });
        else await change({ action: "remove_alert", symbol, id: d.target });
      }
      redraw();
    } catch (err) { toast(err.message); }
  });

  $("#c-remove").addEventListener("click", async () => {
    if (!confirm(`ลบ ${Logic.displaySymbol(symbol)} และเส้นทั้งหมดของหุ้นนี้?`)) return;
    try {
      await change({ action: "remove_symbol", symbol });
      location.hash = "#/";
    } catch (err) { toast(err.message); }
  });
};

// ---------- router ----------
function route() {
  if (!state.data) return;
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/s\/(.+)$/);
  if (window.Sheet) window.Sheet.close();
  if (!m && activeChart) { activeChart.destroy(); activeChart = null; }
  if (m && routes.chart) routes.chart(decodeURIComponent(m[1]));
  else if (hash === "#/settings") routes.settings();
  else routes.list();
  updateBanner();
}

async function boot() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
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
