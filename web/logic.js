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
