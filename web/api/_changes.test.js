const test = require("node:test");
const assert = require("node:assert/strict");
const C = require("./_changes.js");

const base = () => {
  const d = C.emptyData();
  d.symbols.push({ symbol: "NVDA", sl: null, tp: null, alerts: [] });
  return d;
};
const ok = (r) => { assert.equal(r.error, undefined); return r.data; };

test("add_symbol: normalises, rejects duplicate / bad / over limit", () => {
  let d = ok(C.applyChange(C.emptyData(), { action: "add_symbol", symbol: " ptt.bk " }));
  assert.deepEqual(d.symbols, [{ symbol: "PTT.BK", sl: null, tp: null, alerts: [] }]);
  assert.match(C.applyChange(d, { action: "add_symbol", symbol: "PTT.BK" }).error, /มีอยู่แล้ว/);
  assert.match(C.applyChange(d, { action: "add_symbol", symbol: "BAD SYM!" }).error, /ไม่ถูกต้อง/);
  for (let i = 0; i < 19; i++) d = ok(C.applyChange(d, { action: "add_symbol", symbol: "S" + i }));
  assert.equal(d.symbols.length, 20);
  assert.match(C.applyChange(d, { action: "add_symbol", symbol: "ONEMORE" }).error, /20/);
});

test("does not mutate the input", () => {
  const d = base();
  C.applyChange(d, { action: "set_sl", symbol: "NVDA", price: 178 });
  assert.equal(d.symbols[0].sl, null);
});

test("unknown symbol and unknown action", () => {
  assert.match(C.applyChange(base(), { action: "set_sl", symbol: "MSFT", price: 1 }).error, /ไม่พบ/);
  assert.match(C.applyChange(base(), { action: "explode", symbol: "NVDA" }).error, /ไม่รู้จัก/);
});

test("set / clear SL and TP, price validation", () => {
  let d = ok(C.applyChange(base(), { action: "set_sl", symbol: "NVDA", price: 178 }));
  d = ok(C.applyChange(d, { action: "set_tp", symbol: "NVDA", price: 210 }));
  assert.deepEqual(d.symbols[0].sl, { price: 178, status: "active" });
  assert.deepEqual(d.symbols[0].tp, { price: 210, status: "active" });
  for (const bad of [0, -1, "178", NaN, null, undefined]) {
    assert.match(C.applyChange(d, { action: "set_sl", symbol: "NVDA", price: bad }).error, /ราคา/);
  }
  d = ok(C.applyChange(d, { action: "clear_sl", symbol: "NVDA" }));
  d = ok(C.applyChange(d, { action: "clear_tp", symbol: "NVDA" }));
  assert.equal(d.symbols[0].sl, null);
  assert.equal(d.symbols[0].tp, null);
});

test("setting SL over a fired SL makes it active again", () => {
  const d = base();
  d.symbols[0].sl = { price: 170, status: "fired", fired_at: "x", fired_price: 169 };
  const out = ok(C.applyChange(d, { action: "set_sl", symbol: "NVDA", price: 175 }));
  assert.deepEqual(out.symbols[0].sl, { price: 175, status: "active" });
});

test("add_alert: direction from last price, ids, limit", () => {
  let d = ok(C.applyChange(base(), { action: "add_alert", symbol: "NVDA", price: 200, last: 190 }));
  d = ok(C.applyChange(d, { action: "add_alert", symbol: "NVDA", price: 180, last: 190 }));
  assert.deepEqual(d.symbols[0].alerts, [
    { id: "a1", price: 200, dir: "above", status: "active" },
    { id: "a2", price: 180, dir: "below", status: "active" },
  ]);
  assert.match(C.applyChange(d, { action: "add_alert", symbol: "NVDA", price: 200 }).error, /ราคา/);
  for (let i = 0; i < 3; i++) d = ok(C.applyChange(d, { action: "add_alert", symbol: "NVDA", price: 300 + i, last: 190 }));
  assert.match(C.applyChange(d, { action: "add_alert", symbol: "NVDA", price: 400, last: 190 }).error, /5/);
});

test("alert ids never reuse a removed id's number below the max", () => {
  let d = ok(C.applyChange(base(), { action: "add_alert", symbol: "NVDA", price: 200, last: 190 }));
  d = ok(C.applyChange(d, { action: "add_alert", symbol: "NVDA", price: 201, last: 190 }));
  d = ok(C.applyChange(d, { action: "remove_alert", symbol: "NVDA", id: "a1" }));
  d = ok(C.applyChange(d, { action: "add_alert", symbol: "NVDA", price: 202, last: 190 }));
  assert.deepEqual(d.symbols[0].alerts.map((a) => a.id), ["a2", "a3"]);
});

test("update_alert / remove_alert", () => {
  let d = ok(C.applyChange(base(), { action: "add_alert", symbol: "NVDA", price: 200, last: 190 }));
  d.symbols[0].alerts[0].status = "fired";
  d.symbols[0].alerts[0].fired_at = "x";
  d.symbols[0].alerts[0].fired_price = 201;
  d = ok(C.applyChange(d, { action: "update_alert", symbol: "NVDA", id: "a1", price: 185, last: 190 }));
  assert.deepEqual(d.symbols[0].alerts[0], { id: "a1", price: 185, dir: "below", status: "active" });
  assert.match(C.applyChange(d, { action: "update_alert", symbol: "NVDA", id: "zz", price: 1, last: 2 }).error, /ไม่พบ/);
  assert.match(C.applyChange(d, { action: "remove_alert", symbol: "NVDA", id: "zz" }).error, /ไม่พบ/);
  d = ok(C.applyChange(d, { action: "remove_alert", symbol: "NVDA", id: "a1" }));
  assert.deepEqual(d.symbols[0].alerts, []);
});

test("rearm sl / tp / alert", () => {
  const d = base();
  d.symbols[0].sl = { price: 170, status: "fired", fired_at: "x", fired_price: 169 };
  d.symbols[0].alerts = [{ id: "a1", price: 200, dir: "above", status: "fired", fired_at: "x", fired_price: 201 }];
  let out = ok(C.applyChange(d, { action: "rearm", symbol: "NVDA", target: "sl" }));
  assert.deepEqual(out.symbols[0].sl, { price: 170, status: "active" });
  out = ok(C.applyChange(d, { action: "rearm", symbol: "NVDA", target: "a1" }));
  assert.deepEqual(out.symbols[0].alerts[0], { id: "a1", price: 200, dir: "above", status: "active" });
  assert.match(C.applyChange(d, { action: "rearm", symbol: "NVDA", target: "tp" }).error, /ไม่พบ/);
});

test("remove_symbol", () => {
  const d = ok(C.applyChange(base(), { action: "remove_symbol", symbol: "NVDA" }));
  assert.deepEqual(d.symbols, []);
});

const sub = (n) => ({ endpoint: "https://push.example/" + n, keys: { p256dh: "p" + n, auth: "a" + n } });

test("applySubscription: add, replace by endpoint, cap devices, validate", () => {
  let d = ok(C.applySubscription(C.emptyData(), sub(1)));
  assert.deepEqual(d.push, [{ ...sub(1), ok: true }]);
  d.push[0].ok = false;
  d = ok(C.applySubscription(d, { ...sub(1), keys: { p256dh: "new", auth: "new" } }));
  assert.deepEqual(d.push, [{ endpoint: "https://push.example/1", keys: { p256dh: "new", auth: "new" }, ok: true }]);
  for (let i = 2; i <= 7; i++) d = ok(C.applySubscription(d, sub(i)));
  assert.equal(d.push.length, 5);
  assert.equal(d.push[4].endpoint, "https://push.example/7");
  assert.ok(C.applySubscription(d, { endpoint: "http://x", keys: { p256dh: "a", auth: "b" } }).error);
  assert.ok(C.applySubscription(d, { endpoint: "https://x" }).error);
  assert.ok(C.applySubscription(d, null).error);
});

test("reorder: accepts only a permutation of the current list", () => {
  let d = C.emptyData();
  for (const s of ["A", "B", "C"]) d = ok(C.applyChange(d, { action: "add_symbol", symbol: s }));
  d.symbols[0].sl = { price: 1, status: "active" };
  const out = ok(C.applyChange(d, { action: "reorder", order: ["c", "A", "B"] }));
  assert.deepEqual(out.symbols.map((s) => s.symbol), ["C", "A", "B"]);
  assert.deepEqual(out.symbols[1].sl, { price: 1, status: "active" });
  for (const bad of [["A", "B"], ["A", "B", "B"], ["A", "B", "D"], ["A", "B", "C", "D"], null, "A,B,C"]) {
    assert.match(C.applyChange(d, { action: "reorder", order: bad }).error, /ลำดับ/, JSON.stringify(bad));
  }
});

const F = { t1: "2026-03-12", p1: 142.3, t2: "2026-07-08", p2: 176.85 };

test("add_fibo / remove_fibo: stored shape, validation, limit 3", () => {
  let d = ok(C.applyChange(base(), { action: "add_fibo", symbol: "NVDA", ...F }));
  assert.deepEqual(d.symbols[0].fibos, [{ id: "f1", ...F }]);
  d = ok(C.applyChange(d, { action: "add_fibo", symbol: "NVDA", ...F, p2: 180 }));
  d = ok(C.applyChange(d, { action: "add_fibo", symbol: "NVDA", ...F, p2: 190 }));
  assert.deepEqual(d.symbols[0].fibos.map((f) => f.id), ["f1", "f2", "f3"]);
  assert.match(C.applyChange(d, { action: "add_fibo", symbol: "NVDA", ...F }).error, /3/);
  for (const b of [{ t1: "12/3/2026" }, { t2: F.t1 }, { p1: 0 }, { p2: "176" }, { p2: F.p1 }]) {
    assert.ok(C.applyChange(base(), { action: "add_fibo", symbol: "NVDA", ...F, ...b }).error, JSON.stringify(b));
  }
  d = ok(C.applyChange(d, { action: "remove_fibo", symbol: "NVDA", id: "f2" }));
  assert.deepEqual(d.symbols[0].fibos.map((f) => f.id), ["f1", "f3"]);
  assert.match(C.applyChange(d, { action: "remove_fibo", symbol: "NVDA", id: "f9" }).error, /ไม่พบ/);
  assert.match(C.applyChange(base(), { action: "remove_fibo", symbol: "NVDA", id: "f1" }).error, /ไม่พบ/);
});

test("add / update / remove mark: shape, validation, limits", () => {
  let d = ok(C.applyChange(base(), { action: "add_mark", symbol: "NVDA", t: "2026-03-12", kind: "buy", note: "  ซื้อรอบแรก  " }));
  assert.deepEqual(d.symbols[0].marks, [{ id: "m1", t: "2026-03-12", kind: "buy", note: "ซื้อรอบแรก" }]);
  d = ok(C.applyChange(d, { action: "add_mark", symbol: "NVDA", t: "2026-05-22", kind: "news" }));
  assert.equal(d.symbols[0].marks[1].note, "");
  d = ok(C.applyChange(d, { action: "update_mark", symbol: "NVDA", id: "m1", kind: "sell", note: "ขาย", t: "2020-01-01" }));
  assert.deepEqual(d.symbols[0].marks[0], { id: "m1", t: "2026-03-12", kind: "sell", note: "ขาย" });
  assert.match(C.applyChange(d, { action: "add_mark", symbol: "NVDA", t: "2026-01-02", kind: "buy", note: "ก".repeat(201) }).error, /200/);
  ok(C.applyChange(d, { action: "add_mark", symbol: "NVDA", t: "2026-01-02", kind: "buy", note: "ก".repeat(200) }));
  assert.ok(C.applyChange(d, { action: "add_mark", symbol: "NVDA", t: "2026-1-2", kind: "buy" }).error);
  assert.ok(C.applyChange(d, { action: "add_mark", symbol: "NVDA", t: "2026-01-02", kind: "hold" }).error);
  assert.ok(C.applyChange(d, { action: "add_mark", symbol: "NVDA", t: "2026-01-02", kind: "buy", note: 5 }).error);
  assert.ok(C.applyChange(d, { action: "update_mark", symbol: "NVDA", id: "m1", kind: "hold", note: "" }).error);
  assert.match(C.applyChange(d, { action: "update_mark", symbol: "NVDA", id: "m9", kind: "buy", note: "" }).error, /ไม่พบ/);
  d = ok(C.applyChange(d, { action: "remove_mark", symbol: "NVDA", id: "m1" }));
  assert.deepEqual(d.symbols[0].marks.map((m) => m.id), ["m2"]);
  assert.match(C.applyChange(d, { action: "remove_mark", symbol: "NVDA", id: "m1" }).error, /ไม่พบ/);
  for (let i = 0; i < 29; i++) d = ok(C.applyChange(d, { action: "add_mark", symbol: "NVDA", t: "2026-01-02", kind: "other" }));
  assert.equal(d.symbols[0].marks.length, 30);
  assert.match(C.applyChange(d, { action: "add_mark", symbol: "NVDA", t: "2026-01-02", kind: "other" }).error, /30/);
});
