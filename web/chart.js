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
