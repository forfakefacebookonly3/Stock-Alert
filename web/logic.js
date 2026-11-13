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
  // ตัวเช็กถือว่าค้างเมื่อตลาดที่ดูอยู่เปิดอยู่ และผ่านไป >45 นาทีนับจากรอบล่าสุดหรือจุดเปิดหน้าต่างวันนี้ (อันที่ใหม่กว่า)
  function checkerStale(lastRunMs, now, markets) {
    const STALE = 45 * 60 * 1000;
    return (markets || []).some((m) => {
      if (!isMarketOpen(m, now)) return false;
      const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), WINDOWS[m][0]);
      return now.getTime() - Math.max(lastRunMs || 0, start) > STALE;
    });
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

  return { marketOf, displaySymbol, curSym, sma, trendOf, pctFrom, range52w, isMarketOpen, checkerStale, dirFor, wouldFireNow, fmt, rsi, fibLevels, snapToCandle, fmtDM, numberMarks };
});
