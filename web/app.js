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

// ---------- router ----------
function route() {
  if (!state.data) return;
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/s\/(.+)$/);
  if (window.Sheet) window.Sheet.close();
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
