// Pure: แก้ไขข้อมูล alerts.json — ไม่มี I/O
const SYM_RE = /^[A-Z0-9.\-]{1,12}$/;
const MAX_SYMBOLS = 20;
const MAX_ALERTS = 5;
const MAX_DEVICES = 5;

function emptyData() {
  return { version: 1, heartbeat: null, push: [], symbols: [] };
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const err = (m) => ({ error: m });
const validPrice = (p) => typeof p === "number" && Number.isFinite(p) && p > 0;
const active = (price) => ({ price, status: "active" });

function applyChange(data, action) {
  const d = clone(data);
  const a = action || {};
  const sym = String(a.symbol || "").toUpperCase().trim();
  if (!SYM_RE.test(sym)) return err("สัญลักษณ์หุ้นไม่ถูกต้อง");
  const idx = d.symbols.findIndex((s) => s.symbol === sym);

  if (a.action === "add_symbol") {
    if (idx >= 0) return err(`${sym} มีอยู่แล้ว`);
    if (d.symbols.length >= MAX_SYMBOLS) return err(`เพิ่มได้ไม่เกิน ${MAX_SYMBOLS} ตัว`);
    d.symbols.push({ symbol: sym, sl: null, tp: null, alerts: [] });
    return { data: d };
  }
  if (idx < 0) return err(`ไม่พบ ${sym} ในรายการ`);
  const s = d.symbols[idx];
  const findAlert = (id) => s.alerts.find((x) => x.id === id);

  switch (a.action) {
    case "remove_symbol":
      d.symbols.splice(idx, 1);
      break;
    case "set_sl":
    case "set_tp":
      if (!validPrice(a.price)) return err("ราคาไม่ถูกต้อง");
      s[a.action === "set_sl" ? "sl" : "tp"] = active(a.price);
      break;
    case "clear_sl":
      s.sl = null;
      break;
    case "clear_tp":
      s.tp = null;
      break;
    case "add_alert": {
      if (!validPrice(a.price) || !validPrice(a.last)) return err("ราคาไม่ถูกต้อง");
      if (s.alerts.length >= MAX_ALERTS) return err(`ตั้ง alert ได้ไม่เกิน ${MAX_ALERTS} เส้นต่อหุ้น`);
      const next = 1 + Math.max(0, ...s.alerts.map((x) => parseInt(String(x.id).slice(1), 10) || 0));
      s.alerts.push({ id: "a" + next, price: a.price, dir: a.price > a.last ? "above" : "below", status: "active" });
      break;
    }
    case "update_alert": {
      if (!validPrice(a.price) || !validPrice(a.last)) return err("ราคาไม่ถูกต้อง");
      const i = s.alerts.findIndex((x) => x.id === a.id);
      if (i < 0) return err("ไม่พบ alert นี้");
      s.alerts[i] = { id: a.id, price: a.price, dir: a.price > a.last ? "above" : "below", status: "active" };
      break;
    }
    case "remove_alert": {
      const i = s.alerts.findIndex((x) => x.id === a.id);
      if (i < 0) return err("ไม่พบ alert นี้");
      s.alerts.splice(i, 1);
      break;
    }
    case "rearm": {
      if (a.target === "sl" || a.target === "tp") {
        if (!s[a.target]) return err("ไม่พบเส้นนี้");
        s[a.target] = active(s[a.target].price);
      } else {
        const t = findAlert(a.target);
        if (!t) return err("ไม่พบ alert นี้");
        const i = s.alerts.indexOf(t);
        s.alerts[i] = { id: t.id, price: t.price, dir: t.dir, status: "active" };
      }
      break;
    }
    default:
      return err("ไม่รู้จักคำสั่ง");
  }
  return { data: d };
}

function applySubscription(data, sub) {
  const okShape =
    sub && typeof sub.endpoint === "string" && sub.endpoint.startsWith("https://") &&
    sub.keys && typeof sub.keys.p256dh === "string" && typeof sub.keys.auth === "string";
  if (!okShape) return err("ข้อมูล notification ไม่ถูกต้อง");
  const d = clone(data);
  const entry = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, ok: true };
  d.push = (d.push || []).filter((p) => p.endpoint !== sub.endpoint);
  d.push.push(entry);
  if (d.push.length > MAX_DEVICES) d.push = d.push.slice(-MAX_DEVICES);
  return { data: d };
}

module.exports = { SYM_RE, MAX_SYMBOLS, MAX_ALERTS, MAX_DEVICES, emptyData, applyChange, applySubscription };
