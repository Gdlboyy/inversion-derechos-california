(function () {
  "use strict";

  var state = {
    data: null,
    catById: {},
    catOrder: [],
    activeCat: "all",
    desde: null,
    hasta: null,
    donutCircles: {}
  };

  var MAX_RANGE_STRIP_DAYS = 45;

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
    renderChips();
    renderLive();
    renderHistorical();

    var allStart = null, allEnd = null;
    state.data.movimientos.forEach(function (m) {
      var s = movStart(m), e = movEnd(m);
      if (!allStart || s < allStart) allStart = s;
      if (!allEnd || e > allEnd) allEnd = e;
    });
    state.rangeMin = allStart;
    state.rangeMax = allEnd;
    state.desde = allStart;
    state.hasta = allEnd;
    document.getElementById("fDesde").value = toISO(allStart);
    document.getElementById("fHasta").value = toISO(allEnd);
    document.getElementById("fDesde").addEventListener("change", onDateChange);
    document.getElementById("fHasta").addEventListener("change", onDateChange);
    document.getElementById("resetBtn").addEventListener("click", function () {
      state.desde = allStart;
      state.hasta = allEnd;
      state.activeCat = "all";
      document.getElementById("fDesde").value = toISO(allStart);
      document.getElementById("fHasta").value = toISO(allEnd);
      renderChips();
      renderResults();
    });

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
  function renderStrip(el, dayTotals, opts) {
    opts = opts || {};
    var maxDay = Math.max.apply(null, dayTotals.map(function (dt) { return dt.total; }));
    var lastIso = opts.markLast ? toISO(dayTotals[dayTotals.length - 1].date) : null;
    var html = '<div class="strip">';
    dayTotals.forEach(function (dt) {
      var isPeak = maxDay > 0 && dt.total === maxDay;
      var color = dt.cats.length === 1 ? state.catById[dt.cats[0]].color : "var(--gold)";
      var scale = dt.total > 0 ? Math.max(0.06, dt.total / maxDay) : 0.03;
      var isLast = lastIso !== null && toISO(dt.date) === lastIso;
      html += '<div class="strip-col">' +
        (dt.total > 0 ? '<span class="strip-amt' + (isPeak ? ' peak' : '') + '">$' + fmtMoney(dt.total) + '</span>' : '<span class="strip-amt">&nbsp;</span>') +
        '<div class="strip-bar' + (isPeak ? ' peak' : '') + '" style="transform:scaleY(' + scale.toFixed(3) + ');background:' + (dt.total > 0 ? color : "var(--line)") + '"></div>' +
        '<span class="strip-x' + (isLast ? ' today' : '') + '"><b>' + dt.date.getDate() + '</b>' + dt.date.toLocaleDateString("es-MX", { month: "short" }) + '</span>' +
        '</div>';
    });
    html += "</div>";
    el.innerHTML = html;
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

    if (!anyData) {
      totalWrap.hidden = true;
      legendEl.innerHTML = "";
      var overlapping = state.data.movimientos.filter(function (m) {
        return !m.exacto && overlaps(movStart(m), movEnd(m), winStart, winEnd);
      });
      var chips = overlapping.map(function (m) {
        var cat = state.catById[m.categoria];
        return '<span class="echip"><i style="background:' + cat.color + '"></i>' + cat.nombre + ' <b>$' + fmtMoney(m.importe) + '</b></span>';
      }).join("");
      chartEl.innerHTML =
        '<div class="live-empty">Todavía no hay gasto desglosado día por día para el ' + fmtDateShort(winStart) + ' – ' + fmtDateFull(winEnd) + '. ' +
        'Estos días están dentro de los totales de periodo reportados abajo — en cuanto se agregue el detalle diario de esas fechas, este panel se actualiza solo, sin tocar el código.' +
        (chips ? '<div class="chips">' + chips + '</div>' : "") + '</div>';
      return;
    }

    totalWrap.hidden = false;
    var sum = dayTotals.reduce(function (a, dt) { return a + dt.total; }, 0);
    document.getElementById("liveTotal").textContent = fmtMoney(sum);

    var usedCats = {};
    dayTotals.forEach(function (dt) { dt.cats.forEach(function (c) { usedCats[c] = true; }); });
    legendEl.innerHTML = Object.keys(usedCats).map(function (id) {
      var c = state.catById[id];
      return '<span><i style="background:' + c.color + '"></i>' + c.nombre + '</span>';
    }).join("");

    renderStrip(chartEl, dayTotals, { markLast: true });
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

    var total = filtered.reduce(function (a, m) { return a + m.importe; }, 0);
    document.getElementById("resTotal").textContent = fmtMoney(total);

    var byCat = {};
    filtered.forEach(function (m) { byCat[m.categoria] = (byCat[m.categoria] || 0) + m.importe; });
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
        renderStrip(document.getElementById("rangeStrip"), dayTotals, {});
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
        var badge = m.exacto
          ? '<span class="badge exact">Exacto</span>'
          : '<span class="badge approx">Estimado del periodo</span>';
        return '<div class="mov">' +
          '<span class="mov-dot" style="background:' + c.color + '"></span>' +
          '<div class="mov-main">' +
          '<div class="mov-top"><span class="mov-cat">' + c.nombre + badge + '</span>' +
          '<span class="mov-amt">$' + fmtMoney(m.importe) + ' MXN</span></div>' +
          '<div class="mov-date">' + dateLabel + ' · ' + m.fuente + '</div>' +
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
