# Alert v2 (จัดลำดับ, RSI, Fibo, Mark/Note, 3 ปี, badge) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** เพิ่มการจัดลำดับหุ้น, แถบ RSI, เครื่องมือวาด Fibo, จุด mark พร้อม note, ข้อมูลย้อนหลัง 3 ปี และไอคอน noti ที่ถูกต้อง ให้แอป Stock Alert ที่ใช้งานอยู่

**Architecture:** ข้อมูลใหม่ (ลำดับ, `fibos`, `marks`) เก็บใน `alerts.json` ผ่าน action ใหม่ของ `/api/change` (pure ใน `web/api/_changes.js`) ฟังก์ชันคำนวณ (RSI, ระดับ Fibo, การดูดเข้าแท่งเทียน, เลข mark) เป็น pure ใน `web/logic.js` กราฟ (`web/chart.js`) ใช้ lightweight-charts 4.1.3: RSI เป็น line series บน price scale แยก, mark ใช้ `setMarkers`, Fibo วาดด้วย series primitive (`attachPrimitive`), โหมดวาดปิด `handleScroll`/`handleScale` ชั่วคราว

**Tech Stack:** Vanilla JS (ไม่มี build), lightweight-charts 4.1.3 (vendored), Node 22 `node --test`, Python 3 + pytest, Vercel CLI

**Spec:** `docs/superpowers/specs/2026-11-13-alert-v2-chart-tools-design.md`

## Global Constraints

- โฟลเดอร์งาน: `C:\Users\COJ\Desktop\Claude\Sessions\Stock News\Alert` (git repo ของตัวเอง) ทุก path เทียบกับโฟลเดอร์นี้
- ห้ามแก้ไฟล์นอกโฟลเดอร์นี้ ห้าม push และห้าม deploy ยกเว้น Task 8
- ห้ามใช้ build step หรือ dependency ใหม่ฝั่งหน้าเว็บ; ไลบรารีกราฟคือ `web/vendor/lightweight-charts.js` v4.1.3 เท่านั้น
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย ราคาแสดงทศนิยม 2 ตำแหน่ง (`Logic.fmt`)
- หัวข้อหน้าแรก: `100 Bagger Stocks` (ชื่อแอปใน manifest ไม่เปลี่ยน)
- RSI: 14 วัน, Wilder smoothing, เส้น 30 และ 70
- ข้อมูล: `range=5y`, เก็บ 956 แท่งล่าสุด; กราฟเปิดที่ 252 แท่งล่าสุด
- Fibo: ระดับ `0%, 38.2%, 50%, 61.8%, 100%`; **จุดเริ่มลาก = 100%, จุดจบ = 0%** (แบบ TradingView); สูงสุด 3 ชุดต่อหุ้น; เส้นยาวเฉพาะช่วงที่ลาก; ป้ายที่ปลายซ้ายเหนือเส้น; สี `#e0a64a`
- Mark: `kind` ∈ `buy | sell | news | other` → ▲ เขียว ใต้แท่ง / ▼ แดง เหนือ / ● ฟ้า `#3d9cf0` เหนือ / ■ เทา เหนือ; สูงสุด 30 ต่อหุ้น; note ≤ 200 ตัวอักษร (ว่างได้)
- รายการ note: ใหม่อยู่บน, เลขนับตามวันที่ (เก่าสุด = 1), วันที่รูปแบบ `วัน/เดือน` เช่น `8/7`
- วันที่ใน `alerts.json`: สตริง `YYYY-MM-DD` ตรงกับ `t` ของแท่งเทียน
- ทุก commit ลงท้ายด้วย `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## File Structure

| ไฟล์ | หน้าที่ | Task |
|---|---|---|
| `web/logic.js` (+test) | pure: `rsi`, `fibLevels`, `snapToCandle`, `fmtDM`, `numberMarks` | 1 |
| `web/api/_changes.js` (+test) | action `reorder`, `add_fibo`, `remove_fibo`, `add_mark`, `update_mark`, `remove_mark` | 2 |
| `tests/test_check.py` | ยืนยันตัวเช็กไม่ทิ้ง `fibos`/`marks` | 2 |
| `web/api/_yahoo.js` (+test) | 5 ปี → ตัดเหลือ 956 แท่ง | 3 |
| `tools/make_icons.py`, `tests/test_icons.py`, `web/icons/badge-96.png`, `web/sw.js` | ไอคอน badge | 4 |
| `web/app.js` (หน้ารายการ), `web/style.css` | หัวข้อใหม่ + โหมดจัดลำดับ | 5 |
| `web/chart.js` | RSI, marker, Fibo primitive, โหมดวาด | 6 |
| `web/app.js` (หน้ากราฟ + MarkSheet), `web/index.html`, `web/style.css` | UI หน้ากราฟ | 7 |
| `README.md` | วิธีใช้ใหม่ + deploy | 8 |

---

### Task 1: ฟังก์ชัน pure ใน `web/logic.js`

**Files:**
- Modify: `web/logic.js` (เพิ่มฟังก์ชันก่อน `return` และเพิ่มชื่อใน object ที่ return)
- Test: `web/logic.test.js` (ต่อท้ายไฟล์)

**Interfaces:**
- Produces (global `Logic` และ `require("./logic.js")`):
  - `rsi(closes:number[], period:number) -> (number|null)[]` ยาวเท่า input; ค่าแรกที่ index `period`
  - `fibLevels(p1:number, p2:number) -> {label:string, ratio:number, price:number}[]` เรียง `0%, 38.2%, 50%, 61.8%, 100%`; `price = p2 + (p1 - p2) * ratio`
  - `snapToCandle(candles:{t,h,l}[], logical:number, price:number) -> {i:number, t:string, p:number} | null`
  - `fmtDM(t:"YYYY-MM-DD") -> "D/M"`
  - `numberMarks(marks) -> marks ที่เติม n` เรียงใหม่→เก่า; ไม่แก้ input

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน** — ต่อท้าย `web/logic.test.js`

```js
test("rsi: Wilder smoothing and edge cases", () => {
  assert.deepEqual(L.rsi([1, 2, 1, 2], 2), [null, null, 50, 75]);
  assert.deepEqual(L.rsi([1, 2], 2), [null, null]);
  const up = L.rsi(series(20, (i) => 10 + i), 14);
  assert.equal(up.length, 20);
  assert.equal(up[13], null);
  assert.equal(up[14], 100);
  assert.equal(up[19], 100);
  assert.equal(L.rsi(series(20, (i) => 50 - i), 14)[19], 0);
  assert.equal(L.rsi(series(20, () => 7), 14)[19], 50);
});

test("fibLevels: start point = 100%, end point = 0%", () => {
  const r2 = (x) => Math.round(x * 100) / 100;
  const lv = L.fibLevels(100, 200);
  assert.deepEqual(lv.map((x) => x.label), ["0%", "38.2%", "50%", "61.8%", "100%"]);
  assert.deepEqual(lv.map((x) => r2(x.price)), [200, 161.8, 150, 138.2, 100]);
  assert.deepEqual(L.fibLevels(200, 100).map((x) => r2(x.price)), [100, 138.2, 150, 161.8, 200]);
});

test("snapToCandle: nearest bar, nearer of high/low, clamped to data", () => {
  const cs = [
    { t: "2026-01-01", h: 12, l: 8 },
    { t: "2026-01-02", h: 20, l: 15 },
    { t: "2026-01-05", h: 30, l: 25 },
  ];
  assert.deepEqual(L.snapToCandle(cs, 1.3, 19), { i: 1, t: "2026-01-02", p: 20 });
  assert.deepEqual(L.snapToCandle(cs, 0.6, 16), { i: 1, t: "2026-01-02", p: 15 });
  assert.deepEqual(L.snapToCandle(cs, -4, 9), { i: 0, t: "2026-01-01", p: 8 });
  assert.deepEqual(L.snapToCandle(cs, 9.7, 31), { i: 2, t: "2026-01-05", p: 30 });
  assert.equal(L.snapToCandle([], 1, 1), null);
});

test("fmtDM: day/month without leading zeros or year", () => {
  assert.equal(L.fmtDM("2026-07-08"), "8/7");
  assert.equal(L.fmtDM("2026-12-31"), "31/12");
});

test("numberMarks: numbered by date (oldest = 1), returned newest first", () => {
  const ms = [
    { id: "m1", t: "2026-05-22", kind: "news", note: "b" },
    { id: "m2", t: "2026-03-12", kind: "buy", note: "a" },
    { id: "m3", t: "2026-07-08", kind: "sell", note: "c" },
    { id: "m10", t: "2026-05-22", kind: "other", note: "b2" },
  ];
  const out = L.numberMarks(ms);
  assert.deepEqual(out.map((m) => [m.id, m.n]), [["m3", 4], ["m10", 3], ["m1", 2], ["m2", 1]]);
  assert.equal(ms[0].n, undefined);
  assert.deepEqual(L.numberMarks(undefined), []);
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `cd web && node --test logic.test.js`
Expected: 5 test ใหม่ FAIL ด้วย `L.rsi is not a function` (และชื่ออื่นแบบเดียวกัน) test เดิมยังผ่าน

- [ ] **Step 3: เขียน implementation** — ใน `web/logic.js` วางก่อนบรรทัด `  return { marketOf, ...`

```js
  // RSI แบบ Wilder: ค่าแรกที่ index = period
  function rsi(closes, period) {
    const out = closes.map(() => null);
    if (closes.length <= period) return out;
    let gain = 0, loss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    gain /= period;
    loss /= period;
    const value = () => (gain === 0 && loss === 0 ? 50 : loss === 0 ? 100 : 100 - 100 / (1 + gain / loss));
    out[period] = value();
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      gain = (gain * (period - 1) + Math.max(d, 0)) / period;
      loss = (loss * (period - 1) + Math.max(-d, 0)) / period;
      out[i] = value();
    }
    return out;
  }
  // จุดเริ่มลาก (p1) = 100%, จุดจบ (p2) = 0% แบบ TradingView
  const FIB_RATIOS = [[0, "0%"], [0.382, "38.2%"], [0.5, "50%"], [0.618, "61.8%"], [1, "100%"]];
  function fibLevels(p1, p2) {
    return FIB_RATIOS.map(([ratio, label]) => ({ label, ratio, price: p2 + (p1 - p2) * ratio }));
  }
  // ดูดเข้าแท่งที่ใกล้ที่สุดตามแนวเวลา แล้วเลือกยอดหรือก้นไส้ที่ใกล้ราคานิ้วกว่า
  function snapToCandle(candles, logical, price) {
    if (!candles || !candles.length) return null;
    const i = Math.min(candles.length - 1, Math.max(0, Math.round(logical)));
    const c = candles[i];
    const p = Math.abs(price - c.h) <= Math.abs(price - c.l) ? c.h : c.l;
    return { i, t: c.t, p };
  }
  function fmtDM(t) {
    const [, m, d] = String(t).split("-");
    return `${Number(d)}/${Number(m)}`;
  }
  // เลขนับตามวันที่ (เก่าสุด = 1, วันเดียวกันเรียงตาม id) แล้วคืนแบบใหม่→เก่า
  function numberMarks(marks) {
    const idn = (m) => parseInt(String(m.id).slice(1), 10) || 0;
    const asc = (marks || []).slice().sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : idn(a) - idn(b)));
    return asc.map((m, i) => ({ ...m, n: i + 1 })).reverse();
  }
```

แล้วแทนบรรทัด return ทั้งบรรทัดด้วย:

```js
  return { marketOf, displaySymbol, curSym, sma, trendOf, pctFrom, range52w, isMarketOpen, checkerStale, dirFor, wouldFireNow, fmt, rsi, fibLevels, snapToCandle, fmtDM, numberMarks };
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd web && node --test`
Expected: ผ่านทั้งหมด (เดิม 37 + ใหม่ 5 = 42) ไม่มี fail

- [ ] **Step 5: Commit**

```bash
git add web/logic.js web/logic.test.js
git commit -m "feat: logic — RSI, Fibo levels, candle snapping, d/m dates, mark numbering

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: action ใหม่ใน `web/api/_changes.js` + ยืนยันตัวเช็กไม่ทิ้งข้อมูล

**Files:**
- Modify: `web/api/_changes.js` (เขียนทับทั้งไฟล์)
- Test: `web/api/_changes.test.js` (ต่อท้าย), `tests/test_check.py` (ต่อท้าย)

**Interfaces:**
- Produces: `applyChange(data, action)` รองรับเพิ่ม:
  - `{action:"reorder", order:string[]}` (ไม่ต้องมี `symbol`)
  - `{action:"add_fibo", symbol, t1, p1, t2, p2}` → เก็บ `{id:"f<N>", t1, p1, t2, p2}` ใน `symbol.fibos`
  - `{action:"remove_fibo", symbol, id}`
  - `{action:"add_mark", symbol, t, kind, note?}` → เก็บ `{id:"m<N>", t, kind, note}` ใน `symbol.marks`
  - `{action:"update_mark", symbol, id, kind, note?}` (ไม่เปลี่ยน `t`)
  - `{action:"remove_mark", symbol, id}`
- Exports เพิ่ม: `MAX_FIBOS = 3`, `MAX_MARKS = 30`, `MAX_NOTE = 200`, `MARK_KINDS`

- [ ] **Step 1: เขียน test JS ที่ยังไม่ผ่าน** — ต่อท้าย `web/api/_changes.test.js`

```js
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
```

- [ ] **Step 2: เขียน test Python** — ต่อท้าย `tests/test_check.py`

```python
def test_keeps_fibos_marks_and_unknown_keys():
    d = data()
    d["symbols"][0]["fibos"] = [{"id": "f1", "t1": "2026-03-12", "p1": 142.3, "t2": "2026-07-08", "p2": 176.85}]
    d["symbols"][0]["marks"] = [{"id": "m1", "t": "2026-03-12", "kind": "buy", "note": "ซื้อ"}]
    d["extra"] = {"keep": True}
    out = check.run(d, NOW, lambda sym: 177.6, lambda sub, payload: "ok")
    assert out["symbols"][0]["fibos"] == d["symbols"][0]["fibos"]
    assert out["symbols"][0]["marks"] == d["symbols"][0]["marks"]
    assert out["extra"] == {"keep": True}
```

- [ ] **Step 3: รันให้เห็นผล**

Run: `cd web && node --test api/_changes.test.js`
Expected: 3 test ใหม่ FAIL (ข้อความ `ไม่รู้จักคำสั่ง` / `สัญลักษณ์หุ้นไม่ถูกต้อง`) test เดิมผ่าน

Run (จาก root): `python -m pytest tests/test_check.py -q`
Expected: ผ่านทั้งหมดรวม test ใหม่ (ตัวเช็กคงข้อมูลอยู่แล้ว — test นี้เป็นตัวกันถอยหลัง) ถ้า test ใหม่ fail ให้หยุดและรายงาน อย่าแก้ตัวเช็กเอง

- [ ] **Step 4: เขียน `web/api/_changes.js` ใหม่ทั้งไฟล์**

```js
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
      if (!validDate(a.t1) || !validDate(a.t2)) return err("วันที่ไม่ถูกต้อง");
      if (!validPrice(a.p1) || !validPrice(a.p2)) return err("ราคาไม่ถูกต้อง");
      if (a.t1 === a.t2 || a.p1 === a.p2) return err("Fibo ต้องมีสองจุดที่ต่างกัน");
      if (fibos.length >= MAX_FIBOS) return err(`วาด Fibo ได้ไม่เกิน ${MAX_FIBOS} ชุดต่อหุ้น`);
      fibos.push({ id: nextId(fibos, "f"), t1: a.t1, p1: a.p1, t2: a.t2, p2: a.p2 });
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
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `cd web && node --test` และจาก root `python -m pytest tests -q`
Expected: JS ผ่านทั้งหมด (45), Python ผ่านทั้งหมด (34)

- [ ] **Step 6: ตรวจว่า `change.js` ส่งต่อ action ใหม่ได้โดยไม่ต้องแก้**

Run: `grep -n "add_symbol\|applyChange\|commit\|message" web/api/change.js`
Expected: เห็นว่า `change.js` เรียก `applyChange(d, action)` ตรงๆ และพิเศษเฉพาะ `add_symbol` (เช็ก Yahoo) — action ใหม่ไหลผ่านได้เลย ถ้าพบว่าใช้ `action.symbol` ในข้อความ commit ให้ตรวจว่า `reorder` (ไม่มี symbol) ไม่ทำให้ error; ถ้าทำให้ error ให้แก้ข้อความ commit ให้ใช้ `${action.action} ${symbol || ""}` และรายงาน

- [ ] **Step 7: Commit**

```bash
git add web/api/_changes.js web/api/_changes.test.js tests/test_check.py
git commit -m "feat: actions for reorder, Fibo and marks; guard that checker keeps them

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ข้อมูลย้อนหลัง 3 ปีใน `web/api/_yahoo.js`

**Files:**
- Modify: `web/api/_yahoo.js` (ฟังก์ชัน `fetchChart` และ `module.exports`)
- Test: `web/api/_yahoo.test.js` (แก้ test `fetchChart` เดิม 1 บรรทัด + เพิ่ม test ใหม่)

**Interfaces:**
- Produces: `fetchChart(symbol, fetchImpl)` เรียก `range=5y&interval=1d` และคืน `candles` ไม่เกิน `KEEP = 956` แท่งล่าสุด; `prevClose` และ `price` คำนวณจากข้อมูลเต็มก่อนตัด; export `KEEP`

- [ ] **Step 1: แก้ test เดิมและเพิ่ม test ใหม่** — ใน `web/api/_yahoo.test.js` แทนบรรทัด

```js
  assert.match(calledUrl, /\/v8\/finance\/chart\/PTT\.BK\?range=2y&interval=1d$/);
```
ด้วย
```js
  assert.match(calledUrl, /\/v8\/finance\/chart\/PTT\.BK\?range=5y&interval=1d$/);
```
แล้วต่อท้ายไฟล์:
```js
test("fetchChart keeps only the latest KEEP candles", async () => {
  const n = 1000;
  const ts = Array.from({ length: n }, (_, i) => 1700000000 + i * 86400);
  const vals = Array.from({ length: n }, (_, i) => 100 + i);
  const payload = chart({ meta: { gmtoffset: 0, regularMarketPrice: undefined }, timestamp: ts, quote: { open: vals, high: vals, low: vals, close: vals } });
  const out = await Y.fetchChart("NVDA", async () => ({ ok: true, json: async () => payload }));
  assert.equal(Y.KEEP, 956);
  assert.equal(out.candles.length, 956);
  assert.equal(out.candles[0].c, 100 + (n - 956));
  assert.equal(out.candles[955].c, 1099);
  assert.equal(out.prevClose, 1098);
  assert.equal(out.price, 1099);
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `cd web && node --test api/_yahoo.test.js`
Expected: 2 test FAIL (URL ยังเป็น `2y`; `Y.KEEP` เป็น `undefined`)

- [ ] **Step 3: แก้ `web/api/_yahoo.js`** — แทนฟังก์ชัน `fetchChart` และบรรทัด `module.exports` ทั้งหมดด้วย

```js
// ~3 ปีที่ดูย้อนได้ (3 × 252 วันทำการ) + 200 แท่งให้ MA200 มีค่าตั้งแต่ต้นช่วง
const KEEP = 3 * 252 + 200;

async function fetchChart(symbol, fetchImpl = fetch) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
  const r = await fetchImpl(url, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const out = parseChart(await r.json());
  if (out && out.candles.length > KEEP) out.candles = out.candles.slice(-KEEP);
  return out;
}

module.exports = { parseChart, fetchChart, KEEP };
```

- [ ] **Step 4: รันให้ผ่าน แล้วตรวจกับ Yahoo จริง**

Run: `cd web && node --test`
Expected: ผ่านทั้งหมด

Run:
```bash
cd web && node -e "const {fetchChart}=require('./api/_yahoo.js');(async()=>{for(const s of ['NVDA','PTT.BK']){const o=await fetchChart(s);console.log(s,o&&o.candles.length,o&&o.candles[0].t,o&&o.candles.at(-1).t)}})()"
```
Expected: สองบรรทัด แต่ละบรรทัดมี `956` และวันที่แรกย้อนหลังราว 3 ปี 9 เดือน ถ้าได้ `null` ให้รายงาน อย่าเดาแก้

- [ ] **Step 5: Commit**

```bash
git add web/api/_yahoo.js web/api/_yahoo.test.js
git commit -m "feat: fetch 5y daily candles and keep the latest 956 (~3 years + MA200 warm-up)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: ไอคอน badge ของ noti

**Files:**
- Modify: `tools/make_icons.py` (เขียนทับทั้งไฟล์)
- Create: `tests/test_icons.py`, `web/icons/badge-96.png` (สร้างจากสคริปต์)
- Modify: `web/sw.js` (2 บรรทัด)

**Interfaces:**
- Produces: `tools/make_icons.py` มี `app_png(size) -> bytes` (ไอคอนแอปเดิม) และ `badge_png(size) -> bytes` (RGBA แท่งเทียนขาวบนพื้นโปร่งใส); รันแล้วเขียน `icon-192.png`, `icon-512.png`, `badge-96.png`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน** — `tests/test_icons.py`

```python
import importlib.util
import struct
import zlib
from pathlib import Path

spec = importlib.util.spec_from_file_location("make_icons", Path(__file__).parent.parent / "tools" / "make_icons.py")
make_icons = importlib.util.module_from_spec(spec)
spec.loader.exec_module(make_icons)


def decode(png: bytes):
    assert png[:8] == b"\x89PNG\r\n\x1a\n"
    pos, ihdr, idat = 8, None, b""
    while pos < len(png):
        (length,) = struct.unpack(">I", png[pos:pos + 4])
        kind = png[pos + 4:pos + 8]
        body = png[pos + 8:pos + 8 + length]
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat += body
        pos += 12 + length
    return ihdr, zlib.decompress(idat)


def pixel(raw: bytes, size: int, channels: int, x: int, y: int):
    row = 1 + size * channels
    start = y * row + 1 + x * channels
    return tuple(raw[start:start + channels])


def test_badge_is_white_on_transparent():
    size = 96
    (w, h, depth, color_type, *_), raw = decode(make_icons.badge_png(size))
    assert (w, h, depth, color_type) == (96, 96, 8, 6)
    assert pixel(raw, size, 4, 0, 0) == (0, 0, 0, 0)
    assert pixel(raw, size, 4, 48, 48) == (255, 255, 255, 255)  # ตัวแท่งกลาง
    alphas = {pixel(raw, size, 4, x, y)[3] for y in range(size) for x in range(size)}
    assert alphas == {0, 255}


def test_app_icon_unchanged_shape():
    (w, h, depth, color_type, *_), _raw = decode(make_icons.app_png(192))
    assert (w, h, depth, color_type) == (192, 192, 8, 2)
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `python -m pytest tests/test_icons.py -q`
Expected: FAIL ด้วย `AttributeError: module 'make_icons' has no attribute 'badge_png'`

- [ ] **Step 3: เขียน `tools/make_icons.py` ใหม่ทั้งไฟล์**

```python
"""สร้างไอคอน PWA (PNG) ด้วย stdlib ล้วน

- icon-192/512: พื้นเข้ม + แท่งเทียน 3 แท่งสี (ไอคอนแอป)
- badge-96: แท่งเทียน 3 แท่งสีขาวบนพื้นโปร่งใส (ไอคอนเล็กใน noti — Android ใช้แค่ alpha)
"""
import struct
import sys
import zlib
from pathlib import Path

BG = (11, 17, 24)
GREEN = (38, 166, 154)
RED = (239, 83, 80)


def _chunk(kind: bytes, data: bytes) -> bytes:
    body = kind + data
    return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)


def _png(size: int, color_type: int, rows) -> bytes:
    raw = b"".join(b"\x00" + bytes(c for p in row for c in p) for row in rows)
    ihdr = struct.pack(">IIBBBBB", size, size, 8, color_type, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + _chunk(b"IHDR", ihdr) + _chunk(b"IDAT", zlib.compress(raw, 9)) + _chunk(b"IEND", b"")


def _draw(size, background, candles, wick, body):
    px = [[background] * size for _ in range(size)]

    def rect(x0, y0, x1, y1, color):
        for y in range(int(y0 * size), int(y1 * size)):
            for x in range(int(x0 * size), int(x1 * size)):
                px[y][x] = color

    # (กลางแท่ง x, ไส้บน, ตัวบน, ตัวล่าง, ไส้ล่าง, สี)
    for cx, wt, bt, bb, wb, color in candles:
        rect(cx - wick, wt, cx + wick, wb, color)
        rect(cx - body, bt, cx + body, bb, color)
    return px


def app_png(size: int) -> bytes:
    candles = [
        (0.30, 0.48, 0.54, 0.72, 0.78, RED),
        (0.50, 0.34, 0.40, 0.62, 0.68, GREEN),
        (0.70, 0.20, 0.26, 0.50, 0.58, GREEN),
    ]
    return _png(size, 2, _draw(size, BG, candles, 0.012, 0.07))


def badge_png(size: int) -> bytes:
    white = (255, 255, 255, 255)
    candles = [
        (0.20, 0.46, 0.54, 0.80, 0.90, white),
        (0.50, 0.28, 0.36, 0.66, 0.76, white),
        (0.80, 0.10, 0.18, 0.48, 0.58, white),
    ]
    return _png(size, 6, _draw(size, (0, 0, 0, 0), candles, 0.035, 0.11))


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "web/icons")
    out.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        (out / f"icon-{size}.png").write_bytes(app_png(size))
        print(f"เขียน {out / f'icon-{size}.png'}")
    (out / "badge-96.png").write_bytes(badge_png(96))
    print(f"เขียน {out / 'badge-96.png'}")
```

- [ ] **Step 4: รัน test และสร้างไฟล์**

Run: `python -m pytest tests/test_icons.py -q`
Expected: `2 passed`

Run: `python tools/make_icons.py web/icons && git status --short web/icons`
Expected: พิมพ์ 3 บรรทัด และ `git status` แสดงเฉพาะ `?? web/icons/badge-96.png` (ไอคอนแอปเดิมต้องไม่เปลี่ยน — ถ้า `icon-192.png` หรือ `icon-512.png` ขึ้นว่าแก้ไข ให้หยุดและรายงาน) เปิด `web/icons/badge-96.png` ด้วย Read tool แล้วบรรยายสั้นๆ ว่าเห็นอะไร

- [ ] **Step 5: แก้ `web/sw.js`**

แทน
```js
const CACHE = "alert-shell-v2";
```
ด้วย
```js
const CACHE = "alert-shell-v3";
```
และแทน
```js
      badge: "/icons/icon-192.png",
```
ด้วย
```js
      badge: "/icons/badge-96.png",
```

Run: `cd web && node --check sw.js`
Expected: ไม่มี output

- [ ] **Step 6: Commit**

```bash
git add tools/make_icons.py tests/test_icons.py web/icons/badge-96.png web/sw.js
git commit -m "feat: monochrome notification badge (white candles on transparent)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: หน้ารายการ — หัวข้อใหม่และโหมดจัดลำดับ

**Files:**
- Modify: `web/app.js` — แทนฟังก์ชัน `routes.list` ทั้งฟังก์ชัน (จาก `routes.list = function renderList() {` ถึง `};` ที่ปิดฟังก์ชันนั้น) และแก้ `route()`
- Modify: `web/style.css` (ต่อท้าย)

**Interfaces:**
- Consumes: `change({action:"reorder", order})` (Task 2), `state`, `rowHtml`, `loadQuote`, `lastCheckText`, `toast`, `esc`, `$`, `Logic` (มีอยู่แล้วใน `app.js`)
- Produces: ตัวแปร module `reorder` (`string[] | null`); `route()` ล้าง `reorder` เมื่อออกจากหน้ารายการ

- [ ] **Step 1: แทน `routes.list` ใน `web/app.js`** ด้วยโค้ดนี้ทั้งหมด

```js
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
```

- [ ] **Step 2: แก้ `route()` ใน `web/app.js`** — แทนบรรทัด

```js
  if (!m && activeChart) { activeChart.destroy(); activeChart = null; }
```
ด้วย
```js
  if (!m && activeChart) { activeChart.destroy(); activeChart = null; }
  if (m || hash === "#/settings") reorder = null; // ออกจากหน้ารายการ = ทิ้งการจัดลำดับที่ยังไม่บันทึก
```

- [ ] **Step 3: ต่อท้าย `web/style.css`**

```css
/* ---------- v2: หน้ารายการ ---------- */
.bar h1.title { font: 700 21px/1.2 Georgia, "Noto Serif Thai", serif; letter-spacing: .2px; }
.bar-right { display: flex; align-items: center; gap: 14px; }
.pill { font-size: 12px; padding: 5px 12px; border-radius: 999px; border: 1px solid #2d3b48; background: #121b24; color: #cfe0ef; }
.pill.on { background: #2d6cdf; border-color: #2d6cdf; color: #fff; }
.hint { padding: 0 16px 8px; margin: 0; }
.arrows { display: flex; gap: 6px; }
.arrows button { width: 40px; height: 34px; border: 1px solid #2d3b48; border-radius: 8px; background: transparent; color: #cfe0ef; }
.arrows button:disabled { opacity: .25; }
```

- [ ] **Step 4: ตรวจ syntax และ test**

Run: `cd web && node --check app.js && node --test`
Expected: `--check` ไม่มี output, test ผ่านทั้งหมด

- [ ] **Step 5: Commit**

```bash
git add web/app.js web/style.css
git commit -m "feat: list title '100 Bagger Stocks' and reorder mode with up/down arrows

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: `web/chart.js` — RSI, marker, Fibo primitive, โหมดวาด

**Files:**
- Modify: `web/chart.js` (เขียนทับทั้งไฟล์)

**Interfaces:**
- Consumes: global `LightweightCharts` (4.1.3), `Logic.sma`, `Logic.rsi`, `Logic.fibLevels`, `Logic.snapToCandle`, `Logic.fmt` (Task 1)
- Produces: `AlertChart.create(el, opts)` โดย `opts = { onLongPress(price), onFiboDrawn({t1,p1,t2,p2}), onMarkTap(t) }` คืน object:
  - `setData(candles:{t,o,h,l,c}[])` — แท่ง + MA50/MA200 + RSI 14; เปิดที่ 252 แท่งล่าสุด
  - `setLines(lines)` — เหมือนเดิม
  - `setFibos(items:{t1,p1,t2,p2}[], preview:{t1,p1,t2,p2}|null)`
  - `setMarks(marks:{t,kind,n}[])` — mark ที่ `t` ไม่อยู่ในข้อมูลจะไม่แสดง
  - `setMode(mode: null | "fibo" | "mark")` — ปิดเลื่อน/ซูมและแตะค้างระหว่างโหมด; เพิ่ม/ลบ class `drawing` ที่ `el`
  - `scrollToTime(t)` — เลื่อนให้แท่งวันที่ `t` อยู่กลางจอ (ความกว้างช่วงเดิม)
  - `destroy()`

- [ ] **Step 1: ยืนยัน API ที่ใช้มีในไลบรารี**

Run:
```bash
cd web/vendor && for n in attachPrimitive useMediaCoordinateSpace coordinateToLogical setVisibleLogicalRange getVisibleLogicalRange setMarkers autoscaleInfoProvider priceScaleId handleScroll handleScale; do printf '%-26s %s\n' "$n" "$(grep -o "$n" lightweight-charts.js | wc -l)"; done
```
Expected: ทุกบรรทัดมีตัวเลขมากกว่า 0 ถ้ามีตัวไหนเป็น 0 ให้หยุดและรายงาน (NEEDS_CONTEXT)

- [ ] **Step 2: เขียน `web/chart.js` ใหม่ทั้งไฟล์**

```js
// ห่อ lightweight-charts 4.1.3: แท่งรายวัน + MA50/MA200 + RSI 14 + เส้นราคา + Fibo + mark + โหมดวาด
(function (root) {
  const C = {
    bg: "#0f1720", grid: "#1e2a36", text: "#8aa0b4", up: "#26a69a", down: "#ef5350",
    ma50: "#5aa9ff", ma200: "#b08cff", rsi: "#9fb6ff", fibo: "#e0a64a",
  };
  const LINE_COLORS = { sl: "#ef5350", tp: "#26a69a", alert: "#f5b83d", fired: "#5c6b7a", ref: "#3a4a5a" };
  const MARK_STYLE = {
    buy: { shape: "arrowUp", position: "belowBar", color: "#26a69a" },
    sell: { shape: "arrowDown", position: "aboveBar", color: "#ef5350" },
    news: { shape: "circle", position: "aboveBar", color: "#3d9cf0" },
    other: { shape: "square", position: "aboveBar", color: "#8aa0b4" },
  };
  const LONG_PRESS_MS = 550;
  const MOVE_TOLERANCE = 10;
  const VISIBLE_BARS = 252;

  // วาด Fibo เฉพาะช่วงเวลาระหว่างสองจุด (series primitive)
  class FiboPrimitive {
    constructor() { this.items = []; this.preview = null; this.chart = null; this.series = null; this.request = null; }
    attached({ chart, series, requestUpdate }) { this.chart = chart; this.series = series; this.request = requestUpdate; }
    detached() { this.chart = null; this.series = null; this.request = null; }
    set(items, preview) {
      this.items = items || [];
      this.preview = preview || null;
      if (this.request) this.request();
    }
    updateAllViews() {}
    paneViews() {
      return [{ zOrder: () => "top", renderer: () => ({ draw: (target) => this.draw(target) }) }];
    }
    draw(target) {
      if (!this.chart || !this.series) return;
      const ts = this.chart.timeScale();
      const y = (p) => this.series.priceToCoordinate(p);
      const all = this.preview ? [...this.items, { ...this.preview, preview: true }] : this.items;
      target.useMediaCoordinateSpace(({ context: ctx }) => {
        for (const f of all) {
          const x1 = ts.timeToCoordinate(f.t1);
          const x2 = ts.timeToCoordinate(f.t2);
          const ya = y(f.p1);
          const yb = y(f.p2);
          if (x1 == null || x2 == null || ya == null || yb == null) continue;
          const left = Math.min(x1, x2);
          const right = Math.max(x1, x2);
          const alpha = f.preview ? 0.75 : 1;
          const levels = Logic.fibLevels(f.p1, f.p2);
          ctx.save();
          ctx.strokeStyle = C.fibo;
          ctx.fillStyle = C.fibo;
          ctx.lineWidth = 1;
          ctx.font = "10px system-ui, sans-serif";
          const y382 = y(levels[1].price);
          const y618 = y(levels[3].price);
          if (y382 != null && y618 != null) {
            ctx.globalAlpha = alpha * 0.1;
            ctx.fillRect(left, Math.min(y382, y618), right - left, Math.abs(y618 - y382));
          }
          ctx.globalAlpha = alpha * 0.7;
          ctx.setLineDash([2, 3]);
          ctx.beginPath(); ctx.moveTo(x1, ya); ctx.lineTo(x2, yb); ctx.stroke();
          ctx.setLineDash([]);
          ctx.globalAlpha = alpha;
          for (const lv of levels) {
            const ly = y(lv.price);
            if (ly == null) continue;
            ctx.beginPath(); ctx.moveTo(left, ly); ctx.lineTo(right, ly); ctx.stroke();
            ctx.fillText(`${lv.label} · ${Logic.fmt(lv.price)}`, left + 3, ly - 3);
          }
          ctx.beginPath(); ctx.arc(x1, ya, 3, 0, Math.PI * 2); ctx.fill();
          ctx.beginPath(); ctx.arc(x2, yb, 3, 0, Math.PI * 2); ctx.fill();
          ctx.restore();
        }
      });
    }
  }

  function create(el, opts) {
    const o = opts || {};
    const LC = root.LightweightCharts;
    const chart = LC.createChart(el, {
      autoSize: true,
      layout: { background: { color: C.bg }, textColor: C.text },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.grid, scaleMargins: { top: 0.06, bottom: 0.27 } },
      timeScale: { borderColor: C.grid },
      crosshair: { mode: LC.CrosshairMode.Normal },
    });
    const candles = chart.addCandlestickSeries({
      upColor: C.up, downColor: C.down, borderUpColor: C.up, borderDownColor: C.down,
      wickUpColor: C.up, wickDownColor: C.down,
    });
    const lineOpts = { priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false };
    const ma50 = chart.addLineSeries({ ...lineOpts, color: C.ma50, lineWidth: 2 });
    const ma200 = chart.addLineSeries({ ...lineOpts, color: C.ma200, lineWidth: 1, lineStyle: LC.LineStyle.Dashed });

    // RSI อยู่ช่วงล่าง ~20% บน price scale แยก (แกนวันที่ยังอยู่ล่างสุดของกราฟ)
    const rsi = chart.addLineSeries({
      ...lineOpts, color: C.rsi, lineWidth: 1, priceScaleId: "rsi",
      autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
    });
    chart.priceScale("rsi").applyOptions({ scaleMargins: { top: 0.78, bottom: 0.02 } });
    rsi.createPriceLine({ price: 70, color: "#ef5350", lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: false });
    rsi.createPriceLine({ price: 30, color: "#26a69a", lineWidth: 1, lineStyle: LC.LineStyle.Dashed, axisLabelVisible: false });

    const fibo = new FiboPrimitive();
    candles.attachPrimitive(fibo);

    let cs = [];
    let priceLines = [];
    let fiboItems = [];
    let mode = null;

    function setData(input) {
      cs = input || [];
      candles.setData(cs.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));
      const closes = cs.map((c) => c.c);
      const toLine = (arr) => arr.map((v, i) => (v == null ? null : { time: cs[i].t, value: v })).filter(Boolean);
      ma50.setData(toLine(Logic.sma(closes, 50)));
      ma200.setData(toLine(Logic.sma(closes, 200)));
      rsi.setData(toLine(Logic.rsi(closes, 14)));
      if (cs.length) {
        chart.timeScale().setVisibleRange({ from: cs[Math.max(0, cs.length - VISIBLE_BARS)].t, to: cs[cs.length - 1].t });
      }
    }

    function setLines(lines) {
      priceLines.forEach((l) => candles.removePriceLine(l));
      priceLines = lines.map((l) =>
        candles.createPriceLine({
          price: l.price,
          color: LINE_COLORS[l.color],
          lineWidth: l.color === "ref" ? 1 : 2,
          lineStyle: l.color === "ref" ? LC.LineStyle.Dotted : LC.LineStyle.Dashed,
          axisLabelVisible: true,
          title: l.title,
        })
      );
    }

    function setFibos(items, preview) {
      fiboItems = items || [];
      fibo.set(fiboItems, preview || null);
    }

    function setMarks(marks) {
      const known = new Set(cs.map((c) => c.t));
      const list = (marks || [])
        .filter((m) => known.has(m.t) && MARK_STYLE[m.kind])
        .slice()
        .sort((a, b) => (a.t < b.t ? -1 : a.t > b.t ? 1 : a.n - b.n))
        .map((m) => ({ time: m.t, ...MARK_STYLE[m.kind], text: String(m.n) }));
      candles.setMarkers(list);
    }

    function scrollToTime(t) {
      const i = cs.findIndex((c) => c.t === t);
      const r = chart.timeScale().getVisibleLogicalRange();
      if (i < 0 || !r) return;
      const half = (r.to - r.from) / 2;
      chart.timeScale().setVisibleLogicalRange({ from: i - half, to: i + half });
    }

    // ---------- pointer: แตะค้าง (ปกติ), ลาก Fibo, แตะปัก mark ----------
    let timer = null;
    let start = null;
    let drag = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    const toFibo = (a, b) => ({ t1: a.t, p1: a.p, t2: b.t, p2: b.p });
    const moved = (e) => start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE;

    function pointAt(e) {
      const r = el.getBoundingClientRect();
      const logical = chart.timeScale().coordinateToLogical(e.clientX - r.left);
      const price = candles.coordinateToPrice(e.clientY - r.top);
      if (logical == null || price == null) return null;
      return Logic.snapToCandle(cs, logical, price);
    }

    const onDown = (e) => {
      cancel();
      start = { x: e.clientX, y: e.clientY };
      if (mode === "fibo") {
        const a = pointAt(e);
        drag = a ? { a, b: null } : null;
        return;
      }
      if (mode) return;
      const s0 = start;
      timer = setTimeout(() => {
        const price = candles.coordinateToPrice(s0.y - el.getBoundingClientRect().top);
        if (price != null && price > 0 && o.onLongPress) o.onLongPress(Math.round(price * 100) / 100);
      }, LONG_PRESS_MS);
    };

    const onMove = (e) => {
      if (mode === "fibo" && drag) {
        const b = pointAt(e);
        if (b) { drag.b = b; fibo.set(fiboItems, toFibo(drag.a, b)); }
        return;
      }
      if (moved(e)) cancel();
    };

    const onUp = (e) => {
      cancel();
      if (mode === "fibo" && drag) {
        const { a, b } = drag;
        drag = null;
        if (b && b.t !== a.t && b.p !== a.p) {
          if (o.onFiboDrawn) o.onFiboDrawn(toFibo(a, b));
        } else {
          fibo.set(fiboItems, null);
        }
      } else if (mode === "mark" && start && !moved(e)) {
        const p = pointAt(e);
        if (p && o.onMarkTap) o.onMarkTap(p.t);
      }
      start = null;
    };

    const onCancel = () => {
      cancel();
      if (drag) { drag = null; fibo.set(fiboItems, null); }
      start = null;
    };

    function setMode(m) {
      mode = m || null;
      onCancel();
      chart.applyOptions({ handleScroll: !mode, handleScale: !mode });
      el.classList.toggle("drawing", !!mode);
      fibo.set(fiboItems, null);
    }

    const noMenu = (e) => e.preventDefault();
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("pointercancel", onCancel, true);
    el.addEventListener("pointerleave", cancel, true);
    el.addEventListener("contextmenu", noMenu);

    return {
      setData,
      setLines,
      setFibos,
      setMarks,
      setMode,
      scrollToTime,
      destroy() { onCancel(); chart.remove(); },
    };
  }

  root.AlertChart = { create };
})(self);
```

- [ ] **Step 3: ตรวจ syntax และ test**

Run: `cd web && node --check chart.js && node --check app.js && node --test`
Expected: `--check` ไม่มี output, test ผ่านทั้งหมด (`app.js` ยังเรียกเฉพาะ `setData`/`setLines` ซึ่งยังมีอยู่)

- [ ] **Step 4: Commit**

```bash
git add web/chart.js
git commit -m "feat: chart — RSI pane, mark markers, Fibo primitive, draw/mark modes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: หน้ากราฟ — ปุ่ม Fibo/Mark, แผ่น mark, รายการ note

**Files:**
- Modify: `web/index.html` (เพิ่ม `<section id="msheet">` ต่อจาก `</section>` ของ `#sheet`)
- Modify: `web/app.js` — แทนทั้งช่วงตั้งแต่บรรทัด `// ---------- chart view ----------` จนถึงก่อนบรรทัด `// ---------- router ----------`; แก้ `route()` 1 บรรทัด
- Modify: `web/style.css` (ต่อท้าย)

**Interfaces:**
- Consumes: `AlertChart.create` + method ทั้งหมดของ Task 6; `Logic.fmtDM`, `Logic.numberMarks` (Task 1); action `add_fibo`, `remove_fibo`, `add_mark`, `update_mark`, `remove_mark` (Task 2); `Sheet`, `change`, `loadQuote`, `toast`, `esc`, `$`, `TREND`, `state`, `routes` (มีอยู่แล้ว)
- Produces: `window.MarkSheet = { open(opts), close() }` โดย `opts = { symbol, t, id?, kind?, note?, onSaved? }`

- [ ] **Step 1: เพิ่ม markup ใน `web/index.html`** — วางต่อจากบรรทัด `</section>` ที่ปิด `#sheet` (ก่อน `<div id="toast"`)

```html
  <section id="msheet" class="sheet" hidden aria-modal="true" role="dialog">
    <h2 id="msheet-title"></h2>
    <div id="msheet-kinds" class="seg kinds">
      <button type="button" data-kind="buy"><span class="k-buy">▲</span> ซื้อ</button>
      <button type="button" data-kind="sell"><span class="k-sell">▼</span> ขาย</button>
      <button type="button" data-kind="news"><span class="k-news">●</span> ข่าว</button>
      <button type="button" data-kind="other"><span class="k-other">■</span> อื่นๆ</button>
    </div>
    <textarea id="msheet-note" maxlength="200" rows="3" placeholder="บันทึก (ไม่บังคับ)"></textarea>
    <p class="muted" id="msheet-count">0/200</p>
    <div class="sheet-actions">
      <button type="button" id="msheet-cancel" class="btn ghost">ยกเลิก</button>
      <button type="button" id="msheet-save" class="btn primary">บันทึก</button>
    </div>
  </section>
```

- [ ] **Step 2: แทนช่วง chart view ใน `web/app.js`** — ลบตั้งแต่บรรทัด `// ---------- chart view ----------` จนถึงบรรทัดก่อน `// ---------- router ----------` แล้ววางโค้ดนี้แทน

```js
// ---------- mark sheet ----------
const MARK_SYM = { buy: "▲", sell: "▼", news: "●", other: "■" };

window.MarkSheet = (function () {
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
    <span class="acts"><button class="link" data-act="remove" data-kind="fibo" data-target="${esc(f.id)}">ลบ</button></span></div>`;
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

  const openSheet = (kind, price, extra) =>
    Sheet.open({ symbol, last: q.price, kind, price, onSaved: redraw, ...extra });

  const chart = AlertChart.create($("#chart"), {
    onLongPress: (price) => openSheet("alert", price, { choose: true }),
    onFiboDrawn: (f) => { pendingFibo = f; renderDrawbar(); },
    onMarkTap: (tm) => { setMode(null); MarkSheet.open({ symbol, t: tm, onSaved: redraw }); },
  });
  activeChart = chart;
  chart.setData(q.candles);

  function redraw() {
    const s = find();
    if (!s || activeChart !== chart) return;
    chart.setLines(chartLines(s, q));
    chart.setFibos(s.fibos || [], pendingFibo);
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
      ? `<span class="muted">${Logic.fmt(pendingFibo.p1)} → ${Logic.fmt(pendingFibo.p2)}</span>
         <span class="acts"><button type="button" class="link" data-draw="redo">วาดใหม่</button><button type="button" class="btn primary small" data-draw="save">บันทึก</button></span>`
      : '<span class="muted">ลากนิ้วจากจุดเริ่มไปจุดจบ</span>';
  }

  function setMode(m) {
    mode = m;
    pendingFibo = null;
    chart.setMode(m);
    document.querySelectorAll("#view .tbtn").forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle("on", on);
      b.textContent = on ? "ยกเลิก" : b.dataset.label;
      b.disabled = !!m && !on;
    });
    $(".btns").classList.toggle("off", !!m);
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
    const act = e.target.dataset && e.target.dataset.draw;
    if (act === "redo") { pendingFibo = null; renderDrawbar(); redraw(); return; }
    if (act !== "save" || !pendingFibo) return;
    const f = pendingFibo;
    e.target.disabled = true;
    try {
      await change({ action: "add_fibo", symbol, ...f });
      if (activeChart !== chart) return;
      setMode(null);
      toast("บันทึก Fibo แล้ว");
    } catch (err) {
      toast(err.message);
      e.target.disabled = false;
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

```

- [ ] **Step 3: แก้ `route()` ใน `web/app.js`** — แทนบรรทัด

```js
  if (window.Sheet) window.Sheet.close();
```
ด้วย
```js
  if (window.Sheet) window.Sheet.close();
  if (window.MarkSheet) window.MarkSheet.close();
```

- [ ] **Step 4: ต่อท้าย `web/style.css`**

```css
/* ---------- v2: หน้ากราฟ ---------- */
.sub { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 16px 8px; }
.tools { display: flex; gap: 6px; }
.tbtn { font-size: 12px; padding: 4px 11px; border-radius: 8px; border: 1px solid #2d3b48; background: #121b24; color: #cfe0ef; }
.tbtn.on { background: #2d6cdf; border-color: #2d6cdf; color: #fff; }
.tbtn:disabled { opacity: .35; }
#chart.drawing { touch-action: none; outline: 1px solid #2d6cdf; outline-offset: -1px; }
.drawbar { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 8px 16px; background: #101a24; }
.drawbar .acts { display: flex; align-items: center; gap: 16px; }
.btn.small { padding: 6px 14px; }
.btns.off { opacity: .35; pointer-events: none; }
.c-fibo { color: #e0a64a; }
.k-buy { color: var(--up); } .k-sell { color: var(--down); } .k-news { color: #3d9cf0; } .k-other { color: var(--muted); }
.seg.kinds button { font-size: 13px; }
#msheet-note {
  width: 100%; margin-top: 4px; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r);
  padding: 10px 12px; font: 15px/1.6 Georgia, "Noto Serif Thai", serif; color: var(--text); resize: none;
}
#msheet-count { text-align: right; margin: 4px 0 0; }

/* รายการ note แบบนิตยสาร */
.notes { padding: 4px 20px 12px; }
.notes h3 { font: italic 400 16px/1.3 Georgia, "Noto Serif Thai", serif; color: #cfe0ef; margin: 16px 0 4px; letter-spacing: .3px; }
.n { display: grid; grid-template-columns: 16px 14px 38px 1fr; gap: 8px; align-items: baseline; padding: 12px 0; border-top: 1px solid var(--line); font-size: 14px; cursor: pointer; }
.n .no { color: var(--fired); font-size: 11px; font-variant-numeric: tabular-nums; }
.n .dt { color: var(--muted); font-size: 12px; font-variant-numeric: tabular-nums; }
.n .tx { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #dfe7ee; }
.n.open { background: var(--panel); margin: 0 -20px; padding: 14px 20px; }
.n.open .tx { white-space: normal; font: 15px/1.7 Georgia, "Noto Serif Thai", serif; color: #eef3f7; }
.n .acts { grid-column: 4; display: flex; gap: 22px; margin-top: 8px; font-size: 13px; }
.link.del { color: #ff8a86; }
```

- [ ] **Step 5: ตรวจ syntax และ test**

Run: `cd web && node --check app.js && node --check chart.js && node --test`
Expected: `--check` ไม่มี output, test ผ่านทั้งหมด

- [ ] **Step 6: ตรวจใน browser ด้วย dev server**

คัดลอกโค้ด dev server จาก `docs/superpowers/plans/2026-11-13-stock-alert-app.md` (Task 8 Step 7 บล็อก `dev-server.js`) ไปไว้ในโฟลเดอร์ scratchpad ของ session (ไม่ใช่ใน repo) แล้วรันด้วย `node <scratchpad>/dev-server.js "<path ของ Alert>/web"` (พอร์ต 5178, รหัสผ่าน `dev`) เปิด `http://localhost:5178` ที่ความกว้าง 375px แล้วตรวจ:

1. หน้ารายการ: หัวข้อ `100 Bagger Stocks`; เพิ่ม `NVDA`, `PTT.BK`, `MELI` → กด "จัดลำดับ" → ▲ ของแถวแรกและ ▼ ของแถวสุดท้ายกดไม่ได้ → ย้าย `MELI` ขึ้นบนสุด → "เสร็จ" → ลำดับใหม่คงอยู่หลังรีโหลด
2. หน้ากราฟ `NVDA`: แถบบนมีปุ่ม `Fibo` `Mark` ขวา, บรรทัดที่สองมีราคา/%/แนวโน้ม; มี RSI ช่วงล่างพร้อมเส้น 30/70; แกนวันที่อยู่ล่างสุด; เลื่อนย้อนดูได้ราว 3 ปี
3. กด `Fibo` → ปุ่มเป็น "ยกเลิก", ปุ่ม `Mark` และ SL/TP/Alert จาง, ลากกราฟแล้วกราฟไม่เลื่อน; ลากจากก้นไปยอด → เห็นเส้น Fibo ยาวเฉพาะช่วง ป้ายปลายซ้าย, จุดเริ่ม = 100%, จุดจบ = 0%; "วาดใหม่" ลบ preview; ลากอีกครั้ง → "บันทึก" → ออกจากโหมด, รายการมีแถว `Fibo … → …  d/m – d/m`
4. วาด Fibo ให้ครบ 3 ชุด แล้วกด `Fibo` อีกครั้ง → toast เรื่องเพดาน; ลบ 1 ชุดจากรายการ → เส้นหาย
5. กด `Mark` → แตะแท่งเทียน → แผ่น mark ขึ้นพร้อมวันที่ `d/m` ในหัวข้อ → เลือก ▼ ขาย พิมพ์ข้อความยาวราว 80 ตัวอักษร → บันทึก → marker ▼ พร้อมเลขขึ้นบนกราฟ; ปักอีก 2 อันคนละวัน
6. รายการ "บันทึก": ใหม่อยู่บน, เลขตรงกับ marker, ข้อความยาวถูกตัดด้วย "…"; แตะแถว → กราฟเลื่อนไปที่ mark และแถวกางพร้อม "แก้" "ลบ"; แตะแถวอื่น → แถวแรกหุบ; "แก้" เปลี่ยนสัญลักษณ์และข้อความได้ วันที่ไม่เปลี่ยน; "ลบ" ลบ marker และแถว
7. แตะค้างบนกราฟนอกโหมด → แผ่นตั้งราคาเปิดเหมือนเดิม; ระหว่างโหมด Fibo/Mark แตะค้างไม่เปิดแผ่น
8. Console ไม่มี error (ยกเว้นข้อความ service worker ที่รู้อยู่แล้วว่าลงทะเบียนไม่ได้ใน browser ในตัว)

ข้อที่ต้องใช้นิ้วจริง (ลาก Fibo บนจอสัมผัส) ถ้าทดสอบได้แค่ด้วยเมาส์หรือ PointerEvent สังเคราะห์ ให้รายงานว่าข้อนั้นยังไม่ได้ทดสอบด้วยนิ้ว หยุด dev server เมื่อเสร็จ

- [ ] **Step 7: Commit**

```bash
git add web/index.html web/app.js web/style.css
git commit -m "feat: chart page — Fibo/Mark tools in top bar, mark sheet, magazine-style notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: README, ตรวจรวม และ deploy

**Files:**
- Modify: `README.md` (หัวข้อ `## ใช้งาน`)

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า; Vercel CLI ที่ล็อกอินอยู่ในเครื่อง; โปรเจกต์ Vercel `stock-alert` ที่ link ไว้ใน `web/.vercel`

- [ ] **Step 1: แทนเนื้อหาใต้ `## ใช้งาน` ใน `README.md`** (จนถึงหัวข้อ `##` ถัดไป) ด้วย

```markdown
## ใช้งาน

- **เพิ่มหุ้น:** พิมพ์ชื่อในหน้ารายการ หุ้นไทยเติม `.BK` เช่น `PTT.BK`
- **จัดลำดับ:** กด "จัดลำดับ" → ▲ ▼ → "เสร็จ"
- **ตั้งเส้น:** กดปุ่ม SL / TP / ＋Alert หรือแตะค้างบนกราฟ
- **หลังแจ้งเตือน:** เส้นเป็นสีเทา กด "เปิดใช้ซ้ำ" หรือ "ลบ"
- **ป้ายแนวโน้ม:** ขาขึ้น = ราคา > MA50 > MA200 · ขาลง = ราคา < MA50 < MA200 · นอกนั้นไซด์เวย์
- **RSI 14:** ช่วงล่างของกราฟ เส้น 70 (แดง) และ 30 (เขียว) — แสดงผลอย่างเดียว ไม่มีการแจ้งเตือน
- **ข้อมูลย้อนหลัง:** ราว 3 ปี เปิดมาเห็น 1 ปี ลากกราฟไปทางซ้ายเพื่อดูย้อนหลัง
- **Fibo:** กด `Fibo` บนแถบบน → ลากนิ้วจากจุดเริ่มไปจุดจบ (ปลายดูดเข้าไส้เทียน) → "บันทึก" หรือ "วาดใหม่"
  จุดเริ่ม = 100%, จุดจบ = 0% · สูงสุด 3 ชุดต่อหุ้น · ลบได้จากรายการใต้ปุ่ม
- **Mark + บันทึก:** กด `Mark` → แตะแท่งเทียน → เลือก ▲ ซื้อ / ▼ ขาย / ● ข่าว / ■ อื่นๆ และพิมพ์บันทึก (≤ 200 ตัวอักษร)
  รายการบันทึกใต้กราฟเรียงใหม่→เก่า แตะแถวเพื่ออ่านเต็มและเลื่อนกราฟไปที่จุดนั้น · สูงสุด 30 อันต่อหุ้น
- Fibo และบันทึกเก็บใน `alerts.json` บน repo public — ใครเปิดดู repo ก็อ่านได้
```

- [ ] **Step 2: ตรวจรวม**

Run: `cd web && node --test && node --check app.js && node --check chart.js && node --check sw.js && cd .. && python -m pytest tests -q && git status --short`
Expected: JS ผ่านทั้งหมด, Python ผ่านทั้งหมด, `git status` เหลือเฉพาะ `README.md`

- [ ] **Step 3: Commit และ push**

```bash
git add README.md
git commit -m "docs: README — reorder, RSI, Fibo, marks and notes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git push origin main
```

- [ ] **Step 4: Deploy**

Run: `cd web && npx vercel deploy --prod --yes`
Expected: มี URL ของ deployment และสถานะสำเร็จ ถ้า CLI ขอให้ล็อกอิน ให้หยุดและรายงาน (ห้ามล็อกอินแทนผู้ใช้)

- [ ] **Step 5: ตรวจบนเว็บจริง**

Run:
```bash
U=https://stock-alert-plum.vercel.app
curl -s "$U/api/candles?symbol=NVDA" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log('candles',j.candles.length,'first',j.candles[0].t)})"
for p in /icons/badge-96.png /chart.js /app.js; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$U$p")" "$p"; done
curl -s "$U/sw.js" | grep -c "badge-96"
curl -s "$U/" | grep -c "msheet"
```
Expected: `candles 956 first <ราว 3 ปี 9 เดือนก่อน>`, ทั้งสามไฟล์ `200`, และ `1` สองบรรทัดสุดท้าย

- [ ] **Step 6: รายงานสิ่งที่ยังไม่ได้ทดสอบ**

ในรายงาน ระบุว่ายังต้องให้ผู้ใช้ตรวจบนมือถือจริง:
- ลากนิ้ววาด Fibo บนจอสัมผัส และการที่หน้าไม่เลื่อนระหว่างลาก
- ไอคอนเล็กใน noti เป็นแท่งเทียนขาว (ต้องให้ service worker เวอร์ชันใหม่ติดตั้งก่อน: ปิดแอปแล้วเปิดใหม่ จากนั้นกด "ทดสอบ noti")
- ข้อความ note แสดงตัวอักษรแบบมีเชิงภาษาไทยได้หรือไม่ ขึ้นกับฟอนต์ที่มีบนเครื่อง
