(function () {
  "use strict";

  var state = {
    data: null,
    catById: {},
    catOrder: [],
    activeCat: "meta-ads",
    desde: null,
    hasta: null,
    donutCircles: {},
    _userInteracted: false
  };

  var MAX_RANGE_STRIP_DAYS = 45;
  var QUICK_RANGES = [
    { id: "7d", label: "Últimos 7 días" },
    { id: "30d", label: "Últimos 30 días" },
    { id: "all", label: "Todo el periodo" }
  ];

  /* ---------------- title fits the container width on one line ---------------- */
  var FIT_MIN_VIEWPORT = 640;
  function fitTitle() {
    var h1 = document.querySelector("h1");
    var top = document.querySelector(".top");
    var logo = document.querySelector(".badge-logo");
    if (!h1 || !top) return;
    if (window.innerWidth <= FIT_MIN_VIEWPORT) {
      h1.style.fontSize = "";
      return;
    }
    /* measure against the row itself: the wrapping flex item stretches while the
       title is oversized, so its own width is not a reliable reference */
    var cs = getComputedStyle(top);
    var gap = parseFloat(cs.columnGap) || parseFloat(cs.gap) || 0;
    var available = top.clientWidth - (logo ? logo.offsetWidth : 0) - gap - 2;
    if (available <= 0) return;

    /* an off-screen twin measures the real text width: scrollWidth on a
       non-scrolling element reports the clamped width, not the overflow.
       Fraunces is an optical-size font, so glyph widths do not scale linearly
       with font-size - measure at the candidate size and converge instead. */
    var h1cs = getComputedStyle(h1);
    var probe = document.createElement("span");
    probe.textContent = h1.textContent.trim();
    probe.style.cssText = "position:absolute;left:-9999px;top:-9999px;white-space:nowrap;visibility:hidden;";
    probe.style.fontFamily = h1cs.fontFamily;
    probe.style.fontWeight = h1cs.fontWeight;
    probe.style.fontStyle = h1cs.fontStyle;
    probe.style.textTransform = h1cs.textTransform;
    probe.style.letterSpacing = "0.005em";
    document.body.appendChild(probe);

    function widthAt(px) {
      probe.style.fontSize = px + "px";
      return probe.getBoundingClientRect().width;
    }
    function clampSize(px) { return Math.max(18, Math.min(px, 88)); }

    var size = clampSize(44);
    var width = widthAt(size);
    for (var i = 0; i < 8 && width > 0; i++) {
      var next = clampSize(Math.floor(size * available / width));
      if (next === size) break;
      size = next;
      width = widthAt(size);
    }
    while (size > 18 && widthAt(size) > available) size--;

    document.body.removeChild(probe);
    h1.style.fontSize = size + "px";
  }
  window.addEventListener("resize", function () {
    clearTimeout(fitTitle._t);
    fitTitle._t = setTimeout(fitTitle, 120);
  });
  window.addEventListener("load", fitTitle);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitTitle);
  fitTitle();

  function parseDate(str) {
    var p = str.split("-").map(Number);
    return new Date(p[0], p[1] - 1, p[2]);
  }
  function toISO(d) {
    var y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }
  function addDays(d, n) {
    var r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }
  function daysBetween(a, b) {
    return Math.round((b - a) / 86400000);
  }
  function fmtMoney(n) {
    var whole = Math.round(n * 100) % 100 === 0;
    return n.toLocaleString("es-MX", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 });
  }
  function fmtDateShort(d) {
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short" });
  }
  function fmtDateFull(d) {
    return d.toLocaleDateString("es-MX", { day: "numeric", month: "short", year: "numeric" });
  }
  function movStart(m) { return parseDate(m.fecha || m.fechaInicio); }
  function movEnd(m) { return parseDate(m.fecha || m.fechaFin); }
  function overlaps(mStart, mEnd, rangeStart, rangeEnd) {
    return mStart <= rangeEnd && mEnd >= rangeStart;
  }
  /* A period-level (non-exact) movimiento reports one lump sum for its whole
     fechaInicio-fechaFin span. When only part of that span falls inside the
     selected range, attributing the FULL amount to the range overstates the
     spend (e.g. a 12-day total shown as if it all happened in a 7-day window).
     Spread it evenly across its own days and count only the days that overlap. */
  function proratedAmount(m, rangeStart, rangeEnd) {
    if (m.exacto || m.fecha) return m.importe; // single-day entries need no prorating
    var mStart = movStart(m), mEnd = movEnd(m);
    var spanDays = daysBetween(mStart, mEnd) + 1;
    var ovStart = mStart > rangeStart ? mStart : rangeStart;
    var ovEnd = mEnd < rangeEnd ? mEnd : rangeEnd;
    var ovDays = daysBetween(ovStart, ovEnd) + 1;
    if (ovDays <= 0) return 0;
    if (ovDays >= spanDays) return m.importe; // range fully covers the entry's own span
    return m.importe * (ovDays / spanDays);
  }
  function warnIcon() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  }

  fetch("data/gastos.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      state.data = data;
      data.categorias.forEach(function (c) { state.catById[c.id] = c; state.catOrder.push(c.id); });
      init();
    })
    .catch(function (err) {
      document.getElementById("liveRange").textContent = "";
      document.getElementById("liveChart").innerHTML =
        '<div class="live-empty">No se pudieron cargar los datos (data/gastos.json). Si abriste el archivo directo desde tu computadora, sírvelo con un servidor local o públicalo en GitHub Pages.</div>';
      console.error(err);
    });

  function init() {
    buildDonutCircles();
    buildBreakdownRows();

    var allStart = null, allEnd = null;
    state.data.movimientos.forEach(function (m) {
      var s = movStart(m), e = movEnd(m);
      if (!allStart || s < allStart) allStart = s;
      if (!allEnd || e > allEnd) allEnd = e;
    });
    state.rangeMin = allStart;
    state.rangeMax = allEnd;

    /* defaults: last 7 days with data + Meta Ads */
    var defaultRange = computePresetRange("7d");
    state.desde = defaultRange.desde;
    state.hasta = defaultRange.hasta;
    document.getElementById("fDesde").value = toISO(state.desde);
    document.getElementById("fHasta").value = toISO(state.hasta);
    document.getElementById("fDesde").addEventListener("change", onDateChange);
    document.getElementById("fHasta").addEventListener("change", onDateChange);

    renderChips();
    renderQuickRanges();
    renderLive();
    renderSpotlight();
    renderHistorical();

    var detailBtn = document.getElementById("detailToggle");
    detailBtn.addEventListener("click", function () {
      var list = document.getElementById("resMovs");
      var open = list.classList.toggle("open");
      detailBtn.setAttribute("aria-expanded", open ? "true" : "false");
      updateDetailLabel(open);
    });

    var histBtn = document.getElementById("histToggle");
    histBtn.addEventListener("click", function () {
      var body = document.getElementById("histBody");
      var open = body.classList.toggle("open");
      histBtn.setAttribute("aria-expanded", open ? "true" : "false");
      histBtn.textContent = open ? "Ocultar total histórico acumulado" : "Ver total histórico acumulado";
    });

    document.getElementById("footUpdated").textContent = fmtDateFull(parseDate(state.data.actualizado));
    renderResults();
  }

  function onDateChange() {
    var d = document.getElementById("fDesde").value;
    var h = document.getElementById("fHasta").value;
    if (d) state.desde = parseDate(d);
    if (h) state.hasta = parseDate(h);
    state._userInteracted = true;
    renderQuickRanges();
    renderResults();
  }

  /* ---------------- quick date-range presets ---------------- */
  function computePresetRange(id) {
    var maxDate = state.rangeMax;
    if (id === "7d") return { desde: addDays(maxDate, -6), hasta: maxDate };
    if (id === "30d") {
      var d = addDays(maxDate, -29);
      if (state.rangeMin && d < state.rangeMin) d = state.rangeMin;
      return { desde: d, hasta: maxDate };
    }
    return { desde: state.rangeMin, hasta: state.rangeMax };
  }
  function renderQuickRanges() {
    var el = document.getElementById("quickRanges");
    el.innerHTML = "";
    QUICK_RANGES.forEach(function (qr) {
      var range = computePresetRange(qr.id);
      var isActive = state.desde && state.hasta &&
        toISO(state.desde) === toISO(range.desde) && toISO(state.hasta) === toISO(range.hasta);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "qr-btn" + (isActive ? " active" : "");
      btn.textContent = qr.label;
      btn.addEventListener("click", function () { applyQuickRange(qr.id); });
      el.appendChild(btn);
    });
  }
  function applyQuickRange(id) {
    var range = computePresetRange(id);
    state.desde = range.desde;
    state.hasta = range.hasta;
    document.getElementById("fDesde").value = toISO(range.desde);
    document.getElementById("fHasta").value = toISO(range.hasta);
    state._userInteracted = true;
    renderQuickRanges();
    renderResults();
  }

  /* ---------------- donut (persistent elements for smooth transitions) ---------------- */
  function buildDonutCircles() {
    var svg = document.getElementById("donutSvg");
    state.catOrder.forEach(function (id) {
      var cat = state.catById[id];
      var circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "86");
      circle.setAttribute("cy", "86");
      circle.setAttribute("r", "66");
      circle.setAttribute("fill", "none");
      circle.setAttribute("stroke", cat.color);
      circle.setAttribute("stroke-width", "20");
      circle.setAttribute("pathLength", "100");
      circle.style.strokeDasharray = "0 100";
      circle.style.strokeDashoffset = "0";
      svg.appendChild(circle);
      state.donutCircles[id] = circle;
    });
  }
  function updateDonut(byCat, total) {
    var cum = 0;
    state.catOrder.forEach(function (id) {
      var val = byCat[id] || 0;
      var pct = total > 0 ? (val / total * 100) : 0;
      var circle = state.donutCircles[id];
      circle.style.strokeDasharray = pct.toFixed(2) + " " + (100 - pct).toFixed(2);
      circle.style.strokeDashoffset = (-cum).toFixed(2);
      cum += pct;
    });
  }

  /* ---------------- category breakdown bars (persistent elements for smooth transitions) ---------------- */
  var breakdownRefs = {};
  function buildBreakdownRows() {
    var el = document.getElementById("resBreakdown");
    el.innerHTML = "";
    state.catOrder.forEach(function (id) {
      var c = state.catById[id];
      var row = document.createElement("div");
      row.className = "chan";
      row.innerHTML =
        '<span class="chan-dot" style="background:' + c.color + '"></span>' +
        '<div class="chan-body">' +
        '<div class="chan-top"><span class="chan-name">' + c.nombre + '</span>' +
        '<span class="chan-val"><b class="chan-amt">$0</b> · <span class="chan-pct">0%</span></span></div>' +
        '<div class="track"><div class="fill" style="background:' + c.color + '"></div></div>' +
        '</div>';
      el.appendChild(row);
      breakdownRefs[id] = {
        amt: row.querySelector(".chan-amt"),
        pct: row.querySelector(".chan-pct"),
        fill: row.querySelector(".fill")
      };
    });
  }
  function updateBreakdown(byCat, total) {
    state.catOrder.forEach(function (id) {
      var val = byCat[id] || 0;
      var pct = total > 0 ? (val / total * 100) : 0;
      var ref = breakdownRefs[id];
      ref.amt.textContent = "$" + fmtMoney(val);
      ref.pct.textContent = pct.toFixed(1) + "%";
      ref.fill.style.transform = "scaleX(" + (pct / 100).toFixed(4) + ")";
    });
  }

  /* ---------------- day-strip renderer (shared by live panel + range explorer) ---------------- */
  function computeDayTotals(days, matchFn) {
    return days.map(function (d) {
      var total = 0;
      var cats = {};
      state.data.movimientos.forEach(function (m) {
        if (!m.exacto || !m.fecha) return;
        if (matchFn && !matchFn(m)) return;
        var fd = parseDate(m.fecha);
        if (fd.getTime() === d.getTime()) {
          total += m.importe;
          cats[m.categoria] = true;
        }
      });
      return { date: d, total: total, cats: Object.keys(cats) };
    });
  }
  /* Smooth SVG area/line chart with hover tooltips. Replaces the old bar
     strip: bars stop being legible past ~10 columns (labels collide), a
     line reads cleanly at 7 or 45 points and moves the per-day amount into
     an on-demand tooltip instead of permanent overlapping text. */
  function renderAreaChart(el, dayTotals, opts) {
    opts = opts || {};
    var W = 600, H = opts.height || 168;
    var padTop = 16, padBottom = 4;
    var n = dayTotals.length;
    var baselineY = H - padBottom;
    var plotH = baselineY - padTop;
    var maxVal = Math.max.apply(null, dayTotals.map(function (dt) { return dt.total; }));
    var maxSafe = maxVal > 0 ? maxVal : 1;
    var stepX = n > 1 ? W / (n - 1) : 0;

    var peakIdx = -1, peakVal = -1;
    dayTotals.forEach(function (dt, i) { if (dt.total > peakVal) { peakVal = dt.total; peakIdx = i; } });

    var pts = dayTotals.map(function (dt, i) {
      var x = n > 1 ? i * stepX : W / 2;
      var y = baselineY - (dt.total / maxSafe) * plotH;
      return [x, y];
    });

    var linePath = "";
    pts.forEach(function (p, i) {
      if (i === 0) { linePath += "M" + p[0].toFixed(2) + "," + p[1].toFixed(2); return; }
      var prev = pts[i - 1];
      var cx1 = prev[0] + (p[0] - prev[0]) / 2.2, cy1 = prev[1];
      var cx2 = p[0] - (p[0] - prev[0]) / 2.2, cy2 = p[1];
      linePath += " C" + cx1.toFixed(2) + "," + cy1.toFixed(2) + " " + cx2.toFixed(2) + "," + cy2.toFixed(2) + " " + p[0].toFixed(2) + "," + p[1].toFixed(2);
    });
    var areaPath = linePath + " L" + pts[n - 1][0].toFixed(2) + "," + baselineY + " L" + pts[0][0].toFixed(2) + "," + baselineY + " Z";

    var usedCats = {};
    dayTotals.forEach(function (dt) { dt.cats.forEach(function (c) { usedCats[c] = true; }); });
    var catKeys = Object.keys(usedCats);
    var lineColor = catKeys.length === 1 ? state.catById[catKeys[0]].color : "var(--gold)";
    var gradId = "acgrad" + Math.random().toString(36).slice(2, 9);

    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="height:' + H + 'px">' +
      '<defs><linearGradient id="' + gradId + '" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="' + lineColor + '" stop-opacity="0.34"/>' +
      '<stop offset="100%" stop-color="' + lineColor + '" stop-opacity="0"/>' +
      '</linearGradient></defs>' +
      '<line class="ac-baseline" x1="0" y1="' + baselineY + '" x2="' + W + '" y2="' + baselineY + '" stroke="#333f52"/>' +
      '<path class="ac-area" d="' + areaPath + '" fill="url(#' + gradId + ')"/>' +
      '<path class="ac-line" d="' + linePath + '" stroke="' + lineColor + '" fill="none" vector-effect="non-scaling-stroke"/>';

    pts.forEach(function (p, i) {
      var dt = dayTotals[i];
      var isPeak = i === peakIdx && peakVal > 0;
      var dotColor = dt.cats.length === 1 ? state.catById[dt.cats[0]].color : lineColor;
      svg += '<circle class="ac-dot' + (isPeak ? ' peak' : '') + '" data-i="' + i + '" cx="' + p[0].toFixed(2) + '" cy="' + p[1].toFixed(2) + '" r="' + (isPeak ? 5 : 3.5) + '" fill="var(--panel)" stroke="' + (isPeak ? "var(--gold)" : dotColor) + '" stroke-width="2" vector-effect="non-scaling-stroke"/>';
    });
    var hitW = n > 1 ? stepX : W;
    pts.forEach(function (p, i) {
      svg += '<rect class="ac-hit" data-i="' + i + '" x="' + (p[0] - hitW / 2).toFixed(2) + '" y="0" width="' + hitW.toFixed(2) + '" height="' + H + '" fill="transparent"/>';
    });
    svg += "</svg>";

    el.innerHTML = '<div class="area-chart">' + svg + '<div class="ac-tooltip"></div></div><div class="ac-xlabels"></div>';

    var xlEl = el.querySelector(".ac-xlabels");
    var showEvery = n <= 10 ? 1 : n <= 20 ? 2 : 3;
    var lastIdx = n - 1;
    dayTotals.forEach(function (dt, i) {
      var show = i % showEvery === 0 || i === lastIdx || i === peakIdx;
      var span = document.createElement("span");
      span.className = "ac-xlabel" + (show ? "" : " hidden") + (i === peakIdx ? " peak" : "") + (opts.markLast && i === lastIdx ? " today" : "");
      span.innerHTML = "<b>" + dt.date.getDate() + "</b>" + dt.date.toLocaleDateString("es-MX", { month: "short" });
      xlEl.appendChild(span);
    });

    var tt = el.querySelector(".ac-tooltip");
    var chartBox = el.querySelector(".area-chart");
    var svgEl = el.querySelector("svg");
    function showTooltip(i) {
      var dt = dayTotals[i];
      var rect = svgEl.getBoundingClientRect();
      var boxRect = chartBox.getBoundingClientRect();
      var xRatio = rect.width / W, yRatio = rect.height / H;
      tt.style.left = ((rect.left - boxRect.left) + pts[i][0] * xRatio) + "px";
      tt.style.top = ((rect.top - boxRect.top) + pts[i][1] * yRatio) + "px";
      var catLabel = dt.cats.length === 1 ? state.catById[dt.cats[0]].nombre : (dt.cats.length > 1 ? "Varias categorías" : "Sin gasto registrado");
      tt.innerHTML = '<div class="tt-date">' + fmtDateFull(dt.date) + '</div><div class="tt-amt">$' + fmtMoney(dt.total) + '</div><div class="tt-date">' + catLabel + "</div>";
      tt.classList.add("show");
    }
    function hideTooltip() { tt.classList.remove("show"); }
    var hits = el.querySelectorAll(".ac-hit");
    for (var hi = 0; hi < hits.length; hi++) {
      (function (hit) {
        var i = parseInt(hit.getAttribute("data-i"), 10);
        hit.addEventListener("mouseenter", function () { showTooltip(i); });
        hit.addEventListener("mouseleave", hideTooltip);
        hit.addEventListener("click", function () { showTooltip(i); });
      })(hits[hi]);
    }

    el.classList.remove("fade-in");
    void el.offsetWidth;
    el.classList.add("fade-in");
  }

  /* ---------------- live panel ---------------- */
  function renderLive() {
    var maxDate = null;
    state.data.movimientos.forEach(function (m) {
      var e = movEnd(m);
      if (!maxDate || e > maxDate) maxDate = e;
    });
    var winStart = addDays(maxDate, -6);
    var winEnd = maxDate;
    document.getElementById("liveRange").textContent = fmtDateShort(winStart) + " – " + fmtDateFull(winEnd);

    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(winStart, i));
    var dayTotals = computeDayTotals(days, null);
    var anyData = dayTotals.some(function (dt) { return dt.total > 0; });

    var chartEl = document.getElementById("liveChart");
    var legendEl = document.getElementById("liveLegend");
    var totalWrap = document.getElementById("liveTotalWrap");
    totalWrap.hidden = false;

    var overlapping = state.data.movimientos.filter(function (m) {
      return !m.exacto && overlaps(movStart(m), movEnd(m), winStart, winEnd);
    });
    var exactSum = dayTotals.reduce(function (a, dt) { return a + dt.total; }, 0);
    var periodSum = overlapping.reduce(function (a, m) { return a + proratedAmount(m, winStart, winEnd); }, 0);
    document.getElementById("liveTotal").textContent = fmtMoney(exactSum + periodSum);

    if (!anyData) {
      legendEl.innerHTML = "";
      var chips = overlapping.map(function (m) {
        var cat = state.catById[m.categoria];
        var slice = proratedAmount(m, winStart, winEnd);
        var isPartial = slice < m.importe - 0.005;
        return '<span class="echip"><i style="background:' + cat.color + '"></i>' + cat.nombre + ' <b>$' + fmtMoney(slice) + '</b>' +
          (isPartial ? '<small> · parte de $' + fmtMoney(m.importe) + ' del periodo completo (' + m.fuente + ')</small>' : '') +
          '</span>';
      }).join("");
      chartEl.innerHTML = chips ? '<div class="live-chips">' + chips + '</div>' : "";
      return;
    }

    var usedCats = {};
    dayTotals.forEach(function (dt) { dt.cats.forEach(function (c) { usedCats[c] = true; }); });
    legendEl.innerHTML = Object.keys(usedCats).map(function (id) {
      var c = state.catById[id];
      return '<span><i style="background:' + c.color + '"></i>' + c.nombre + '</span>';
    }).join("");

    renderAreaChart(chartEl, dayTotals, { markLast: true, height: 168 });
  }

  /* ---------------- active-campaign spotlight ---------------- */
  function renderSpotlight() {
    var byCampaign = {};
    var order = [];
    state.data.movimientos.forEach(function (m) {
      if (!m.campana) return;
      if (!byCampaign[m.campana]) {
        byCampaign[m.campana] = { nombre: m.campana, leads: 0, importe: 0, estado: m.estadoCampana, fuente: m.fuente };
        order.push(m.campana);
      }
      byCampaign[m.campana].leads += (m.leads || 0);
      byCampaign[m.campana].importe += m.importe;
    });
    var list = order.map(function (k) { return byCampaign[k]; });
    var activos = list.filter(function (c) { return c.estado === "activa"; })
      .sort(function (a, b) { return b.leads - a.leads; });
    if (activos.length === 0) return;
    var top = activos[0];
    var others = list.filter(function (c) { return c.nombre !== top.nombre; })
      .sort(function (a, b) { return b.leads - a.leads; });

    document.getElementById("spotlightSection").hidden = false;
    document.getElementById("spotName").textContent = top.nombre;
    document.getElementById("spotLeads").textContent = top.leads;
    var cpl = top.leads > 0 ? top.importe / top.leads : 0;
    document.getElementById("spotCpl").textContent = "$" + fmtMoney(cpl);
    document.getElementById("spotSpend").textContent = "$" + fmtMoney(top.importe);

    var note = "Campaña con más leads registrados actualmente, del periodo " + top.fuente + ".";
    if (others.length > 0) {
      var cmp = others.map(function (o) {
        return '"' + o.nombre + '"' + (o.estado === "inactiva" ? " (inactiva)" : "") + ": " + o.leads + (o.leads === 1 ? " lead" : " leads");
      }).join(" · ");
      note += " Comparado con " + cmp + " en el mismo periodo.";
    }
    document.getElementById("spotNote").textContent = note;
  }

  /* ---------------- filter chips ---------------- */
  function renderChips() {
    var el = document.getElementById("chipCats");
    var chips = [{ id: "all", nombre: "Ver todo" }].concat(state.data.categorias);
    el.innerHTML = "";
    chips.forEach(function (c) {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "chip-cat" + (state.activeCat === c.id ? " active" : "");
      btn.textContent = c.nombre;
      btn.addEventListener("click", function () {
        state.activeCat = c.id;
        state._userInteracted = true;
        renderChips();
        renderResults();
      });
      el.appendChild(btn);
    });
  }

  function updateDetailLabel(open) {
    var count = state._lastFilteredCount || 0;
    document.getElementById("detailToggleLabel").textContent =
      (open ? "Ocultar" : "Ver") + " movimientos individuales (" + count + ")";
  }

  /* ---------------- explorer results ---------------- */
  function renderResults() {
    var desde = state.desde, hasta = state.hasta;
    if (!desde || !hasta) return;

    if (state._userInteracted) {
      var grid = document.querySelector(".result-grid");
      grid.classList.remove("pulse-update");
      void grid.offsetWidth;
      grid.classList.add("pulse-update");
    }

    var filtered = state.data.movimientos.filter(function (m) {
      if (state.activeCat !== "all" && m.categoria !== state.activeCat) return false;
      return overlaps(movStart(m), movEnd(m), desde, hasta);
    });
    state._lastFilteredCount = filtered.length;

    var gapEl = document.getElementById("gapBanner");
    var gaps = (state.data.huecos || []).filter(function (h) {
      return overlaps(parseDate(h.fechaInicio), parseDate(h.fechaFin), desde, hasta);
    });
    gapEl.innerHTML = gaps.map(function (g) {
      return '<div class="gap-banner">' + warnIcon() +
        '<span>Del <b>' + fmtDateFull(parseDate(g.fechaInicio)) + '</b> al <b>' + fmtDateFull(parseDate(g.fechaFin)) + '</b>: ' + g.nota + '</span></div>';
    }).join("");

    var total = filtered.reduce(function (a, m) { return a + proratedAmount(m, desde, hasta); }, 0);
    document.getElementById("resTotal").textContent = fmtMoney(total);

    var byCat = {};
    filtered.forEach(function (m) { byCat[m.categoria] = (byCat[m.categoria] || 0) + proratedAmount(m, desde, hasta); });
    updateDonut(byCat, total);
    updateBreakdown(byCat, total);

    /* day-by-day strip for the selected range, only when the range is a sane size */
    var stripWrap = document.getElementById("rangeStripWrap");
    var span = daysBetween(desde, hasta) + 1;
    if (span > 0 && span <= MAX_RANGE_STRIP_DAYS) {
      var days = [];
      for (var i = 0; i < span; i++) days.push(addDays(desde, i));
      var matchFn = state.activeCat === "all" ? null : function (m) { return m.categoria === state.activeCat; };
      var dayTotals = computeDayTotals(days, matchFn);
      var anyExact = dayTotals.some(function (dt) { return dt.total > 0; });
      if (anyExact) {
        stripWrap.hidden = false;
        renderAreaChart(document.getElementById("rangeStrip"), dayTotals, { height: 150 });
      } else {
        stripWrap.hidden = true;
      }
    } else {
      stripWrap.hidden = true;
    }

    /* period-aggregate note */
    var approxCount = filtered.filter(function (m) { return !m.exacto; }).length;
    var noteEl = document.getElementById("periodNote");
    if (approxCount > 0) {
      noteEl.hidden = false;
      noteEl.textContent = approxCount === 1
        ? "1 de los movimientos de este rango es un total estimado de periodo (sin desglose diario en el reporte original), no un monto de un día exacto."
        : approxCount + " de los movimientos de este rango son totales estimados de periodo (sin desglose diario en el reporte original), no montos de un día exacto.";
    } else {
      noteEl.hidden = true;
    }

    var movsInner = document.getElementById("resMovsInner");
    if (filtered.length === 0) {
      movsInner.innerHTML = '<div class="empty-state">No hay movimientos registrados en este rango y categoría.</div>';
    } else {
      var sorted = filtered.slice().sort(function (a, b) { return movStart(a) - movStart(b); });
      movsInner.innerHTML = sorted.map(function (m) {
        var c = state.catById[m.categoria];
        var dateLabel = m.fecha
          ? fmtDateFull(parseDate(m.fecha))
          : fmtDateShort(parseDate(m.fechaInicio)) + " – " + fmtDateFull(parseDate(m.fechaFin)) + " (periodo)";
        var slice = proratedAmount(m, desde, hasta);
        var isPartial = !m.exacto && slice < m.importe - 0.005;
        var badge = m.exacto
          ? '<span class="badge exact">Exacto</span>'
          : isPartial
            ? '<span class="badge approx">Prorrateado</span>'
            : '<span class="badge approx">Estimado del periodo</span>';
        var proratedNote = isPartial
          ? '<div class="mov-note"><b>$' + fmtMoney(slice) + '</b> es la parte proporcional de este rango de fechas, sobre un total de <b>$' + fmtMoney(m.importe) + '</b> reportado para todo el periodo ' + dateLabel.split(" – ")[0] + ' – ' + fmtDateFull(parseDate(m.fechaFin)) + ' (' + (daysBetween(parseDate(m.fechaInicio), parseDate(m.fechaFin)) + 1) + ' días). No es un monto exacto del día, es un estimado proporcional.</div>'
          : "";
        var catLabel = m.campana ? c.nombre + ' · ' + m.campana : c.nombre;
        var leadsTag = (m.campana && m.leads) ? ' <span class="badge exact" style="background:var(--gold-soft);color:var(--gold-text);">' + m.leads + (m.leads === 1 ? ' lead' : ' leads') + '</span>' : '';
        return '<div class="mov">' +
          '<span class="mov-dot" style="background:' + c.color + '"></span>' +
          '<div class="mov-main">' +
          '<div class="mov-top"><span class="mov-cat">' + catLabel + badge + leadsTag + '</span>' +
          '<span class="mov-amt">$' + fmtMoney(slice) + ' MXN</span></div>' +
          '<div class="mov-date">' + dateLabel + ' · ' + m.fuente + '</div>' +
          proratedNote +
          (m.nota ? '<div class="mov-note">' + m.nota + '</div>' : '') +
          '</div></div>';
      }).join("");
    }

    var detailBtn = document.getElementById("detailToggle");
    var isOpen = document.getElementById("resMovs").classList.contains("open");
    updateDetailLabel(isOpen);
  }

  /* ---------------- historical totals (collapsed) ---------------- */
  function renderHistorical() {
    var byFuente = {};
    var order = [];
    var total = 0;
    state.data.movimientos.forEach(function (m) {
      total += m.importe;
      if (!byFuente[m.fuente]) { byFuente[m.fuente] = 0; order.push(m.fuente); }
      byFuente[m.fuente] += m.importe;
    });
    var rowsEl = document.getElementById("histRows");
    rowsEl.innerHTML = "";
    order.forEach(function (fuente) {
      var row = document.createElement("div");
      row.className = "hist-row";
      row.innerHTML = '<span>' + fuente + '</span><span class="hr-v">$' + fmtMoney(byFuente[fuente]) + '</span>';
      rowsEl.appendChild(row);
    });
    var totalRow = document.createElement("div");
    totalRow.className = "hist-row total";
    totalRow.innerHTML = '<span>Total invertido</span><span class="hr-v">$' + fmtMoney(total) + '</span>';
    rowsEl.appendChild(totalRow);
  }
})();
