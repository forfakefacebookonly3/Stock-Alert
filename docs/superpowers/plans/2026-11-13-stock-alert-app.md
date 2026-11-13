# Stock Alert App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PWA มือถือสำหรับดูกราฟแท่งรายวัน วางเส้น SL/TP/alert และรับ Web Push เมื่อราคาแตะ สำหรับหุ้นสหรัฐและหุ้นไทยไม่เกิน 20 ตัว ฟรีตลอดไป

**Architecture:** หน้าแอป static + Vercel serverless functions (Node, CommonJS) อ่าน/เขียน `alerts.json` บน branch `data` ผ่าน GitHub Contents API ตัวเช็ก Python รันด้วย GitHub Actions cron ทุก 15 นาที ดึงราคาด้วย yfinance แล้วส่ง Web Push ไม่เก็บไฟล์ราคา กราฟดึงสดจาก Yahoo ผ่าน `/api/candles`

**Tech Stack:** Vanilla JS + lightweight-charts v4.1.3 (vendored), Node 22 (`node --test`), `web-push` (npm), Python 3.12 + `yfinance` + `pywebpush` + `pytest`, GitHub Actions, Vercel Hobby

**Spec:** `docs/superpowers/specs/2026-11-13-stock-alert-app-design.md`

## Global Constraints

- โฟลเดอร์งานคือ `C:\Users\COJ\Desktop\Claude\Sessions\Stock News\Alert` (git repo ของตัวเอง, branch `main`) ทุก path ในแผนนี้เทียบกับโฟลเดอร์นี้
- ห้ามแก้ไฟล์ของ Stock News (โฟลเดอร์แม่) ยกเว้น Task 10 ที่เพิ่ม `Alert/` ใน `.gitignore`
- ห้าม push ไป GitHub, ห้ามสร้าง repo/โปรเจกต์ Vercel, ห้ามใส่ secret — ผู้ใช้ทำเองตาม README
- Vercel Root Directory = `web`; ไฟล์ใน `web/api/` ที่ขึ้นต้นด้วย `_` ไม่ถูก route (ใช้เป็นโมดูลและ test)
- API เป็น CommonJS: `module.exports = async (req, res) => {...}`
- สัญลักษณ์หุ้น: รูปแบบ Yahoo, regex `^[A-Z0-9.\-]{1,12}$`, ลงท้าย `.BK` = ตลาดไทย
- เพดาน: 20 หุ้น, alert ทั่วไป 5 เส้นต่อหุ้น, SL 1, TP 1
- ช่วงเวลาตลาด (ชั่วโมง UTC รวมปลาย, จ.–ศ. ตาม UTC): TH 3–9, US 13–21 — ต้องตรงกันใน `web/logic.js` และ `checker/hours.py`
- รหัสผ่าน: header `x-app-pass` เทียบกับ env `APP_PASSCODE`
- ข้อความที่ผู้ใช้เห็นเป็นภาษาไทย ราคาแสดงทศนิยม 2 ตำแหน่ง
- ข้อความ noti: `NVDA แตะ SL 178.00 (ล่าสุด 177.60)` / `แตะ TP` / `ขึ้นถึง` / `ลงถึง` (ชื่อหุ้นตัด `.BK`)
- Payload ของ push (ใช้ทั้ง Python และ JS): `{"title": str, "body": str, "url": "/#/s/<SYMBOL>"}`
- Log ของตัวเช็กห้ามพิมพ์ endpoint ของ push
- Commit หลังจบทุก task ลงท้าย commit message ด้วย `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>`

## File Structure

```
web/
  index.html  style.css  manifest.webmanifest  sw.js  vercel.json  package.json
  icons/icon-192.png  icons/icon-512.png
  vendor/lightweight-charts.js      คัดลอกจาก ../web/vendor (v4.1.3)
  logic.js  logic.test.js           pure: ตลาด, MA, แนวโน้ม, ช่วงเวลาตลาด
  chart.js                          ห่อ lightweight-charts
  app.js                            router, หน้าจอ, เรียก API
  api/
    _changes.js  _changes.test.js   pure: applyChange, applySubscription
    _yahoo.js    _yahoo.test.js     parseChart (pure), fetchChart
    _store.js    _store.test.js     อ่าน/เขียน alerts.json, mutate, publicView
    _auth.js                        checkPass
    _push.js     _push.test.js      sendAll ด้วย web-push
    candles.js data.js change.js subscribe.js test-push.js status.js
checker/
  __init__.py  hours.py  rules.py  prices.py  push.py  check.py
tests/
  test_hours.py  test_rules.py  test_check.py
tools/make_icons.py
.github/workflows/check.yml
requirements.txt  README.md
```

---

### Task 1: โครงโปรเจกต์ + `web/logic.js`

**Files:**
- Create: `web/package.json`, `web/vercel.json`, `web/logic.js`, `web/logic.test.js`
- Create (copy): `web/vendor/lightweight-charts.js`

**Interfaces:**
- Produces (browser global `Logic`, และ `require("./logic.js")` ใน Node):
  - `marketOf(symbol) -> "TH"|"US"`, `displaySymbol(symbol) -> string`, `curSym(symbol) -> "฿"|"$"`
  - `sma(values:number[], period) -> (number|null)[]` ยาวเท่า input
  - `trendOf(closes:number[]) -> "up"|"down"|"side"|null`
  - `pctFrom(price, ref) -> number|null`
  - `range52w(candles:{h,l}[]) -> {high, low}|null`
  - `isMarketOpen(market, date:Date) -> boolean`
  - `dirFor(price, last) -> "above"|"below"`
  - `wouldFireNow(kind:"sl"|"tp"|"above"|"below", price, last) -> boolean`
  - `fmt(n) -> string` (ทศนิยม 2 ตำแหน่ง)

- [ ] **Step 1: สร้างไฟล์โครง**

`web/package.json`:
```json
{
  "name": "stock-alert-web",
  "version": "1.0.0",
  "private": true,
  "scripts": { "test": "node --test" },
  "dependencies": { "web-push": "^3.6.7" }
}
```

`web/vercel.json`:
```json
{
  "cleanUrls": true,
  "git": { "deploymentEnabled": { "data": false } }
}
```

คัดลอกไลบรารีกราฟ:
```bash
mkdir -p web/vendor web/api && cp "../web/vendor/lightweight-charts.js" web/vendor/lightweight-charts.js
```

- [ ] **Step 2: เขียน test ที่ยังไม่ผ่าน** — `web/logic.test.js`

```js
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
```

- [ ] **Step 3: รันให้เห็นว่า fail**

Run: `cd web && node --test logic.test.js`
Expected: FAIL — `Cannot find module './logic.js'`

- [ ] **Step 4: เขียน `web/logic.js`**

```js
// Pure helpers ใช้ทั้งในเบราว์เซอร์ (global Logic) และ Node (require)
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const TH_SUFFIX = ".BK";
  // ชั่วโมง UTC (รวมปลาย) จ.–ศ. — ต้องตรงกับ checker/hours.py
  const WINDOWS = { TH: [3, 9], US: [13, 21] };

  const norm = (s) => String(s).toUpperCase().trim();
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;

  function marketOf(symbol) {
    return norm(symbol).endsWith(TH_SUFFIX) ? "TH" : "US";
  }
  function displaySymbol(symbol) {
    const s = norm(symbol);
    return s.endsWith(TH_SUFFIX) ? s.slice(0, -TH_SUFFIX.length) : s;
  }
  function curSym(symbol) {
    return marketOf(symbol) === "TH" ? "฿" : "$";
  }
  function sma(values, period) {
    const out = [];
    let sum = 0;
    for (let i = 0; i < values.length; i++) {
      sum += values[i];
      if (i >= period) sum -= values[i - period];
      out.push(i >= period - 1 ? sum / period : null);
    }
    return out;
  }
  function trendOf(closes) {
    if (!closes || closes.length < 200) return null;
    const price = closes[closes.length - 1];
    const ma50 = mean(closes.slice(-50));
    const ma200 = mean(closes.slice(-200));
    if (price > ma50 && ma50 > ma200) return "up";
    if (price < ma50 && ma50 < ma200) return "down";
    return "side";
  }
  function pctFrom(price, ref) {
    return ref ? ((price - ref) / ref) * 100 : null;
  }
  function range52w(candles) {
    const last = (candles || []).slice(-252);
    if (!last.length) return null;
    let high = -Infinity, low = Infinity;
    for (const c of last) {
      if (c.h > high) high = c.h;
      if (c.l < low) low = c.l;
    }
    return { high, low };
  }
  function isMarketOpen(market, date) {
    const day = date.getUTCDay();
    if (day === 0 || day === 6) return false;
    const [from, to] = WINDOWS[market];
    const h = date.getUTCHours();
    return h >= from && h <= to;
  }
  function dirFor(price, last) {
    return price > last ? "above" : "below";
  }
  function wouldFireNow(kind, price, last) {
    return kind === "sl" || kind === "below" ? last <= price : last >= price;
  }
  function fmt(n) {
    return Number(n).toFixed(2);
  }

  return { marketOf, displaySymbol, curSym, sma, trendOf, pctFrom, range52w, isMarketOpen, dirFor, wouldFireNow, fmt };
});
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `cd web && node --test logic.test.js`
Expected: PASS ทั้ง 7 test

- [ ] **Step 6: Commit**

```bash
git add web/package.json web/vercel.json web/vendor web/logic.js web/logic.test.js
git commit -m "feat: project skeleton + pure logic (market, MA, trend, hours)"
```

---

### Task 2: `web/api/_changes.js` — แก้ไข `alerts.json` แบบ pure

**Files:**
- Create: `web/api/_changes.js`, `web/api/_changes.test.js`

**Interfaces:**
- Produces:
  - `SYM_RE: RegExp`, `MAX_SYMBOLS = 20`, `MAX_ALERTS = 5`, `MAX_DEVICES = 5`
  - `emptyData() -> {version:1, heartbeat:null, push:[], symbols:[]}`
  - `applyChange(data, action) -> {data} | {error: string}` — ไม่แก้ `data` ที่ส่งเข้า
  - `applySubscription(data, sub) -> {data} | {error: string}`
- รูปแบบ `action`: `{action, symbol, price?, last?, id?, target?}`
  - `add_symbol`, `remove_symbol`, `set_sl{price}`, `set_tp{price}`, `clear_sl`, `clear_tp`, `add_alert{price,last}`, `update_alert{id,price,last}`, `remove_alert{id}`, `rearm{target:"sl"|"tp"|<alert id>}`
- รูปแบบเส้น: `{price, status:"active"|"fired", fired_at?, fired_price?}`; alert ทั่วไปมี `id` (`"a1"`, `"a2"`…) และ `dir:"above"|"below"`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน** — `web/api/_changes.test.js`

```js
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
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `cd web && node --test api/_changes.test.js`
Expected: FAIL — `Cannot find module './_changes.js'`

- [ ] **Step 3: เขียน `web/api/_changes.js`**

```js
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
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd web && node --test api/_changes.test.js`
Expected: PASS ทั้ง 11 test

- [ ] **Step 5: Commit**

```bash
git add web/api/_changes.js web/api/_changes.test.js
git commit -m "feat: pure alerts.json mutations (applyChange, applySubscription)"
```

---

### Task 3: ราคาจาก Yahoo — `_yahoo.js`, `/api/candles`, `/api/status`

**Files:**
- Create: `web/api/_yahoo.js`, `web/api/_yahoo.test.js`, `web/api/candles.js`, `web/api/status.js`

**Interfaces:**
- Consumes: `SYM_RE` จาก `./_changes.js`
- Produces:
  - `parseChart(json) -> {candles:[{t:"YYYY-MM-DD",o,h,l,c}], price:number, prevClose:number|null, currency:string|null} | null`
  - `fetchChart(symbol, fetchImpl=fetch) -> Promise<ผลของ parseChart | null>`
  - `GET /api/candles?symbol=X` → 200 ผลของ `fetchChart` | 400 `{error}` | 502 `{error}`
  - `GET /api/status` → 200 `{last_run: ISO string | null}`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน** — `web/api/_yahoo.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const Y = require("./_yahoo.js");

// 2026-11-11 14:30Z, 2026-11-12 14:30Z, 2026-11-13 14:30Z
const T = [1794407400, 1794493800, 1794580200];
const chart = (over = {}) => ({
  chart: {
    result: [{
      meta: { currency: "USD", regularMarketPrice: 192.4, gmtoffset: -18000, ...over.meta },
      timestamp: over.timestamp || T,
      indicators: { quote: [over.quote || {
        open: [180, 185, 190], high: [186, 191, 193], low: [179, 184, 189], close: [185, 190, 192.4],
      }] },
    }],
  },
});

test("parseChart maps bars to dated candles in exchange-local time", () => {
  const out = Y.parseChart(chart());
  assert.deepEqual(out.candles, [
    { t: "2026-11-11", o: 180, h: 186, l: 179, c: 185 },
    { t: "2026-11-12", o: 185, h: 191, l: 184, c: 190 },
    { t: "2026-11-13", o: 190, h: 193, l: 189, c: 192.4 },
  ]);
  assert.equal(out.price, 192.4);
  assert.equal(out.prevClose, 190);
  assert.equal(out.currency, "USD");
});

test("parseChart uses gmtoffset so Bangkok bars land on the Thai date", () => {
  // 2026-11-12 20:00Z = 2026-11-13 03:00 เวลาไทย
  const out = Y.parseChart(chart({
    meta: { currency: "THB", gmtoffset: 25200, regularMarketPrice: 32.75 },
    timestamp: [1794513600],
    quote: { open: [32.5], high: [33], low: [32.25], close: [32.75] },
  }));
  assert.equal(out.candles[0].t, "2026-11-13");
  assert.equal(out.prevClose, null);
});

test("parseChart skips bars with null values and merges duplicate dates", () => {
  const out = Y.parseChart(chart({
    timestamp: [T[0], T[1], T[2], T[2] + 3600],
    quote: {
      open: [180, null, 190, 190], high: [186, null, 193, 194],
      low: [179, null, 189, 189], close: [185, null, 192, 193.5],
    },
  }));
  assert.deepEqual(out.candles.map((c) => c.t), ["2026-11-11", "2026-11-13"]);
  assert.equal(out.candles[1].c, 193.5);
});

test("parseChart falls back to last close when meta price is missing", () => {
  const out = Y.parseChart(chart({ meta: { regularMarketPrice: undefined } }));
  assert.equal(out.price, 192.4);
});

test("parseChart returns null for unusable payloads", () => {
  assert.equal(Y.parseChart(null), null);
  assert.equal(Y.parseChart({ chart: { result: null, error: { code: "Not Found" } } }), null);
  assert.equal(Y.parseChart(chart({ timestamp: [], quote: { open: [], high: [], low: [], close: [] } })), null);
});

test("fetchChart returns null on HTTP error and parses on success", async () => {
  assert.equal(await Y.fetchChart("NVDA", async () => ({ ok: false, status: 404 })), null);
  let calledUrl = "";
  const out = await Y.fetchChart("PTT.BK", async (url) => {
    calledUrl = url;
    return { ok: true, json: async () => chart() };
  });
  assert.match(calledUrl, /\/v8\/finance\/chart\/PTT\.BK\?range=2y&interval=1d$/);
  assert.equal(out.candles.length, 3);
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `cd web && node --test api/_yahoo.test.js`
Expected: FAIL — `Cannot find module './_yahoo.js'`

- [ ] **Step 3: เขียน `web/api/_yahoo.js`**

```js
// ดึงแท่งรายวันจาก Yahoo Finance chart API (ไม่เป็นทางการ)
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const num = (v) => typeof v === "number" && Number.isFinite(v);
const r4 = (v) => Math.round(v * 10000) / 10000;

function parseChart(json) {
  const r = json && json.chart && json.chart.result && json.chart.result[0];
  const q = r && r.indicators && r.indicators.quote && r.indicators.quote[0];
  if (!r || !q || !Array.isArray(r.timestamp)) return null;
  const meta = r.meta || {};
  const off = num(meta.gmtoffset) ? meta.gmtoffset : 0;
  const candles = [];
  for (let i = 0; i < r.timestamp.length; i++) {
    const o = q.open[i], h = q.high[i], l = q.low[i], c = q.close[i];
    if (![o, h, l, c].every(num)) continue;
    const t = new Date((r.timestamp[i] + off) * 1000).toISOString().slice(0, 10);
    const bar = { t, o: r4(o), h: r4(h), l: r4(l), c: r4(c) };
    if (candles.length && candles[candles.length - 1].t === t) candles[candles.length - 1] = bar;
    else candles.push(bar);
  }
  if (!candles.length) return null;
  const last = candles[candles.length - 1];
  return {
    candles,
    price: num(meta.regularMarketPrice) ? meta.regularMarketPrice : last.c,
    prevClose: candles.length > 1 ? candles[candles.length - 2].c : null,
    currency: meta.currency || null,
  };
}

async function fetchChart(symbol, fetchImpl = fetch) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=2y&interval=1d`;
  const r = await fetchImpl(url, { headers: { "User-Agent": UA } });
  if (!r.ok) return null;
  return parseChart(await r.json());
}

module.exports = { parseChart, fetchChart };
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd web && node --test api/_yahoo.test.js`
Expected: PASS ทั้ง 6 test

- [ ] **Step 5: เขียน endpoint ทั้งสอง**

`web/api/candles.js`:
```js
const { SYM_RE } = require("./_changes.js");
const { fetchChart } = require("./_yahoo.js");

module.exports = async (req, res) => {
  const symbol = String((req.query && req.query.symbol) || "").toUpperCase().trim();
  if (!SYM_RE.test(symbol)) return res.status(400).json({ error: "สัญลักษณ์หุ้นไม่ถูกต้อง" });
  try {
    const out = await fetchChart(symbol);
    if (!out) return res.status(502).json({ error: "ดึงข้อมูลราคาไม่ได้" });
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: "ดึงข้อมูลราคาไม่ได้" });
  }
};
```

`web/api/status.js`:
```js
// เวลารันสำเร็จล่าสุดของ workflow check.yml
module.exports = async (req, res) => {
  const repo = process.env.GITHUB_REPO;
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "stock-alert" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  let last_run = null;
  try {
    const r = await fetch(
      `https://api.github.com/repos/${repo}/actions/workflows/check.yml/runs?status=success&per_page=1`,
      { headers }
    );
    if (r.ok) {
      const j = await r.json();
      const run = j.workflow_runs && j.workflow_runs[0];
      last_run = run ? run.updated_at : null;
    }
  } catch (e) {
    last_run = null;
  }
  res.setHeader("Cache-Control", "s-maxage=120");
  return res.status(200).json({ last_run });
};
```

- [ ] **Step 6: ตรวจ `fetchChart` กับ Yahoo จริง (หุ้นสหรัฐและไทย)**

Run:
```bash
cd web && node -e "const {fetchChart}=require('./api/_yahoo.js');(async()=>{for(const s of ['NVDA','PTT.BK']){const o=await fetchChart(s);console.log(s,o?o.candles.length:null,o&&o.price,o&&o.currency,o&&o.candles.at(-1).t)}})()"
```
Expected: สองบรรทัด แต่ละบรรทัดมีจำนวนแท่งราว 480–510, ราคา, `USD`/`THB`, และวันที่ล่าสุด ถ้าได้ `null` ให้หยุดและรายงาน (Yahoo อาจบล็อก) อย่าเดาแก้

- [ ] **Step 7: Commit**

```bash
git add web/api/_yahoo.js web/api/_yahoo.test.js web/api/candles.js web/api/status.js
git commit -m "feat: Yahoo daily candles endpoint + checker status endpoint"
```

---

### Task 4: ที่เก็บข้อมูล + endpoint แก้ไข — `_store.js`, `_auth.js`, `data`, `change`, `subscribe`

**Files:**
- Create: `web/api/_store.js`, `web/api/_store.test.js`, `web/api/_auth.js`, `web/api/data.js`, `web/api/change.js`, `web/api/subscribe.js`

**Interfaces:**
- Consumes: `applyChange`, `applySubscription`, `emptyData`, `SYM_RE` จาก `./_changes.js`; `fetchChart` จาก `./_yahoo.js`
- Produces:
  - `readData(fetchImpl=fetch) -> Promise<{data, sha}>` (ไฟล์ไม่มี = `{data: emptyData(), sha: null}`)
  - `writeData(data, sha, message, fetchImpl=fetch) -> Promise<{ok:boolean, status:number}>`
  - `mutate(fn, message, fetchImpl=fetch) -> Promise<{data} | {error:string, status:number}>` — `fn(data) -> {data}|{error}`; ชน (409/422) ลองใหม่ 1 ครั้ง
  - `publicView(data) -> {version, heartbeat, symbols, devices:number, vapid_public_key:string|null}` (ไม่มี `push`)
  - `checkPass(req) -> boolean`
  - `GET /api/data` → `publicView`; `POST /api/change` body = action → `publicView`; `POST /api/subscribe` body = PushSubscription JSON → `publicView`
- Env: `GITHUB_REPO` (`owner/name`), `GITHUB_TOKEN`, `APP_PASSCODE`, `VAPID_PUBLIC_KEY`

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน** — `web/api/_store.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");

process.env.GITHUB_REPO = "me/stock-alert";
process.env.GITHUB_TOKEN = "t0ken";
process.env.VAPID_PUBLIC_KEY = "PUBKEY";
const S = require("./_store.js");
const { emptyData, applyChange } = require("./_changes.js");

const b64 = (obj) => Buffer.from(JSON.stringify(obj), "utf8").toString("base64");
const res = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

// GitHub ปลอม: เก็บไฟล์เดียวและ sha; putStatuses กำหนดผลของ PUT ตามลำดับ
function fakeGitHub(initial, putStatuses = []) {
  const state = { data: initial, sha: initial ? "sha1" : null, puts: [], gets: 0 };
  const fetchImpl = async (url, opts = {}) => {
    assert.match(url, /^https:\/\/api\.github\.com\/repos\/me\/stock-alert\/contents\/alerts\.json/);
    assert.equal(opts.headers.Authorization, "Bearer t0ken");
    if (!opts.method || opts.method === "GET") {
      state.gets++;
      assert.match(url, /\?ref=data$/);
      if (!state.data) return res(404, {});
      return res(200, { content: b64(state.data), sha: state.sha });
    }
    const body = JSON.parse(opts.body);
    state.puts.push(body);
    const status = putStatuses.shift() || 200;
    if (status === 200) {
      state.data = JSON.parse(Buffer.from(body.content, "base64").toString("utf8"));
      state.sha = "sha" + (state.puts.length + 1);
    }
    return res(status, {});
  };
  return { state, fetchImpl };
}

test("readData decodes the file; missing file gives empty data", async () => {
  const d = emptyData();
  d.symbols.push({ symbol: "ปตท", sl: null, tp: null, alerts: [] }); // ตรวจ UTF-8
  const gh = fakeGitHub(d);
  assert.deepEqual(await S.readData(gh.fetchImpl), { data: d, sha: "sha1" });
  const none = fakeGitHub(null);
  assert.deepEqual(await S.readData(none.fetchImpl), { data: emptyData(), sha: null });
});

test("writeData sends branch, sha, message and base64 content", async () => {
  const gh = fakeGitHub(emptyData());
  const d = emptyData();
  d.heartbeat = "2026-11-13";
  const out = await S.writeData(d, "sha1", "msg", gh.fetchImpl);
  assert.deepEqual(out, { ok: true, status: 200 });
  assert.equal(gh.state.puts[0].branch, "data");
  assert.equal(gh.state.puts[0].sha, "sha1");
  assert.equal(gh.state.puts[0].message, "msg");
  assert.deepEqual(gh.state.data, d);
});

test("mutate applies fn and writes", async () => {
  const gh = fakeGitHub(emptyData());
  const out = await S.mutate((d) => applyChange(d, { action: "add_symbol", symbol: "NVDA" }), "m", gh.fetchImpl);
  assert.equal(out.data.symbols[0].symbol, "NVDA");
  assert.equal(gh.state.data.symbols[0].symbol, "NVDA");
});

test("mutate returns fn's error without writing", async () => {
  const gh = fakeGitHub(emptyData());
  const out = await S.mutate((d) => applyChange(d, { action: "set_sl", symbol: "NVDA", price: 1 }), "m", gh.fetchImpl);
  assert.equal(out.status, 400);
  assert.match(out.error, /ไม่พบ/);
  assert.equal(gh.state.puts.length, 0);
});

test("mutate retries once on conflict, then gives up", async () => {
  const once = fakeGitHub(emptyData(), [409]);
  const ok = await S.mutate((d) => applyChange(d, { action: "add_symbol", symbol: "NVDA" }), "m", once.fetchImpl);
  assert.equal(ok.data.symbols.length, 1);
  assert.equal(once.state.gets, 2);
  assert.equal(once.state.puts.length, 2);

  const twice = fakeGitHub(emptyData(), [409, 409]);
  const bad = await S.mutate((d) => applyChange(d, { action: "add_symbol", symbol: "NVDA" }), "m", twice.fetchImpl);
  assert.equal(bad.status, 409);
  assert.match(bad.error, /ลองอีกครั้ง/);
  assert.equal(twice.state.puts.length, 2);
});

test("publicView hides push subscriptions", () => {
  const d = emptyData();
  d.push = [{ endpoint: "https://a", keys: {}, ok: true }, { endpoint: "https://b", keys: {}, ok: false }];
  const v = S.publicView(d);
  assert.equal(v.push, undefined);
  assert.equal(v.devices, 1);
  assert.equal(v.vapid_public_key, "PUBKEY");
  assert.deepEqual(v.symbols, []);
});
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `cd web && node --test api/_store.test.js`
Expected: FAIL — `Cannot find module './_store.js'`

- [ ] **Step 3: เขียน `web/api/_store.js`**

```js
// อ่าน/เขียน alerts.json บน branch data ผ่าน GitHub Contents API
const { emptyData } = require("./_changes.js");

const BRANCH = "data";
const FILE = "alerts.json";

const url = () => `https://api.github.com/repos/${process.env.GITHUB_REPO}/contents/${FILE}`;
const headers = () => ({
  Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "stock-alert",
  "Content-Type": "application/json",
});

async function readData(fetchImpl = fetch) {
  const r = await fetchImpl(`${url()}?ref=${BRANCH}`, { headers: headers() });
  if (r.status === 404) return { data: emptyData(), sha: null };
  if (!r.ok) throw new Error(`อ่านข้อมูลไม่ได้ (${r.status})`);
  const j = await r.json();
  const text = Buffer.from(j.content, "base64").toString("utf8");
  return { data: JSON.parse(text), sha: j.sha };
}

async function writeData(data, sha, message, fetchImpl = fetch) {
  const body = {
    message,
    branch: BRANCH,
    content: Buffer.from(JSON.stringify(data, null, 2) + "\n", "utf8").toString("base64"),
  };
  if (sha) body.sha = sha;
  const r = await fetchImpl(url(), { method: "PUT", headers: headers(), body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status };
}

async function mutate(fn, message, fetchImpl = fetch) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, sha } = await readData(fetchImpl);
    const out = fn(data);
    if (out.error) return { error: out.error, status: 400 };
    const w = await writeData(out.data, sha, message, fetchImpl);
    if (w.ok) return { data: out.data };
    if (w.status !== 409 && w.status !== 422) return { error: "บันทึกไม่สำเร็จ ลองอีกครั้ง", status: 502 };
  }
  return { error: "บันทึกไม่สำเร็จ ลองอีกครั้ง", status: 409 };
}

function publicView(data) {
  return {
    version: data.version,
    heartbeat: data.heartbeat || null,
    symbols: data.symbols || [],
    devices: (data.push || []).filter((p) => p.ok !== false).length,
    vapid_public_key: process.env.VAPID_PUBLIC_KEY || null,
  };
}

module.exports = { readData, writeData, mutate, publicView };
```

- [ ] **Step 4: รันให้ผ่าน**

Run: `cd web && node --test api/_store.test.js`
Expected: PASS ทั้ง 6 test

- [ ] **Step 5: เขียน `_auth.js` และ endpoint ทั้งสาม**

`web/api/_auth.js`:
```js
const crypto = require("crypto");
const digest = (s) => crypto.createHash("sha256").update(String(s)).digest();

// เทียบแบบ constant-time; ไม่ตั้ง APP_PASSCODE = ปฏิเสธทุกคำขอ
function checkPass(req) {
  const expected = process.env.APP_PASSCODE;
  const given = req.headers && req.headers["x-app-pass"];
  if (!expected || !given) return false;
  return crypto.timingSafeEqual(digest(given), digest(expected));
}

module.exports = { checkPass };
```

`web/api/data.js`:
```js
const { readData, publicView } = require("./_store.js");

module.exports = async (req, res) => {
  try {
    const { data } = await readData();
    res.setHeader("Cache-Control", "no-store");
    return res.status(200).json(publicView(data));
  } catch (e) {
    return res.status(502).json({ error: "อ่านข้อมูลไม่ได้" });
  }
};
```

`web/api/change.js`:
```js
const { applyChange, SYM_RE } = require("./_changes.js");
const { mutate, publicView } = require("./_store.js");
const { checkPass } = require("./_auth.js");
const { fetchChart } = require("./_yahoo.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST เท่านั้น" });
  if (!checkPass(req)) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  const action = req.body && typeof req.body === "object" ? req.body : {};
  const symbol = String(action.symbol || "").toUpperCase().trim();
  try {
    if (action.action === "add_symbol") {
      if (!SYM_RE.test(symbol)) return res.status(400).json({ error: "สัญลักษณ์หุ้นไม่ถูกต้อง" });
      const chart = await fetchChart(symbol).catch(() => null);
      if (!chart) return res.status(400).json({ error: `ไม่พบข้อมูลราคาของ ${symbol}` });
    }
    const out = await mutate((d) => applyChange(d, action), `alert: ${action.action} ${symbol}`);
    if (out.error) return res.status(out.status).json({ error: out.error });
    return res.status(200).json(publicView(out.data));
  } catch (e) {
    return res.status(502).json({ error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" });
  }
};
```

`web/api/subscribe.js`:
```js
const { applySubscription } = require("./_changes.js");
const { mutate, publicView } = require("./_store.js");
const { checkPass } = require("./_auth.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST เท่านั้น" });
  if (!checkPass(req)) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  try {
    const out = await mutate((d) => applySubscription(d, req.body), "alert: push subscription");
    if (out.error) return res.status(out.status).json({ error: out.error });
    return res.status(200).json(publicView(out.data));
  } catch (e) {
    return res.status(502).json({ error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" });
  }
};
```

- [ ] **Step 6: ตรวจว่าทุกไฟล์โหลดได้และ `checkPass` ทำงาน**

Run:
```bash
cd web && APP_PASSCODE=s3cret node -e "const {checkPass}=require('./api/_auth.js');console.log(checkPass({headers:{'x-app-pass':'s3cret'}}),checkPass({headers:{'x-app-pass':'nope'}}),checkPass({headers:{}}));['data','change','subscribe'].forEach(f=>console.log(f,typeof require('./api/'+f+'.js')))"
```
Expected:
```
true false false
data function
change function
subscribe function
```

- [ ] **Step 7: Commit**

```bash
git add web/api/_store.js web/api/_store.test.js web/api/_auth.js web/api/data.js web/api/change.js web/api/subscribe.js
git commit -m "feat: GitHub-backed store + data/change/subscribe endpoints"
```

---

### Task 5: ส่ง push ฝั่ง Node — `_push.js`, `/api/test-push`

**Files:**
- Create: `web/api/_push.js`, `web/api/_push.test.js`, `web/api/test-push.js`
- Modify: `web/package-lock.json` (เกิดจาก `npm install`)

**Interfaces:**
- Consumes: `readData`, `writeData` จาก `./_store.js`; `checkPass` จาก `./_auth.js`
- Produces:
  - `sendAll(data, payload, webpush) -> Promise<{sent:number, failed:number, data, changed:boolean}>` — ส่งให้ทุกเครื่องที่ `ok !== false`; 404/410 → `ok:false` ใน `data` ที่คืน (ไม่แก้ input)
  - `POST /api/test-push` → 200 `{sent, failed}` | 400 `{error}` เมื่อไม่มีเครื่อง
- Env: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (เช่น `mailto:you@example.com`)

- [ ] **Step 1: ติดตั้ง dependency**

Run: `cd web && npm install`
Expected: สร้าง `node_modules/` และ `package-lock.json` (มี `web-push`) ไม่มี error

- [ ] **Step 2: เขียน test ที่ยังไม่ผ่าน** — `web/api/_push.test.js`

```js
const test = require("node:test");
const assert = require("node:assert/strict");
const { sendAll } = require("./_push.js");

const sub = (n, ok = true) => ({ endpoint: "https://push.example/" + n, keys: { p256dh: "p", auth: "a" }, ok });
const payload = { title: "t", body: "b", url: "/" };

// webpush ปลอม: results[endpoint] = statusCode ที่จะ throw (ไม่ระบุ = สำเร็จ)
function fakeWebpush(results = {}) {
  const calls = [];
  return {
    calls,
    sendNotification: async (s, body) => {
      calls.push({ endpoint: s.endpoint, keys: s.keys, body });
      const code = results[s.endpoint];
      if (code) { const e = new Error("push failed"); e.statusCode = code; throw e; }
    },
  };
}

test("sends the JSON payload to every ok device only", async () => {
  const wp = fakeWebpush();
  const data = { push: [sub(1), sub(2, false), sub(3)] };
  const out = await sendAll(data, payload, wp);
  assert.deepEqual(wp.calls.map((c) => c.endpoint), ["https://push.example/1", "https://push.example/3"]);
  assert.deepEqual(JSON.parse(wp.calls[0].body), payload);
  assert.deepEqual(wp.calls[0].keys, { p256dh: "p", auth: "a" });
  assert.equal(out.sent, 2);
  assert.equal(out.failed, 0);
  assert.equal(out.changed, false);
});

test("404/410 mark the device as gone without touching the input", async () => {
  const wp = fakeWebpush({ "https://push.example/1": 410, "https://push.example/2": 404 });
  const data = { push: [sub(1), sub(2), sub(3)] };
  const out = await sendAll(data, payload, wp);
  assert.deepEqual(out.data.push.map((p) => p.ok), [false, false, true]);
  assert.deepEqual(data.push.map((p) => p.ok), [true, true, true]);
  assert.equal(out.sent, 1);
  assert.equal(out.failed, 2);
  assert.equal(out.changed, true);
});

test("other errors count as failed but keep the device", async () => {
  const wp = fakeWebpush({ "https://push.example/1": 500 });
  const out = await sendAll({ push: [sub(1)] }, payload, wp);
  assert.equal(out.sent, 0);
  assert.equal(out.failed, 1);
  assert.equal(out.changed, false);
  assert.equal(out.data.push[0].ok, true);
});

test("no devices", async () => {
  const out = await sendAll({ push: [] }, payload, fakeWebpush());
  assert.deepEqual({ sent: out.sent, failed: out.failed, changed: out.changed }, { sent: 0, failed: 0, changed: false });
});
```

- [ ] **Step 3: รันให้เห็นว่า fail**

Run: `cd web && node --test api/_push.test.js`
Expected: FAIL — `Cannot find module './_push.js'`

- [ ] **Step 4: เขียน `web/api/_push.js` และ `web/api/test-push.js`**

`web/api/_push.js`:
```js
// ส่ง Web Push ให้ทุกเครื่องที่ยังใช้ได้ — webpush ถูกส่งเข้ามาเพื่อให้ test ได้
async function sendAll(data, payload, webpush) {
  const out = JSON.parse(JSON.stringify(data));
  out.push = out.push || [];
  const body = JSON.stringify(payload);
  let sent = 0, failed = 0, changed = false;
  for (const sub of out.push) {
    if (sub.ok === false) continue;
    try {
      await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body);
      sent++;
    } catch (e) {
      failed++;
      if (e && (e.statusCode === 404 || e.statusCode === 410)) {
        sub.ok = false;
        changed = true;
      }
    }
  }
  return { sent, failed, data: out, changed };
}

module.exports = { sendAll };
```

`web/api/test-push.js`:
```js
const webpush = require("web-push");
const { readData, writeData } = require("./_store.js");
const { checkPass } = require("./_auth.js");
const { sendAll } = require("./_push.js");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "POST เท่านั้น" });
  if (!checkPass(req)) return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
  try {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    const { data, sha } = await readData();
    const out = await sendAll(data, { title: "Stock Alert", body: "ทดสอบ noti สำเร็จ ✅", url: "/" }, webpush);
    if (out.changed) await writeData(out.data, sha, "alert: mark expired push devices");
    if (out.sent + out.failed === 0) return res.status(400).json({ error: "ยังไม่มีเครื่องที่เปิด noti" });
    return res.status(200).json({ sent: out.sent, failed: out.failed });
  } catch (e) {
    return res.status(502).json({ error: "ส่ง noti ไม่สำเร็จ" });
  }
};
```

- [ ] **Step 5: รัน test ทั้งหมดของ web**

Run: `cd web && node --test`
Expected: PASS ทุกไฟล์ (`logic`, `_changes`, `_yahoo`, `_store`, `_push`) ไม่มี fail

- [ ] **Step 6: Commit**

```bash
git add web/api/_push.js web/api/_push.test.js web/api/test-push.js web/package-lock.json
git commit -m "feat: web push sender + test-push endpoint"
```

---

### Task 6: ตัวเช็ก Python ส่วน pure — `hours.py`, `rules.py`

**Files:**
- Create: `checker/__init__.py` (ไฟล์ว่าง), `checker/hours.py`, `checker/rules.py`, `tests/test_hours.py`, `tests/test_rules.py`, `requirements.txt`

**Interfaces:**
- Produces:
  - `hours.market_of(symbol:str) -> "TH"|"US"`
  - `hours.open_markets(now:datetime) -> set[str]` (`now` เป็น UTC, tz-aware)
  - `rules.active_symbols(data:dict, markets:set[str]) -> list[str]`
  - `rules.evaluate(data:dict, prices:dict[str,float], now_iso:str) -> tuple[dict, list[dict]]` — ไม่แก้ input; fired item = `{"symbol","kind":"sl"|"tp"|"above"|"below","price","last"}`
  - `rules.message(fired:dict) -> str`
  - `rules.payload(fired:dict) -> {"title","body","url"}`

- [ ] **Step 1: สร้าง `requirements.txt` และ package**

`requirements.txt`:
```
yfinance>=0.2.40
pywebpush>=2.0.0
pytest>=8.0
```

สร้างไฟล์ว่าง `checker/__init__.py`

- [ ] **Step 2: เขียน test ที่ยังไม่ผ่าน**

`tests/test_hours.py`:
```python
from datetime import datetime, timezone

from checker import hours


def at(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=timezone.utc)


def test_market_of():
    assert hours.market_of("PTT.BK") == "TH"
    assert hours.market_of(" ptt.bk ") == "TH"
    assert hours.market_of("NVDA") == "US"


def test_open_markets_windows():
    # 2026-11-13 เป็นวันศุกร์
    assert hours.open_markets(at("2026-11-13T02:59:00")) == set()
    assert hours.open_markets(at("2026-11-13T03:00:00")) == {"TH"}
    assert hours.open_markets(at("2026-11-13T09:59:00")) == {"TH"}
    assert hours.open_markets(at("2026-11-13T10:00:00")) == set()
    assert hours.open_markets(at("2026-11-13T13:00:00")) == {"US"}
    assert hours.open_markets(at("2026-11-13T21:59:00")) == {"US"}
    assert hours.open_markets(at("2026-11-13T22:00:00")) == set()


def test_open_markets_weekend():
    assert hours.open_markets(at("2026-11-14T05:00:00")) == set()  # เสาร์
    assert hours.open_markets(at("2026-11-15T15:00:00")) == set()  # อาทิตย์
```

`tests/test_rules.py`:
```python
import copy

from checker import rules

NOW = "2026-11-13T15:45:00Z"


def data():
    return {
        "version": 1,
        "heartbeat": None,
        "push": [],
        "symbols": [
            {
                "symbol": "NVDA",
                "sl": {"price": 178, "status": "active"},
                "tp": {"price": 210, "status": "active"},
                "alerts": [
                    {"id": "a1", "price": 200, "dir": "above", "status": "active"},
                    {"id": "a2", "price": 185, "dir": "below", "status": "active"},
                ],
            },
            {"symbol": "PTT.BK", "sl": {"price": 31.5, "status": "active"}, "tp": None, "alerts": []},
            {"symbol": "MSFT", "sl": None, "tp": None, "alerts": []},
            {"symbol": "SAV.BK", "sl": {"price": 10, "status": "fired"}, "tp": None, "alerts": []},
        ],
    }


def test_active_symbols_filters_by_market_and_active_lines():
    d = data()
    assert rules.active_symbols(d, {"US"}) == ["NVDA"]
    assert rules.active_symbols(d, {"TH"}) == ["PTT.BK"]
    assert rules.active_symbols(d, {"US", "TH"}) == ["NVDA", "PTT.BK"]
    assert rules.active_symbols(d, set()) == []


def test_nothing_fires_between_levels():
    d = data()
    out, fired = rules.evaluate(d, {"NVDA": 190.0}, NOW)
    assert fired == []
    assert out == d


def test_sl_fires_at_and_below_level():
    for last in (178.0, 177.6):
        out, fired = rules.evaluate(data(), {"NVDA": last}, NOW)
        kinds = [f["kind"] for f in fired]
        assert kinds == ["sl", "below"]  # 185 below ก็ถึงด้วย
        assert out["symbols"][0]["sl"] == {
            "price": 178, "status": "fired", "fired_at": NOW, "fired_price": last,
        }
        assert out["symbols"][0]["tp"]["status"] == "active"


def test_tp_and_above_alert_fire_at_and_over_level():
    out, fired = rules.evaluate(data(), {"NVDA": 210.0}, NOW)
    assert [f["kind"] for f in fired] == ["tp", "above"]
    assert fired[0] == {"symbol": "NVDA", "kind": "tp", "price": 210, "last": 210.0}
    assert out["symbols"][0]["alerts"][0]["status"] == "fired"
    assert out["symbols"][0]["alerts"][0]["fired_price"] == 210.0
    assert out["symbols"][0]["alerts"][1]["status"] == "active"


def test_above_alert_alone():
    out, fired = rules.evaluate(data(), {"NVDA": 200.0}, NOW)
    assert fired == [{"symbol": "NVDA", "kind": "above", "price": 200, "last": 200.0}]


def test_fired_lines_do_not_fire_again():
    out, fired = rules.evaluate(data(), {"SAV.BK": 5.0}, NOW)
    assert fired == []


def test_symbol_without_price_is_untouched_and_input_not_mutated():
    d = data()
    before = copy.deepcopy(d)
    out, fired = rules.evaluate(d, {"PTT.BK": 31.0}, NOW)
    assert d == before
    assert [f["symbol"] for f in fired] == ["PTT.BK"]
    assert out["symbols"][0] == before["symbols"][0]


def test_messages():
    assert rules.message({"symbol": "NVDA", "kind": "sl", "price": 178, "last": 177.6}) == "NVDA แตะ SL 178.00 (ล่าสุด 177.60)"
    assert rules.message({"symbol": "NVDA", "kind": "tp", "price": 210, "last": 210.4}) == "NVDA แตะ TP 210.00 (ล่าสุด 210.40)"
    assert rules.message({"symbol": "PTT.BK", "kind": "above", "price": 33, "last": 33.25}) == "PTT ขึ้นถึง 33.00 (ล่าสุด 33.25)"
    assert rules.message({"symbol": "PTT.BK", "kind": "below", "price": 31.5, "last": 31.25}) == "PTT ลงถึง 31.50 (ล่าสุด 31.25)"


def test_payload():
    p = rules.payload({"symbol": "PTT.BK", "kind": "sl", "price": 31.5, "last": 31.25})
    assert p == {"title": "PTT แตะ SL 31.50 (ล่าสุด 31.25)", "body": "แตะเพื่อเปิดกราฟ", "url": "/#/s/PTT.BK"}
```

- [ ] **Step 3: รันให้เห็นว่า fail**

Run: `python -m pytest tests -q`
Expected: FAIL — `ImportError: cannot import name 'hours' from 'checker'` (และ `rules`)

- [ ] **Step 4: เขียน implementation**

`checker/hours.py`:
```python
"""ช่วงเวลาที่ตัวเช็กถือว่าตลาดเปิด (pure)

ชั่วโมง UTC รวมปลาย จันทร์–ศุกร์ตาม UTC — ต้องตรงกับ WINDOWS ใน web/logic.js
"""
from __future__ import annotations

from datetime import datetime

TH_SUFFIX = ".BK"
WINDOWS = {"TH": (3, 9), "US": (13, 21)}


def market_of(symbol: str) -> str:
    return "TH" if str(symbol).upper().strip().endswith(TH_SUFFIX) else "US"


def open_markets(now: datetime) -> set[str]:
    if now.weekday() >= 5:
        return set()
    return {m for m, (start, end) in WINDOWS.items() if start <= now.hour <= end}
```

`checker/rules.py`:
```python
"""กติกาการยิง alert (pure — ไม่มี I/O)"""
from __future__ import annotations

import copy

from .hours import TH_SUFFIX, market_of

LABELS = {"sl": "แตะ SL", "tp": "แตะ TP", "above": "ขึ้นถึง", "below": "ลงถึง"}


def _is_active(line: dict | None) -> bool:
    return bool(line) and line.get("status") == "active"


def active_symbols(data: dict, markets: set[str]) -> list[str]:
    """หุ้นของตลาดที่เปิดอยู่ ที่มีเส้น active อย่างน้อย 1 เส้น"""
    out = []
    for s in data.get("symbols", []):
        if market_of(s["symbol"]) not in markets:
            continue
        lines = [s.get("sl"), s.get("tp"), *s.get("alerts", [])]
        if any(_is_active(line) for line in lines):
            out.append(s["symbol"])
    return out


def _hit(kind: str, price: float, last: float) -> bool:
    return last <= price if kind in ("sl", "below") else last >= price


def evaluate(data: dict, prices: dict[str, float], now_iso: str) -> tuple[dict, list[dict]]:
    """คืน (ข้อมูลใหม่ที่ทำเครื่องหมาย fired แล้ว, รายการที่ยิง) — ไม่แก้ data ที่ส่งเข้า"""
    out = copy.deepcopy(data)
    fired: list[dict] = []
    for s in out.get("symbols", []):
        last = prices.get(s["symbol"])
        if last is None:
            continue
        targets = [("sl", s.get("sl")), ("tp", s.get("tp"))]
        targets += [(a["dir"], a) for a in s.get("alerts", [])]
        for kind, line in targets:
            if _is_active(line) and _hit(kind, line["price"], last):
                line["status"] = "fired"
                line["fired_at"] = now_iso
                line["fired_price"] = last
                fired.append({"symbol": s["symbol"], "kind": kind, "price": line["price"], "last": last})
    return out, fired


def _display(symbol: str) -> str:
    s = str(symbol).upper().strip()
    return s[: -len(TH_SUFFIX)] if s.endswith(TH_SUFFIX) else s


def message(fired: dict) -> str:
    return (
        f"{_display(fired['symbol'])} {LABELS[fired['kind']]} "
        f"{fired['price']:.2f} (ล่าสุด {fired['last']:.2f})"
    )


def payload(fired: dict) -> dict:
    return {"title": message(fired), "body": "แตะเพื่อเปิดกราฟ", "url": f"/#/s/{fired['symbol']}"}
```

- [ ] **Step 5: รันให้ผ่าน**

Run: `python -m pytest tests -q`
Expected: `12 passed`

- [ ] **Step 6: Commit**

```bash
git add checker/__init__.py checker/hours.py checker/rules.py tests/test_hours.py tests/test_rules.py requirements.txt
git commit -m "feat: checker rules and market hours (pure)"
```

---

### Task 7: ตัวเช็ก Python ส่วน I/O — `prices.py`, `push.py`, `check.py`, workflow

**Files:**
- Create: `checker/prices.py`, `checker/push.py`, `checker/check.py`, `tests/test_check.py`, `.github/workflows/check.yml`

**Interfaces:**
- Consumes: `hours.open_markets`, `rules.active_symbols`, `rules.evaluate`, `rules.payload`
- Produces:
  - `prices.last_price(symbol:str) -> float | None`
  - `push.send(sub:dict, payload:dict) -> "ok" | "gone" | "error"`
  - `check.run(data:dict, now:datetime, get_price, send) -> dict` — ไม่แก้ input
    - ทำเครื่องหมาย `fired` เฉพาะเมื่อส่ง push สำเร็จอย่างน้อย 1 เครื่อง; มิฉะนั้นเส้นยัง `active` เพื่อให้รอบถัดไปลองใหม่
    - เครื่องที่ตอบ `gone` ถูกตั้ง `ok: False` เสมอ
    - ตั้ง `heartbeat` เป็นวันที่ (UTC) ของ `now` เสมอ
  - `python -m checker.check` — อ่าน/เขียนไฟล์ที่ env `DATA_FILE` (default `data/alerts.json`) เขียนเฉพาะเมื่อเปลี่ยน
- Env ของ checker: `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`; ไม่ตั้ง `VAPID_PRIVATE_KEY` = โหมดทดลอง (พิมพ์ข้อความแทนการส่ง และถือว่าส่งสำเร็จ)

- [ ] **Step 1: เขียน test ที่ยังไม่ผ่าน** — `tests/test_check.py`

```python
import copy
from datetime import datetime, timezone

from checker import check

NOW = datetime(2026, 11, 13, 15, 45, tzinfo=timezone.utc)  # ศุกร์ ตลาดสหรัฐเปิด
NOW_ISO = "2026-11-13T15:45:00Z"


def sub(n, ok=True):
    return {"endpoint": f"https://push.example/{n}", "keys": {"p256dh": "p", "auth": "a"}, "ok": ok}


def data(push=None):
    return {
        "version": 1,
        "heartbeat": "2026-11-13",
        "push": push if push is not None else [sub(1)],
        "symbols": [
            {"symbol": "NVDA", "sl": {"price": 178, "status": "active"}, "tp": None, "alerts": []},
            {"symbol": "PTT.BK", "sl": {"price": 31.5, "status": "active"}, "tp": None, "alerts": []},
            {"symbol": "MSFT", "sl": None, "tp": None, "alerts": []},
        ],
    }


class Recorder:
    def __init__(self, results=None):
        self.results = results or {}
        self.sent = []

    def __call__(self, s, payload):
        self.sent.append((s["endpoint"], payload))
        return self.results.get(s["endpoint"], "ok")


def test_only_fetches_open_market_symbols_with_active_lines():
    asked = []

    def get_price(sym):
        asked.append(sym)
        return 190.0

    out = check.run(data(), NOW, get_price, Recorder())
    assert asked == ["NVDA"]
    assert out == data()


def test_fires_pushes_and_marks_fired():
    send = Recorder()
    d = data()
    before = copy.deepcopy(d)
    out = check.run(d, NOW, lambda s: 177.6, send)
    assert d == before
    assert send.sent == [(
        "https://push.example/1",
        {"title": "NVDA แตะ SL 178.00 (ล่าสุด 177.60)", "body": "แตะเพื่อเปิดกราฟ", "url": "/#/s/NVDA"},
    )]
    assert out["symbols"][0]["sl"] == {
        "price": 178, "status": "fired", "fired_at": NOW_ISO, "fired_price": 177.6,
    }


def test_skips_devices_marked_not_ok():
    send = Recorder()
    check.run(data([sub(1, ok=False), sub(2)]), NOW, lambda s: 177.6, send)
    assert [e for e, _ in send.sent] == ["https://push.example/2"]


def test_keeps_alert_active_when_nothing_was_delivered():
    out = check.run(data(), NOW, lambda s: 177.6, Recorder({"https://push.example/1": "error"}))
    assert out["symbols"][0]["sl"] == {"price": 178, "status": "active"}
    assert out["push"][0]["ok"] is True


def test_gone_device_is_disabled_and_alert_stays_active_if_it_was_the_only_one():
    out = check.run(data(), NOW, lambda s: 177.6, Recorder({"https://push.example/1": "gone"}))
    assert out["push"][0]["ok"] is False
    assert out["symbols"][0]["sl"]["status"] == "active"


def test_one_delivery_is_enough_and_gone_device_still_disabled():
    send = Recorder({"https://push.example/1": "gone"})
    out = check.run(data([sub(1), sub(2)]), NOW, lambda s: 177.6, send)
    assert [p["ok"] for p in out["push"]] == [False, True]
    assert out["symbols"][0]["sl"]["status"] == "fired"


def test_no_devices_keeps_alert_active():
    out = check.run(data([]), NOW, lambda s: 177.6, Recorder())
    assert out["symbols"][0]["sl"]["status"] == "active"


def test_price_failure_skips_symbol():
    out = check.run(data(), NOW, lambda s: None, Recorder())
    assert out == data()


def test_heartbeat_updates_once_per_day_even_when_markets_closed():
    d = data()
    d["heartbeat"] = "2026-11-12"
    sunday = datetime(2026, 11, 15, 15, 0, tzinfo=timezone.utc)
    asked = []
    out = check.run(d, sunday, lambda s: asked.append(s), Recorder())
    assert asked == []
    assert out["heartbeat"] == "2026-11-15"
```

- [ ] **Step 2: รันให้เห็นว่า fail**

Run: `python -m pytest tests/test_check.py -q`
Expected: FAIL — `ImportError: cannot import name 'check' from 'checker'`

- [ ] **Step 3: เขียน implementation**

`checker/prices.py`:
```python
"""ราคาล่าสุดจาก Yahoo Finance ผ่าน yfinance (ช้า ~15 นาที)"""
from __future__ import annotations


def last_price(symbol: str) -> float | None:
    try:
        import yfinance as yf

        price = yf.Ticker(symbol).fast_info["last_price"]
        price = float(price)
        return price if price > 0 else None
    except Exception as e:  # network / symbol error → ข้ามตัวนี้
        print(f"  [price] {symbol} ล้มเหลว: {type(e).__name__}")
        return None
```

`checker/push.py`:
```python
"""ส่ง Web Push ด้วย pywebpush — ห้ามพิมพ์ endpoint ลง log"""
from __future__ import annotations

import json
import os


def send(sub: dict, payload: dict) -> str:
    """คืน "ok" | "gone" (404/410 ปลายทางหมดอายุ) | "error" """
    private_key = os.environ.get("VAPID_PRIVATE_KEY")
    if not private_key:
        print(f"  [push:dry-run] {payload['title']}")
        return "ok"
    try:
        from pywebpush import WebPushException, webpush
    except Exception as e:
        print(f"  [push] โหลด pywebpush ไม่ได้: {type(e).__name__}")
        return "error"
    try:
        webpush(
            subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]},
            data=json.dumps(payload, ensure_ascii=False),
            vapid_private_key=private_key,
            vapid_claims={"sub": os.environ.get("VAPID_SUBJECT", "mailto:alert@example.com")},
            ttl=3600,
        )
        return "ok"
    except WebPushException as e:
        status = getattr(getattr(e, "response", None), "status_code", None)
        if status in (404, 410):
            return "gone"
        print(f"  [push] ส่งไม่สำเร็จ (HTTP {status})")
        return "error"
    except Exception as e:
        print(f"  [push] ส่งไม่สำเร็จ: {type(e).__name__}")
        return "error"
```

`checker/check.py`:
```python
"""จุดเข้าของตัวเช็ก: โหลด alerts.json → ดึงราคา → ประเมิน → push → บันทึก"""
from __future__ import annotations

import copy
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from . import hours, rules


def run(data: dict, now: datetime, get_price, send) -> dict:
    out = copy.deepcopy(data)
    out.setdefault("push", [])
    out.setdefault("symbols", [])

    prices: dict[str, float] = {}
    for symbol in rules.active_symbols(out, hours.open_markets(now)):
        price = get_price(symbol)
        if price is not None:
            prices[symbol] = price

    evaluated, fired = rules.evaluate(out, prices, now.strftime("%Y-%m-%dT%H:%M:%SZ"))
    if fired:
        delivered = 0
        for f in fired:
            body = rules.payload(f)
            for sub in out["push"]:
                if sub.get("ok", True) is False:
                    continue
                result = send(sub, body)
                if result == "ok":
                    delivered += 1
                elif result == "gone":
                    sub["ok"] = False
        if delivered:
            evaluated["push"] = out["push"]
            out = evaluated
        else:
            print(f"  ยิง {len(fired)} รายการแต่ส่ง noti ไม่ได้ — คงสถานะ active ไว้ลองรอบถัดไป")

    out["heartbeat"] = now.strftime("%Y-%m-%d")
    return out


def main() -> None:
    from . import prices as price_source
    from . import push

    path = Path(os.environ.get("DATA_FILE", "data/alerts.json"))
    data = json.loads(path.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc)
    out = run(data, now, price_source.last_price, push.send)
    if out != data:
        path.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("อัปเดต alerts.json")
    else:
        print("ไม่มีการเปลี่ยนแปลง")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: รัน test ทั้งหมดให้ผ่าน**

Run: `python -m pytest tests -q`
Expected: `21 passed`

- [ ] **Step 5: เขียน workflow** — `.github/workflows/check.yml`

```yaml
name: check

on:
  schedule:
    # ตลาดไทย: 10:00–16:59 น. เวลาไทย
    - cron: "*/15 3-9 * * 1-5"
    # ตลาดสหรัฐ: 20:00–04:59 น. เวลาไทย (ครอบทั้งเวลาออมแสงและเวลาปกติ)
    - cron: "*/15 13-21 * * 1-5"
  workflow_dispatch: {}

permissions:
  contents: write

concurrency:
  group: check
  cancel-in-progress: false

jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 5
    steps:
      - uses: actions/checkout@v4

      - uses: actions/checkout@v4
        with:
          ref: data
          path: data

      - uses: actions/setup-python@v5
        with:
          python-version: "3.12"
          cache: pip

      - run: pip install -r requirements.txt

      - name: Check alerts
        env:
          DATA_FILE: data/alerts.json
          VAPID_PRIVATE_KEY: ${{ secrets.VAPID_PRIVATE_KEY }}
          VAPID_SUBJECT: ${{ secrets.VAPID_SUBJECT }}
        run: python -m checker.check

      - name: Commit data
        working-directory: data
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add alerts.json
          if git diff --staged --quiet; then
            echo "ไม่มีการเปลี่ยนแปลง"
          else
            git commit -m "data: checker update"
            git pull --rebase origin data
            git push origin HEAD:data
          fi
```

- [ ] **Step 6: รันตัวเช็กในเครื่องแบบทดลอง (ไม่มี VAPID) กับราคาจริง**

สร้างไฟล์ตัวอย่างนอก repo แล้วรัน (SL ตั้งสูงเกินจริงเพื่อให้ยิงแน่นอน):
```bash
pip install -r requirements.txt
mkdir -p /tmp/alert-dry && cat > /tmp/alert-dry/alerts.json <<'EOF'
{"version":1,"heartbeat":null,"push":[{"endpoint":"https://example.invalid/x","keys":{"p256dh":"p","auth":"a"},"ok":true}],
 "symbols":[{"symbol":"NVDA","sl":{"price":999999,"status":"active"},"tp":null,"alerts":[]},
            {"symbol":"PTT.BK","sl":{"price":999999,"status":"active"},"tp":null,"alerts":[]}]}
EOF
DATA_FILE=/tmp/alert-dry/alerts.json python -m checker.check && cat /tmp/alert-dry/alerts.json
```
Expected: ถ้ารันช่วงที่ตลาดใดตลาดหนึ่งอยู่ในช่วงเวลา จะเห็น `[push:dry-run] NVDA แตะ SL 999999.00 (ล่าสุด …)` หรือของ `PTT` และเส้นนั้นเป็น `"status": "fired"` ถ้ารันนอกช่วงเวลาทั้งสองตลาด (เสาร์–อาทิตย์ หรือ 22–02 UTC, 10–12 UTC) จะมีแค่ `heartbeat` เปลี่ยน — ทั้งสองกรณีถือว่าผ่าน ให้รายงานว่าเจอกรณีไหน ถ้ามี `[price] … ล้มเหลว` ให้รายงานข้อความนั้น

- [ ] **Step 7: Commit**

```bash
git add checker/prices.py checker/push.py checker/check.py tests/test_check.py .github/workflows/check.yml
git commit -m "feat: checker entrypoint, yfinance prices, web push, cron workflow"
```

---

### Task 8: โครง PWA + หน้ารายการ + หน้าตั้งค่า

**Files:**
- Create: `tools/make_icons.py`, `web/icons/icon-192.png`, `web/icons/icon-512.png`, `web/manifest.webmanifest`, `web/sw.js`, `web/index.html`, `web/style.css`, `web/app.js`

**Interfaces:**
- Consumes: global `Logic` (Task 1); API ของ Task 3–5
- Produces (global ใน `app.js` ที่ Task 9 ใช้ต่อ):
  - `state = {data, quotes:{[symbol]: {candles, price, prevClose, currency, stale}}, status}`
  - `api(path, body?) -> Promise<json>` (มี `body` = POST พร้อม `x-app-pass`; 401 → ไปหน้าตั้งค่า)
  - `change(action) -> Promise<void>` (เรียก `/api/change` แล้วอัปเดต `state.data`)
  - `loadQuote(symbol) -> Promise<quote|null>`
  - `toast(msg)`, `esc(str)`, `$(selector, el?)`
  - `routes` — object ที่ Task 9 เพิ่ม `routes.chart = (symbol) => {...}`
  - `TREND = {up:"▲ ขาขึ้น", down:"▼ ขาลง", side:"▬ ไซด์เวย์"}`
- Hash routes: `#/` รายการ, `#/s/<SYMBOL>` กราฟ, `#/settings` ตั้งค่า
- `localStorage`: `pass` (รหัสผ่าน), `c:<SYMBOL>` (quote ล่าสุด)

- [ ] **Step 1: สร้างไอคอน** — `tools/make_icons.py`

```python
"""สร้างไอคอน PWA (PNG) ด้วย stdlib ล้วน: พื้นเข้ม + แท่งเทียน 3 แท่ง"""
import struct
import sys
import zlib
from pathlib import Path

BG = (11, 17, 24)
GREEN = (38, 166, 154)
RED = (239, 83, 80)


def png(size: int) -> bytes:
    px = [[BG] * size for _ in range(size)]

    def rect(x0, y0, x1, y1, color):
        for y in range(int(y0 * size), int(y1 * size)):
            for x in range(int(x0 * size), int(x1 * size)):
                px[y][x] = color

    # (กลางแท่ง x, ไส้บน, ตัวบน, ตัวล่าง, ไส้ล่าง, สี)
    candles = [
        (0.30, 0.48, 0.54, 0.72, 0.78, RED),
        (0.50, 0.34, 0.40, 0.62, 0.68, GREEN),
        (0.70, 0.20, 0.26, 0.50, 0.58, GREEN),
    ]
    for cx, wt, bt, bb, wb, color in candles:
        rect(cx - 0.012, wt, cx + 0.012, wb, color)
        rect(cx - 0.07, bt, cx + 0.07, bb, color)

    raw = b"".join(b"\x00" + bytes(c for p in row for c in p) for row in px)

    def chunk(kind: bytes, data: bytes) -> bytes:
        body = kind + data
        return struct.pack(">I", len(data)) + body + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


if __name__ == "__main__":
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "web/icons")
    out.mkdir(parents=True, exist_ok=True)
    for size in (192, 512):
        (out / f"icon-{size}.png").write_bytes(png(size))
        print(f"เขียน {out / f'icon-{size}.png'}")
```

Run: `python tools/make_icons.py web/icons`
Expected: พิมพ์ 2 บรรทัด และมีไฟล์ `web/icons/icon-192.png`, `web/icons/icon-512.png` — เปิดไฟล์ 192 ด้วย Read tool เพื่อดูว่าเป็นพื้นเข้มมีแท่งเทียน 3 แท่ง

- [ ] **Step 2: manifest และ service worker**

`web/manifest.webmanifest`:
```json
{
  "name": "Stock Alert",
  "short_name": "Alert",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "orientation": "portrait",
  "background_color": "#0b1118",
  "theme_color": "#0b1118",
  "lang": "th",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any maskable" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

`web/sw.js`:
```js
// Service worker: cache หน้าแอป (ไม่ cache /api/) + รับ Web Push
const CACHE = "alert-shell-v1";
const SHELL = ["/", "/style.css", "/logic.js", "/chart.js", "/app.js", "/vendor/lightweight-charts.js", "/icons/icon-192.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// network-first: ได้ของใหม่เสมอเมื่อออนไลน์ ใช้ cache เมื่อออฟไลน์
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then((r) => {
        const copy = r.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("/")))
  );
});

self.addEventListener("push", (e) => {
  let p = {};
  try { p = e.data.json(); } catch (err) { p = { title: "Stock Alert", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(
    self.registration.showNotification(p.title || "Stock Alert", {
      body: p.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: p.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = (e.notification.data && e.notification.data.url) || "/";
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ("focus" in c) { c.navigate(url); return c.focus(); }
      }
      return self.clients.openWindow(url);
    })
  );
});
```

- [ ] **Step 3: `web/index.html`**

```html
<!doctype html>
<html lang="th">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0b1118">
  <title>Stock Alert</title>
  <link rel="manifest" href="/manifest.webmanifest">
  <link rel="icon" href="/icons/icon-192.png">
  <link rel="apple-touch-icon" href="/icons/icon-192.png">
  <link rel="stylesheet" href="/style.css">
</head>
<body>
  <div id="banner" class="banner" hidden></div>
  <main id="view"></main>

  <div id="sheet-backdrop" class="backdrop" hidden></div>
  <section id="sheet" class="sheet" hidden aria-modal="true" role="dialog">
    <h2 id="sheet-title"></h2>
    <div id="sheet-kinds" class="seg" hidden>
      <button type="button" data-kind="sl">SL</button>
      <button type="button" data-kind="tp">TP</button>
      <button type="button" data-kind="alert">Alert</button>
    </div>
    <div class="price-row">
      <button type="button" id="sheet-minus" class="step" aria-label="ลดราคา">−</button>
      <input id="sheet-price" type="number" inputmode="decimal" step="0.01" min="0">
      <button type="button" id="sheet-plus" class="step" aria-label="เพิ่มราคา">＋</button>
    </div>
    <p id="sheet-pct" class="muted"></p>
    <p id="sheet-warn" class="warn" hidden></p>
    <div class="sheet-actions">
      <button type="button" id="sheet-cancel" class="btn ghost">ยกเลิก</button>
      <button type="button" id="sheet-save" class="btn primary">บันทึก</button>
    </div>
  </section>

  <div id="toast" class="toast" hidden></div>

  <script src="/vendor/lightweight-charts.js"></script>
  <script src="/logic.js"></script>
  <script src="/chart.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 4: `web/style.css`**

```css
:root {
  --bg: #0b1118; --panel: #0f1720; --line: #1e2a36; --text: #e6edf3; --muted: #8aa0b4;
  --up: #26a69a; --down: #ef5350; --alert: #f5b83d; --accent: #5aa9ff; --fired: #5c6b7a;
  --r: 10px;
}
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); }
body {
  font: 15px/1.45 system-ui, "Noto Sans Thai", sans-serif;
  padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom);
  -webkit-tap-highlight-color: transparent;
}
main { max-width: 560px; margin: 0 auto; }
button, input { font: inherit; color: inherit; }
button { cursor: pointer; }
.muted { color: var(--muted); font-size: 12px; }
.up { color: var(--up); } .down { color: var(--down); }
[hidden] { display: none !important; }

.bar { display: flex; justify-content: space-between; align-items: center; padding: 14px 16px; gap: 8px; }
.bar h1 { font-size: 18px; margin: 0; }
.bar a, .link { color: var(--accent); text-decoration: none; background: none; border: 0; padding: 0; }

.banner { background: #3a2f12; color: var(--alert); padding: 10px 16px; font-size: 13px; }
.banner a { color: inherit; font-weight: 600; }

.row {
  display: flex; justify-content: space-between; align-items: center; gap: 12px;
  padding: 12px 16px; border-top: 1px solid var(--line); color: inherit; text-decoration: none;
}
.row:active { background: var(--panel); }
.row .name { font-weight: 700; }
.row .right { text-align: right; white-space: nowrap; }
.tag { font-size: 10px; padding: 1px 5px; border-radius: 4px; background: #2f4050; margin-left: 6px; font-weight: 600; }

.trend { display: inline-block; padding: 3px 10px; border-radius: 999px; font-weight: 600; font-size: 12px; white-space: nowrap; }
.trend.up { background: #12372f; color: #3fd6c0; }
.trend.down { background: #3a1c1e; color: #ff8a86; }
.trend.side { background: #2a3440; color: var(--muted); }

.add { display: flex; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line); }
.add input, .field input {
  flex: 1; min-width: 0; background: var(--panel); border: 1px solid var(--line);
  border-radius: var(--r); padding: 10px 12px; text-transform: uppercase;
}
.field input { text-transform: none; width: 100%; }
.field { padding: 8px 16px; }
.field label { display: block; font-size: 12px; color: var(--muted); margin-bottom: 4px; }

.btn { border: 0; border-radius: var(--r); padding: 10px 14px; font-weight: 600; background: #17212b; }
.btn.primary { background: #2d6cdf; color: #fff; }
.btn.ghost { background: transparent; border: 1px solid var(--line); }
.btn.danger { background: transparent; color: var(--down); border: 1px solid #5a2a2c; }
.btn:disabled { opacity: .5; }
.stack { display: flex; flex-direction: column; gap: 8px; padding: 8px 16px; }

#chart { height: 46vh; min-height: 260px; touch-action: pan-y; }
.legend { padding: 6px 16px; }
.btns { display: flex; gap: 8px; padding: 10px 16px; }
.btns .btn { flex: 1; padding: 12px 0; }
.btn.sl { background: #3a1c1e; color: #ff8a86; }
.btn.tp { background: #12372f; color: #3fd6c0; }
.btn.al { background: #3a2f12; color: var(--alert); }
.line-item { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; border-top: 1px solid var(--line); gap: 8px; }
.line-item.fired { color: var(--fired); }
.line-item .acts { display: flex; gap: 14px; }
.c-sl { color: #ff8a86; } .c-tp { color: #3fd6c0; } .c-alert { color: var(--alert); }
.line-item.fired .c-sl, .line-item.fired .c-tp, .line-item.fired .c-alert { color: var(--fired); }

.backdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, .55); z-index: 10; }
.sheet {
  position: fixed; left: 0; right: 0; bottom: 0; z-index: 11; background: var(--panel);
  border-radius: 16px 16px 0 0; padding: 16px 16px calc(16px + env(safe-area-inset-bottom));
  max-width: 560px; margin: 0 auto;
}
.sheet h2 { font-size: 16px; margin: 0 0 12px; }
.seg { display: flex; gap: 6px; margin-bottom: 12px; }
.seg button { flex: 1; padding: 8px 0; border-radius: 8px; border: 1px solid var(--line); background: transparent; font-weight: 600; }
.seg button.on { background: #2d6cdf; border-color: #2d6cdf; color: #fff; }
.price-row { display: flex; gap: 8px; }
.price-row input { flex: 1; min-width: 0; text-align: center; font-size: 22px; font-weight: 700; background: var(--bg); border: 1px solid var(--line); border-radius: var(--r); padding: 10px; }
.step { width: 52px; border-radius: var(--r); border: 1px solid var(--line); background: var(--bg); font-size: 22px; }
.warn { color: var(--alert); font-size: 13px; margin: 8px 0 0; }
.sheet-actions { display: flex; gap: 8px; margin-top: 14px; }
.sheet-actions .btn { flex: 1; padding: 12px 0; }

.toast {
  position: fixed; left: 50%; bottom: calc(24px + env(safe-area-inset-bottom)); transform: translateX(-50%);
  background: #2f4050; padding: 10px 16px; border-radius: 999px; font-size: 13px; z-index: 20; max-width: 90vw;
}
.empty { padding: 32px 16px; text-align: center; color: var(--muted); }
```

- [ ] **Step 5: `web/app.js`** (หน้ารายการ + ตั้งค่า + โครงร่วม)

```js
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
```

- [ ] **Step 6: สร้าง `web/chart.js` ชั่วคราวเพื่อให้หน้าโหลดได้** (Task 9 จะเขียนทับทั้งไฟล์)

```js
// Task 9 เขียนไฟล์นี้ใหม่ทั้งหมด
self.AlertChart = null;
```

- [ ] **Step 7: ตรวจหน้ารายการและหน้าตั้งค่าในเบราว์เซอร์ด้วย API ปลอม**

เขียน server ทดสอบไว้ใน scratchpad (ไม่ commit) ชื่อ `dev-server.js` แล้วรันด้วย `node <scratchpad>/dev-server.js "<path ของ Alert>/web"`:

```js
// dev server: เสิร์ฟ web/ + จำลอง API ด้วย handler จริง โดยเก็บ alerts.json ในหน่วยความจำ
const http = require("http");
const fs = require("fs");
const path = require("path");
const root = path.resolve(process.argv[2]);
process.env.APP_PASSCODE = "dev";
process.env.GITHUB_REPO = "dev/dev";
process.env.GITHUB_TOKEN = "dev";
process.env.VAPID_PUBLIC_KEY = "";

// GitHub ปลอม: ดัก fetch ไปที่ api.github.com
let file = { version: 1, heartbeat: null, push: [], symbols: [] };
let sha = 1;
const realFetch = global.fetch;
global.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes("api.github.com") && u.includes("/contents/alerts.json")) {
    if (opts.method === "PUT") {
      file = JSON.parse(Buffer.from(JSON.parse(opts.body).content, "base64").toString("utf8"));
      sha++;
      return { ok: true, status: 200, json: async () => ({}) };
    }
    return { ok: true, status: 200, json: async () => ({ content: Buffer.from(JSON.stringify(file)).toString("base64"), sha: "s" + sha }) };
  }
  if (u.includes("api.github.com") && u.includes("/actions/")) {
    return { ok: true, status: 200, json: async () => ({ workflow_runs: [{ updated_at: new Date().toISOString() }] }) };
  }
  return realFetch(url, opts);
};

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    const name = url.pathname.slice(5);
    const handler = require(path.join(root, "api", name + ".js"));
    let raw = "";
    for await (const chunk of req) raw += chunk;
    req.query = Object.fromEntries(url.searchParams);
    req.body = raw ? JSON.parse(raw) : undefined;
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (obj) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(obj)); };
    return handler(req, res);
  }
  const file = path.join(root, url.pathname === "/" ? "index.html" : url.pathname);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.statusCode = 404; return res.end("not found"); }
  res.setHeader("Content-Type", TYPES[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(5178, () => console.log("http://localhost:5178"));
```

เปิด `http://localhost:5178` ที่ความกว้าง 375px แล้วตรวจ:
1. หน้ารายการว่าง แสดง "ยังไม่มีหุ้น" และแถบ "ยังไม่ได้เปิด noti"
2. กดเพิ่ม `NVDA` โดยยังไม่ใส่รหัส → ถูกพาไปหน้าตั้งค่า และมี toast เรื่องรหัสผ่าน
3. ใส่รหัส `dev` กดบันทึก กลับหน้ารายการ เพิ่ม `NVDA` และ `PTT.BK` → มี 2 แถว มีราคา % และป้ายแนวโน้ม `PTT` มีป้าย `TH`
4. เพิ่ม `NVDA` ซ้ำ → toast "NVDA มีอยู่แล้ว"; เพิ่ม `ZZZZZZZZ` → toast "ไม่พบข้อมูลราคา"
5. มุมบนแสดง "เช็กล่าสุด HH:MM"
6. Console ไม่มี error

Expected: ผ่านครบ 6 ข้อ ถ้าข้อใดไม่ผ่านให้แก้แล้วตรวจซ้ำ

- [ ] **Step 8: Commit**

```bash
git add tools/make_icons.py web/icons web/manifest.webmanifest web/sw.js web/index.html web/style.css web/app.js web/chart.js
git commit -m "feat: PWA shell, stock list, settings, push subscription"
```

---

### Task 9: หน้ากราฟ + แผ่นตั้งราคา

**Files:**
- Modify: `web/chart.js` (เขียนทับทั้งไฟล์)
- Modify: `web/app.js` (เพิ่มส่วน "sheet" และ "chart view" ก่อนบรรทัด `// ---------- router ----------`)

**Interfaces:**
- Consumes: `LightweightCharts` v4.1.3 (`createChart`, `addCandlestickSeries`, `addLineSeries`, `series.createPriceLine`, `series.removePriceLine`, `series.coordinateToPrice`, `LineStyle`), `Logic`, และ `state`, `api`, `change`, `loadQuote`, `toast`, `esc`, `$`, `routes`, `TREND` จาก Task 8
- Produces:
  - `AlertChart.create(el, {onLongPress(price:number)}) -> {setData(candles), setLines(lines), destroy()}`
    - `lines`: `[{price, color:"sl"|"tp"|"alert"|"fired"|"ref", title}]`
  - `window.Sheet = {open(opts), close()}` — `opts = {symbol, last, kind:"sl"|"tp"|"alert", price, id?, choose?:boolean, onSaved()}`
  - `routes.chart(symbol)`

- [ ] **Step 1: เขียน `web/chart.js` ใหม่ทั้งไฟล์**

```js
// ห่อ lightweight-charts: แท่งรายวัน + MA50/MA200 + เส้นราคา + แตะค้าง
(function (root) {
  const C = { bg: "#0f1720", grid: "#1e2a36", text: "#8aa0b4", up: "#26a69a", down: "#ef5350", ma50: "#5aa9ff", ma200: "#b08cff" };
  const LINE_COLORS = { sl: "#ef5350", tp: "#26a69a", alert: "#f5b83d", fired: "#5c6b7a", ref: "#3a4a5a" };
  const LONG_PRESS_MS = 550;
  const MOVE_TOLERANCE = 10;

  function create(el, opts) {
    const LC = root.LightweightCharts;
    const chart = LC.createChart(el, {
      autoSize: true,
      layout: { background: { color: C.bg }, textColor: C.text },
      grid: { vertLines: { color: C.grid }, horzLines: { color: C.grid } },
      rightPriceScale: { borderColor: C.grid },
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
    let priceLines = [];

    function setData(cs) {
      candles.setData(cs.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));
      const closes = cs.map((c) => c.c);
      const toLine = (arr) => arr.map((v, i) => (v == null ? null : { time: cs[i].t, value: v })).filter(Boolean);
      ma50.setData(toLine(Logic.sma(closes, 50)));
      ma200.setData(toLine(Logic.sma(closes, 200)));
      if (cs.length) {
        chart.timeScale().setVisibleRange({ from: cs[Math.max(0, cs.length - 252)].t, to: cs[cs.length - 1].t });
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

    // แตะค้าง → ราคา ณ จุดที่แตะ
    let timer = null;
    let start = null;
    const cancel = () => { clearTimeout(timer); timer = null; };
    const onDown = (e) => {
      cancel();
      start = { x: e.clientX, y: e.clientY };
      timer = setTimeout(() => {
        const y = start.y - el.getBoundingClientRect().top;
        const price = candles.coordinateToPrice(y);
        if (price != null && price > 0 && opts && opts.onLongPress) opts.onLongPress(Math.round(price * 100) / 100);
      }, LONG_PRESS_MS);
    };
    const onMove = (e) => {
      if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > MOVE_TOLERANCE) cancel();
    };
    const noMenu = (e) => e.preventDefault();
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointermove", onMove, true);
    ["pointerup", "pointercancel", "pointerleave"].forEach((n) => el.addEventListener(n, cancel, true));
    el.addEventListener("contextmenu", noMenu);

    return {
      setData,
      setLines,
      destroy() { cancel(); chart.remove(); },
    };
  }

  root.AlertChart = { create };
})(self);
```

- [ ] **Step 2: เพิ่มส่วน sheet ใน `web/app.js`** — วางก่อนบรรทัด `// ---------- router ----------`

```js
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
    const base = { symbol: cur.symbol, price };
    let action;
    if (cur.kind === "sl") action = { ...base, action: "set_sl" };
    else if (cur.kind === "tp") action = { ...base, action: "set_tp" };
    else if (cur.id) action = { ...base, action: "update_alert", id: cur.id, last: cur.last };
    else action = { ...base, action: "add_alert", last: cur.last };
    el.save.disabled = true;
    try {
      await change(action);
      const done = cur.onSaved;
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
```

- [ ] **Step 3: เพิ่มส่วน chart view ใน `web/app.js`** — วางต่อจากส่วน sheet ก่อนบรรทัด `// ---------- router ----------`

```js
// ---------- chart view ----------
let activeChart = null;

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

  activeChart = AlertChart.create($("#chart"), {
    onLongPress: (price) => openSheet("alert", price, { choose: true }),
  });
  activeChart.setData(q.candles);

  function redraw() {
    const s = find();
    if (!s || !activeChart) return;
    activeChart.setLines(chartLines(s, q));
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
```

- [ ] **Step 4: ทำลายกราฟเมื่อออกจากหน้ากราฟ** — แก้ฟังก์ชัน `route()` ใน `web/app.js`

แทนที่บรรทัด:
```js
  if (window.Sheet) window.Sheet.close();
```
ด้วย:
```js
  if (window.Sheet) window.Sheet.close();
  if (!m && typeof activeChart !== "undefined" && activeChart) { activeChart.destroy(); activeChart = null; }
```

- [ ] **Step 5: ตรวจ syntax และ test เดิม**

Run: `cd web && node --check app.js && node --check chart.js && node --check sw.js && node --test`
Expected: ไม่มี output จาก `--check` และ test ผ่านทั้งหมด

- [ ] **Step 6: ตรวจหน้ากราฟในเบราว์เซอร์** (ใช้ `dev-server.js` จาก Task 8 Step 7 ที่ 375px รหัส `dev`)

1. เพิ่ม `NVDA` แตะแถว → หน้ากราฟ: แท่งเทียนราว 1 ปี, เส้น MA50 ฟ้าทึบ, MA200 ม่วงประ, เส้นจาง 52w สูง/ต่ำ, ราคา + % + ป้ายแนวโน้ม
2. กด SL → แผ่นตั้งราคาเติมราคาล่าสุด มี % และคำเตือนสีเหลือง (เพราะ SL = ราคาล่าสุด) กด − หลายครั้ง คำเตือนหาย % ติดลบ กดบันทึก → เส้นแดง `SL` บนกราฟ และรายการใต้ปุ่ม
3. กด TP ตั้งสูงกว่าราคา → เส้นเขียว
4. กด ＋Alert ตั้งสูงกว่าราคา → เส้นเหลือง รายการแสดง "🔔 ขึ้นถึง"; ตั้งอีกเส้นต่ำกว่าราคา → "🔔 ลงถึง"
5. แตะค้างบนกราฟ (กดเมาส์ค้าง ~0.6 วินาทีโดยไม่ขยับ) → แผ่นตั้งราคาเปิดพร้อมตัวเลือก SL/TP/Alert และราคาใกล้จุดที่แตะ; ลากกราฟปกติต้องไม่เปิดแผ่น
6. กด "แก้" ที่ alert เปลี่ยนราคา → เส้นย้าย จำนวน alert ไม่เพิ่ม
7. กด "ลบ" ที่ TP → เส้นเขียวหาย
8. ตั้ง alert ครบ 5 เส้นแล้วเพิ่มเส้นที่ 6 → toast "ตั้ง alert ได้ไม่เกิน 5 เส้นต่อหุ้น"
9. กลับหน้ารายการ → แถว `NVDA` สรุป `SL … · 🔔 5`
10. กลับเข้าไปกด "ลบ NVDA ออกจากรายการ" ยืนยัน → กลับหน้ารายการ ไม่มี `NVDA`
11. Console ไม่มี error ตลอดการทดสอบ

Expected: ผ่านครบ 11 ข้อ ถ้าข้อใดไม่ผ่านให้แก้แล้วตรวจซ้ำ ถ้าตรวจข้อ 5 ด้วยเครื่องมืออัตโนมัติไม่ได้ ให้รายงานว่าข้อนั้นยังไม่ได้ตรวจ

- [ ] **Step 7: Commit**

```bash
git add web/chart.js web/app.js
git commit -m "feat: chart screen with MA/trend, SL/TP/alert lines, price sheet"
```

---

### Task 10: README, แยก repo ออกจาก Stock News, ตรวจรวม

**Files:**
- Create: `README.md`
- Modify: `../.gitignore` (ของ Stock News — เพิ่มบรรทัดเดียว)
- Modify: `docs/superpowers/specs/2026-11-13-stock-alert-app-design.md` (ไม่ต้องแก้ ถ้าข้อ 7.2 ระบุกติกา "ส่งสำเร็จอย่างน้อย 1 เครื่อง" แล้ว)

**Interfaces:**
- Consumes: ทุก task ก่อนหน้า
- Produces: คู่มือติดตั้งที่ผู้ใช้ทำตามได้เองโดยไม่ต้องถาม

- [ ] **Step 1: เขียน `README.md`**

````markdown
# 🔔 Stock Alert

แอปมือถือ (PWA) สำหรับดูกราฟแท่งรายวัน วางเส้น Stop Loss / Take Profit / alert ราคา
และรับ notification เมื่อราคาแตะ — หุ้นสหรัฐและหุ้นไทย ไม่เกิน 20 ตัว

> เป็นเครื่องมือเฝ้าราคาตามเส้นที่คุณตั้งเอง **ไม่ใช่คำแนะนำการลงทุน** และไม่ส่งคำสั่งซื้อขาย

## ทำงานอย่างไร

```
มือถือ (PWA บน Vercel)  ──►  /api/*  ──►  alerts.json บน branch "data"
GitHub Actions ทุก 15 นาทีช่วงตลาดเปิด  ──►  ดึงราคา (Yahoo) ──►  Web Push
```

- ราคามาจาก Yahoo Finance ช้าประมาณ 15 นาที และ cron ของ GitHub มักช้าอีก 5–15 นาที
- ตัวเช็กเทียบกับราคาล่าสุดเท่านั้น ราคาที่แตะแล้วกลับระหว่างสองรอบจะไม่แจ้ง
- repo นี้เป็น public: รายชื่อหุ้นและราคา SL/TP ใน `alerts.json` เปิดเผย

## ติดตั้ง (ทำครั้งเดียว)

### 1. สร้างกุญแจ VAPID
```bash
cd web && npm install && npx web-push generate-vapid-keys
```
เก็บ `Public Key` และ `Private Key` ไว้ใช้ในข้อ 4 และ 5

### 2. สร้าง public repo บน GitHub แล้ว push โค้ด
```bash
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### 3. สร้าง branch `data` พร้อมไฟล์เปล่า
```bash
git switch --orphan data
echo '{"version":1,"heartbeat":null,"push":[],"symbols":[]}' > alerts.json
git add alerts.json && git commit -m "data: init"
git push -u origin data
git switch main
```

### 4. GitHub → Settings → Secrets and variables → Actions
| Secret | ค่า |
|---|---|
| `VAPID_PRIVATE_KEY` | Private Key จากข้อ 1 |
| `VAPID_SUBJECT` | `mailto:<อีเมลของคุณ>` |

### 5. Vercel
1. Import repo → **Root Directory = `web`** · Framework = *Other* · ไม่มี build command
2. สร้าง GitHub fine-grained PAT เฉพาะ repo นี้: **Contents: Read and write**, **Actions: Read**
3. Settings → Environment Variables:

| ตัวแปร | ค่า |
|---|---|
| `APP_PASSCODE` | รหัสผ่านของแอป ตั้งเอง |
| `GITHUB_TOKEN` | PAT จากข้อ 2 |
| `GITHUB_REPO` | `<user>/<repo>` |
| `VAPID_PUBLIC_KEY` | Public Key จากข้อ 1 |
| `VAPID_PRIVATE_KEY` | Private Key จากข้อ 1 |
| `VAPID_SUBJECT` | `mailto:<อีเมลของคุณ>` |

4. Redeploy

### 6. บนมือถือ Android (Chrome)
1. เปิดลิงก์ Vercel → เมนู ⋮ → **เพิ่มลงในหน้าจอหลัก**
2. เปิดแอปจากไอคอน → ⚙︎ → ใส่รหัสผ่าน → **บันทึกรหัสผ่าน**
3. กด **เปิด noti บนเครื่องนี้** → อนุญาต
4. กด **ทดสอบ noti** → ต้องมี notification ขึ้น
5. ถ้า noti ไม่ขึ้นตอนปิดจอ: การตั้งค่า Android → แอป → Chrome → แบตเตอรี่ → ไม่จำกัด

### 7. ตรวจตัวเช็ก
GitHub → Actions → **check** → Run workflow → ต้องเป็นสีเขียว และหน้าแอปแสดง "เช็กล่าสุด"

## ใช้งาน

- **เพิ่มหุ้น:** พิมพ์ชื่อในหน้ารายการ หุ้นไทยเติม `.BK` เช่น `PTT.BK`
- **ตั้งเส้น:** กดปุ่ม SL / TP / ＋Alert หรือแตะค้างบนกราฟ
- **หลังแจ้งเตือน:** เส้นเป็นสีเทา กด "เปิดใช้ซ้ำ" หรือ "ลบ"
- **ป้ายแนวโน้ม:** ขาขึ้น = ราคา > MA50 > MA200 · ขาลง = ราคา < MA50 < MA200 · นอกนั้นไซด์เวย์

## ข้อควรรู้

- **Cron ถูกปิดเอง:** GitHub ปิด scheduled workflow ของ public repo ที่ไม่มีความเคลื่อนไหว 60 วัน
  ตัวเช็ก commit `heartbeat` วันละครั้งเพื่อกันไว้ ถ้าแอปขึ้นคำเตือน "ตัวเช็กราคาไม่ทำงาน"
  ให้เข้า Actions → check → **Enable workflow**
- **เวลาเช็ก:** ตลาดไทย 10:00–16:59 น. · ตลาดสหรัฐ 20:00–04:59 น. (เวลาไทย, จ.–ศ. ตามเวลา UTC)
- **Yahoo ดึงไม่ได้:** กราฟจะแสดงข้อมูลชุดล่าสุดพร้อมป้าย "ข้อมูลเก่า"

## พัฒนา

```bash
cd web && npm install && node --test        # test ฝั่ง JS
pip install -r requirements.txt && python -m pytest tests -q   # test ฝั่ง Python
DATA_FILE=path/to/alerts.json python -m checker.check          # รันตัวเช็ก (ไม่ตั้ง VAPID = ไม่ส่งจริง)
```
````

- [ ] **Step 2: กัน Stock News ไม่ให้เห็นโฟลเดอร์ `Alert/`**

ตรวจก่อนว่ายังไม่มี:
```bash
grep -n "^Alert/" ../.gitignore || echo "ยังไม่มี"
```
ถ้าได้ "ยังไม่มี" ให้ต่อท้ายไฟล์ `../.gitignore` ด้วย Edit tool (ไม่ใช้ `echo >>`) เป็นบรรทัดใหม่:
```
Alert/
```
แล้วตรวจ:
```bash
git -C .. status --short | grep -c "Alert" || true
```
Expected: `0` — **ห้าม commit ใน repo ของ Stock News** (มีงานค้างของผู้ใช้อยู่) ให้รายงานว่าแก้ `.gitignore` แล้วและยังไม่ได้ commit

- [ ] **Step 3: ตรวจ spec ข้อ 7.2 ให้ตรงกับพฤติกรรมจริง**

Run: `grep -n "อย่างน้อย 1 เครื่อง" docs/superpowers/specs/2026-11-13-stock-alert-app-design.md`
Expected: เจอ 1 บรรทัด ถ้าไม่เจอ ให้แทนที่บรรทัดที่ขึ้นต้นด้วย `- ถ้าส่ง push ไม่สำเร็จทุกเครื่อง` ด้วย:
```
- ทำเครื่องหมาย `fired` เฉพาะเมื่อส่ง push สำเร็จอย่างน้อย 1 เครื่อง มิฉะนั้นเส้นยัง `active` เพื่อให้รอบถัดไปลองใหม่ (รวมกรณียังไม่มีเครื่องที่เปิด noti)
```

- [ ] **Step 4: ตรวจรวมทั้งโปรเจกต์**

Run:
```bash
cd web && node --test && cd .. && python -m pytest tests -q && git status --short
```
Expected: test JS ผ่านทั้งหมด, `21 passed`, และ `git status` เหลือเฉพาะ `README.md` (กับ spec ถ้าแก้ใน Step 3) — ไม่มี `node_modules`, `__pycache__`, `.superpowers` โผล่มา

- [ ] **Step 5: ตรวจว่าไม่มี secret หรือข้อมูลส่วนตัวหลุดเข้า repo**

Run:
```bash
git grep -nIE "ghp_|github_pat_|BEGIN (EC )?PRIVATE KEY|@gmail\.com" -- . ':!docs' || echo "สะอาด"
```
Expected: `สะอาด`

- [ ] **Step 6: Commit**

```bash
git add README.md docs
git commit -m "docs: setup guide"
```

- [ ] **Step 7: รายงานสิ่งที่ยังไม่ได้ตรวจ**

รายงานต่อผู้ใช้ให้ชัดว่าสิ่งต่อไปนี้ตรวจในเครื่องไม่ได้ และต้องตรวจหลัง deploy ตาม README ข้อ 6–7:
- Web Push จริงบนมือถือ (ปุ่มทดสอบ noti และ noti จากตัวเช็ก)
- กุญแจ VAPID ที่สร้างด้วย `web-push` ใช้กับ `pywebpush` ได้
- การติดตั้ง PWA ลงหน้าจอหลัก
- Workflow `check` บน GitHub และการ commit ลง branch `data`
- `/api/candles` เมื่อรันบน Vercel (Yahoo อาจปฏิบัติต่อ IP ของ Vercel ต่างจากเครื่องนี้)
- commit `heartbeat` บน branch `data` นับเป็นความเคลื่อนไหวตามกฎ 60 วันหรือไม่
