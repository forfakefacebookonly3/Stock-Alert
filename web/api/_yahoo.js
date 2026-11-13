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
