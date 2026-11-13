// Pure: แก้ไขข้อมูล alerts.json — ไม่มี I/O
const SYM_RE = /^[A-Z0-9.\-]{1,12}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SYMBOLS = 20;
const MAX_ALERTS = 5;
const MAX_DEVICES = 5;
const MAX_FIBOS = 3;
const MAX_MARKS = 30;
const MAX_NOTE = 200;
const MARK_KINDS = ["buy", "sell", "news", "other"];

function emptyData() {
  return { version: 1, heartbeat: null, push: [], symbols: [] };
}
const clone = (x) => JSON.parse(JSON.stringify(x));
const err = (m) => ({ error: m });
const validPrice = (p) => typeof p === "number" && Number.isFinite(p) && p > 0;
const validDate = (t) => typeof t === "string" && DATE_RE.test(t);
const active = (price) => ({ price, status: "active" });
const nextId = (list, prefix) => prefix + (1 + Math.max(0, ...list.map((x) => parseInt(String(x.id).slice(1), 10) || 0)));

function fiboError(a) {
  if (!validDate(a.t1) || !validDate(a.t2)) return err("วันที่ไม่ถูกต้อง");
  if (!validPrice(a.p1) || !validPrice(a.p2)) return err("ราคาไม่ถูกต้อง");
  if (a.t1 === a.t2 || a.p1 === a.p2) return err("Fibo ต้องมีสองจุดที่ต่างกัน");
  return null;
}

function cleanNote(note) {
  if (note === undefined || note === null) return { note: "" };
  if (typeof note !== "string") return err("บันทึกไม่ถูกต้อง");
  const t = note.trim();
  if ([...t].length > MAX_NOTE) return err(`บันทึกยาวได้ไม่เกิน ${MAX_NOTE} ตัวอักษร`);
  return { note: t };
}

function reorder(d, order) {
  const cur = d.symbols.map((s) => s.symbol);
  const want = Array.isArray(order) ? order.map((x) => String(x).toUpperCase().trim()) : null;
  const okPerm = want && want.length === cur.length && new Set(want).size === want.length && want.every((x) => cur.includes(x));
  if (!okPerm) return err("ลำดับหุ้นไม่ตรงกับรายการ ลองโหลดหน้าใหม่");
  d.symbols = want.map((x) => d.symbols.find((s) => s.symbol === x));
  return { data: d };
}

function applyChange(data, action) {
  const d = clone(data);
  const a = action || {};
  if (a.action === "reorder") return reorder(d, a.order);
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
      s.alerts.push({ id: nextId(s.alerts, "a"), price: a.price, dir: a.price > a.last ? "above" : "below", status: "active" });
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
    case "add_fibo": {
      const fibos = (s.fibos = s.fibos || []);
      const bad = fiboError(a);
      if (bad) return bad;
      if (fibos.length >= MAX_FIBOS) return err(`วาด Fibo ได้ไม่เกิน ${MAX_FIBOS} ชุดต่อหุ้น`);
      fibos.push({ id: nextId(fibos, "f"), t1: a.t1, p1: a.p1, t2: a.t2, p2: a.p2 });
      break;
    }
    case "update_fibo": {
      const fibos = s.fibos || [];
      const i = fibos.findIndex((f) => f.id === a.id);
      if (i < 0) return err("ไม่พบ Fibo นี้");
      const bad = fiboError(a);
      if (bad) return bad;
      fibos[i] = { id: fibos[i].id, t1: a.t1, p1: a.p1, t2: a.t2, p2: a.p2 };
      break;
    }
    case "remove_fibo": {
      const fibos = s.fibos || [];
      const i = fibos.findIndex((f) => f.id === a.id);
      if (i < 0) return err("ไม่พบ Fibo นี้");
      fibos.splice(i, 1);
      break;
    }
    case "add_mark": {
      const marks = (s.marks = s.marks || []);
      if (!validDate(a.t)) return err("วันที่ไม่ถูกต้อง");
      if (!MARK_KINDS.includes(a.kind)) return err("ชนิด mark ไม่ถูกต้อง");
      const n = cleanNote(a.note);
      if (n.error) return n;
      if (marks.length >= MAX_MARKS) return err(`ปัก mark ได้ไม่เกิน ${MAX_MARKS} อันต่อหุ้น`);
      marks.push({ id: nextId(marks, "m"), t: a.t, kind: a.kind, note: n.note });
      break;
    }
    case "update_mark": {
      const marks = s.marks || [];
      const i = marks.findIndex((m) => m.id === a.id);
      if (i < 0) return err("ไม่พบ mark นี้");
      if (!MARK_KINDS.includes(a.kind)) return err("ชนิด mark ไม่ถูกต้อง");
      const n = cleanNote(a.note);
      if (n.error) return n;
      marks[i] = { id: marks[i].id, t: marks[i].t, kind: a.kind, note: n.note };
      break;
    }
    case "remove_mark": {
      const marks = s.marks || [];
      const i = marks.findIndex((m) => m.id === a.id);
      if (i < 0) return err("ไม่พบ mark นี้");
      marks.splice(i, 1);
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

module.exports = {
  SYM_RE, MAX_SYMBOLS, MAX_ALERTS, MAX_DEVICES, MAX_FIBOS, MAX_MARKS, MAX_NOTE, MARK_KINDS,
  emptyData, applyChange, applySubscription,
};
