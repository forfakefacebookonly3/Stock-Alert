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
  assert.match(calledUrl, /\/v8\/finance\/chart\/PTT\.BK\?range=5y&interval=1d$/);
  assert.equal(out.candles.length, 3);
});

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
