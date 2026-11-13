const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("./logic.js");

test("marketOf / displaySymbol / curSym", () => {
  assert.equal(L.marketOf("PTT.BK"), "TH");
  assert.equal(L.marketOf("ptt.bk "), "TH");
  assert.equal(L.marketOf("NVDA"), "US");
  assert.equal(L.displaySymbol("PTT.BK"), "PTT");
  assert.equal(L.displaySymbol("NVDA"), "NVDA");
  assert.equal(L.curSym("PTT.BK"), "฿");
  assert.equal(L.curSym("NVDA"), "$");
});

test("sma keeps length and pads with null", () => {
  assert.deepEqual(L.sma([1, 2, 3, 4], 2), [null, 1.5, 2.5, 3.5]);
  assert.deepEqual(L.sma([1, 2], 3), [null, null]);
});

const series = (n, f) => Array.from({ length: n }, (_, i) => f(i));

test("trendOf: up / down / side / not enough data", () => {
  assert.equal(L.trendOf(series(250, (i) => 100 + i)), "up");
  assert.equal(L.trendOf(series(250, (i) => 400 - i)), "down");
  assert.equal(L.trendOf(series(250, () => 100)), "side");
  const dip = series(250, (i) => 100 + i);
  dip[249] = 50; // ราคาหลุด MA50 แต่ MA50 ยัง > MA200
  assert.equal(L.trendOf(dip), "side");
  assert.equal(L.trendOf(series(199, (i) => i)), null);
});

test("pctFrom", () => {
  assert.equal(L.pctFrom(110, 100), 10);
  assert.equal(L.pctFrom(90, 100), -10);
  assert.equal(L.pctFrom(1, 0), null);
});

test("range52w uses the last 252 candles", () => {
  const cs = series(300, (i) => ({ h: i, l: -i }));
  assert.deepEqual(L.range52w(cs), { high: 299, low: -299 });
  assert.equal(L.range52w(cs).high, 299);
  const old = series(300, (i) => ({ h: i === 0 ? 9999 : 10, l: 5 }));
  assert.deepEqual(L.range52w(old), { high: 10, low: 5 });
  assert.equal(L.range52w([]), null);
});

test("isMarketOpen follows UTC windows Mon-Fri", () => {
  const at = (iso) => new Date(iso);
  assert.equal(L.isMarketOpen("TH", at("2026-11-13T03:00:00Z")), true); // ศุกร์
  assert.equal(L.isMarketOpen("TH", at("2026-11-13T09:59:00Z")), true);
  assert.equal(L.isMarketOpen("TH", at("2026-11-13T10:00:00Z")), false);
  assert.equal(L.isMarketOpen("US", at("2026-11-13T13:00:00Z")), true);
  assert.equal(L.isMarketOpen("US", at("2026-11-13T21:59:00Z")), true);
  assert.equal(L.isMarketOpen("US", at("2026-11-13T22:00:00Z")), false);
  assert.equal(L.isMarketOpen("US", at("2026-11-14T15:00:00Z")), false); // เสาร์
});

test("dirFor / wouldFireNow / fmt", () => {
  assert.equal(L.dirFor(200, 190), "above");
  assert.equal(L.dirFor(180, 190), "below");
  assert.equal(L.dirFor(190, 190), "below");
  assert.equal(L.wouldFireNow("sl", 178, 178), true);
  assert.equal(L.wouldFireNow("sl", 178, 180), false);
  assert.equal(L.wouldFireNow("tp", 210, 210), true);
  assert.equal(L.wouldFireNow("above", 200, 199.9), false);
  assert.equal(L.wouldFireNow("below", 200, 199.9), true);
  assert.equal(L.fmt(178), "178.00");
  assert.equal(L.fmt(32.756), "32.76");
});

test("checkerStale: only after 45 min inside an open window with no run since the open", () => {
  const T = (iso) => new Date(iso);
  const old = T("2026-11-12T20:00:00Z").getTime(); // รอบเก่าจากเมื่อวาน
  // เพิ่งเปิดตลาด รอบล่าสุดเก่า → ยังไม่เตือน
  assert.equal(L.checkerStale(old, T("2026-11-13T13:20:00Z"), ["US"]), false);
  assert.equal(L.checkerStale(old, T("2026-11-13T13:44:00Z"), ["US"]), false);
  // เปิดมา 46 นาทีแล้วยังไม่มีรอบ → เตือน
  assert.equal(L.checkerStale(old, T("2026-11-13T13:46:00Z"), ["US"]), true);
  // มีรอบล่าสุดเมื่อเร็วๆ นี้ → ไม่เตือน
  assert.equal(L.checkerStale(T("2026-11-13T14:10:00Z").getTime(), T("2026-11-13T14:30:00Z"), ["US"]), false);
  // รอบล่าสุดเกิน 45 นาทีในหน้าต่าง → เตือน
  assert.equal(L.checkerStale(T("2026-11-13T14:10:00Z").getTime(), T("2026-11-13T15:00:00Z"), ["US"]), true);
  // ตลาดปิดทั้งหมด / ไม่มีตลาด → ไม่เตือน
  assert.equal(L.checkerStale(old, T("2026-11-13T11:00:00Z"), ["TH", "US"]), false);
  assert.equal(L.checkerStale(old, T("2026-11-14T15:00:00Z"), ["US"]), false);
  assert.equal(L.checkerStale(old, T("2026-11-13T14:00:00Z"), []), false);
  // ไม่เคยมีรอบ (null/0) แต่เปิดมา 46+ นาที → เตือน
  assert.equal(L.checkerStale(null, T("2026-11-13T13:46:00Z"), ["US"]), true);
  assert.equal(L.checkerStale(0, T("2026-11-13T13:46:00Z"), ["US"]), true);
  assert.equal(L.checkerStale(null, T("2026-11-13T13:20:00Z"), ["US"]), false);
  // ตลาดที่เปิดอยู่เป็นตลาดที่อยู่ใน markets เท่านั้น
  assert.equal(L.checkerStale(old, T("2026-11-13T05:00:00Z"), ["US"]), false);
  assert.equal(L.checkerStale(old, T("2026-11-13T05:00:00Z"), ["US", "TH"]), true);
});
