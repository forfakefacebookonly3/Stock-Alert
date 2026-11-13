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

  // แถบ RSI: เส้นคั่น + ป้ายชื่อ/ค่าล่าสุด + ป้าย 70/30 (overlay scale "rsi" ไม่มีแกนใน 4.1.3)
  class RsiBandPrimitive {
    constructor(onBand) { this.last = null; this.series = null; this.request = null; this.onBand = onBand; }
    attached({ series, requestUpdate }) { this.series = series; this.request = requestUpdate; }
    detached() { this.series = null; this.request = null; }
    setLast(v) { this.last = v; if (this.request) this.request(); }
    updateAllViews() {}
    paneViews() {
      return [{ zOrder: () => "top", renderer: () => ({ draw: (target) => this.draw(target) }) }];
    }
    draw(target) {
      if (!this.series) return;
      const top = this.series.priceToCoordinate(100);
      if (top == null) { this.onBand(null); return; }
      const sepY = top - 4;
      this.onBand(sepY);
      const y70 = this.series.priceToCoordinate(70);
      const y30 = this.series.priceToCoordinate(30);
      target.useMediaCoordinateSpace(({ context: ctx, mediaSize }) => {
        const w = mediaSize.width;
        ctx.save();
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, Math.round(sepY) + 0.5); ctx.lineTo(w, Math.round(sepY) + 0.5); ctx.stroke();
        ctx.font = "10px system-ui, sans-serif";
        ctx.fillStyle = C.rsi;
        ctx.textBaseline = "top";
        ctx.fillText(`RSI 14 · ${this.last == null ? "—" : this.last.toFixed(1)}`, 4, sepY + 3);
        ctx.fillStyle = C.text;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        if (y70 != null) ctx.fillText("70", w - 3, y70);
        if (y30 != null) ctx.fillText("30", w - 3, y30);
        ctx.restore();
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
    // ราคาที่ต่ำกว่าเส้นคั่นแถบ RSI ไม่แสดงบนแกนขวา (กันสับสนกับค่า RSI)
    let bandFloor = null;
    const candles = chart.addCandlestickSeries({
      priceFormat: { type: "custom", minMove: 0.01, formatter: (p) => (bandFloor != null && p < bandFloor ? "" : p.toFixed(2)) },
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
    const rsiBand = new RsiBandPrimitive((sepY) => {
      const v = sepY == null ? null : candles.coordinateToPrice(sepY);
      bandFloor = v == null || !Number.isFinite(v) ? null : v;
    });
    rsi.attachPrimitive(rsiBand);

    let cs = [];
    let priceLines = [];
    let fiboItems = [];
    let mode = null;
    let pendingPreview = null;

    function setData(input) {
      cs = input || [];
      candles.setData(cs.map((c) => ({ time: c.t, open: c.o, high: c.h, low: c.l, close: c.c })));
      const closes = cs.map((c) => c.c);
      const toLine = (arr) => arr.map((v, i) => (v == null ? null : { time: cs[i].t, value: v })).filter(Boolean);
      ma50.setData(toLine(Logic.sma(closes, 50)));
      ma200.setData(toLine(Logic.sma(closes, 200)));
      const rsiPts = toLine(Logic.rsi(closes, 14));
      rsi.setData(rsiPts);
      rsiBand.setLast(rsiPts.length ? rsiPts[rsiPts.length - 1].value : null);
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
      pendingPreview = preview || null;
      fibo.set(fiboItems, pendingPreview);
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
      if (!Number.isFinite(logical) || price == null) return null;
      return Logic.snapToCandle(cs, logical, price);
    }

    const onDown = (e) => {
      if (!e.isPrimary) return;
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
      if (!e.isPrimary) return;
      if (mode === "fibo" && drag) {
        const b = pointAt(e);
        if (b) { drag.b = b; fibo.set(fiboItems, toFibo(drag.a, b)); }
        return;
      }
      if (moved(e)) cancel();
    };

    const onUp = (e) => {
      if (!e.isPrimary) return;
      cancel();
      if (mode === "fibo" && drag) {
        const { a, b } = drag;
        drag = null;
        if (b && b.t !== a.t && b.p !== a.p) {
          pendingPreview = toFibo(a, b);
          if (o.onFiboDrawn) o.onFiboDrawn(pendingPreview);
        } else {
          fibo.set(fiboItems, pendingPreview);
        }
      } else if (mode === "mark" && start && !moved(e)) {
        const p = pointAt(e);
        if (p && o.onMarkTap) o.onMarkTap(p.t);
      }
      start = null;
    };

    const onCancel = () => {
      cancel();
      if (drag) { drag = null; fibo.set(fiboItems, pendingPreview); }
      start = null;
    };

    function setMode(m) {
      mode = m || null;
      pendingPreview = null;
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
