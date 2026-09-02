(function () {
  "use strict";

  var state = {
    data: null,
    catById: {},
    activeCat: "all",
    desde: null,
    hasta: null
  };

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
  function movStart(m) {
    return parseDate(m.fecha || m.fechaInicio);
  }
  function movEnd(m) {
    return parseDate(m.fecha || m.fechaFin);
  }
  function overlaps(mStart, mEnd, rangeStart, rangeEnd) {
    return mStart <= rangeEnd && mEnd >= rangeStart;
  }

  function warnIcon() {
    return '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C0632B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></svg>';
  }

  fetch("data/gastos.json")
    .then(function (r) { return r.json(); })
    .then(function (data) {
      state.data = data;
      data.categorias.forEach(function (c) { state.catById[c.id] = c; });
      init();
    })
    .catch(function (err) {
      document.getElementById("heroCaption").textContent = "No se pudieron cargar los datos (data/gastos.json). Si abriste el archivo directo desde tu computadora, prueba servirlo con un servidor local o públicalo en GitHub Pages.";
      console.error(err);
    });

  function init() {
    renderHero();
    renderLast7();
    renderChips();
    var allStart = null, allEnd = null;
    state.data.movimientos.forEach(function (m) {
      var s = movStart(m), e = movEnd(m);
      if (!allStart || s < allStart) allStart = s;
      if (!allEnd || e > allEnd) allEnd = e;
    });
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

  function renderHero() {
    var byFuente = {};
    var order = [];
    var total = 0;
    state.data.movimientos.forEach(function (m) {
      total += m.importe;
      if (!byFuente[m.fuente]) {
        byFuente[m.fuente] = 0;
        order.push(m.fuente);
      }
      byFuente[m.fuente] += m.importe;
    });
    document.getElementById("heroTotal").textContent = fmtMoney(total);
    document.getElementById("heroCaption").textContent =
      "Suma de todo el gasto registrado en los reportes disponibles, de " +
      order.length + " periodo" + (order.length === 1 ? "" : "s") + ".";

    var rowsEl = document.getElementById("heroRows");
    rowsEl.innerHTML = "";
    order.forEach(function (fuente) {
      var row = document.createElement("div");
      row.className = "hero-row";
      row.innerHTML =
        '<span class="hr-k"><span class="hr-dot" style="background:#8FA6C6"></span>' + fuente + '</span>' +
        '<span class="hr-v">$' + fmtMoney(byFuente[fuente]) + '</span>';
      rowsEl.appendChild(row);
    });
    var totalRow = document.createElement("div");
    totalRow.className = "hero-row total";
    totalRow.innerHTML =
      '<span class="hr-k" style="color:#fff;font-weight:600"><span class="hr-dot" style="background:var(--gold)"></span>Total invertido</span>' +
      '<span class="hr-v" style="font-size:18px">$' + fmtMoney(total) + '</span>';
    rowsEl.appendChild(totalRow);
  }

  function renderLast7() {
    var maxDate = null;
    state.data.movimientos.forEach(function (m) {
      var e = movEnd(m);
      if (!maxDate || e > maxDate) maxDate = e;
    });
    var winStart = addDays(maxDate, -6);
    var winEnd = maxDate;
    document.getElementById("last7Range").textContent =
      fmtDateShort(winStart) + " – " + fmtDateFull(winEnd);

    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(winStart, i));

    var dayTotals = days.map(function (d) {
      var total = 0;
      var cats = {};
      state.data.movimientos.forEach(function (m) {
        if (m.exacto && m.fecha) {
          var fd = parseDate(m.fecha);
          if (fd.getTime() === d.getTime()) {
            total += m.importe;
            cats[m.categoria] = true;
          }
        }
      });
      return { date: d, total: total, cats: Object.keys(cats) };
    });

    var anyData = dayTotals.some(function (dt) { return dt.total > 0; });
    var chartEl = document.getElementById("last7Chart");
    var legendEl = document.getElementById("last7Legend");
    var noteEl = document.getElementById("last7Note");

    if (!anyData) {
      legendEl.innerHTML = "";
      var overlapping = state.data.movimientos.filter(function (m) {
        return !m.exacto && overlaps(movStart(m), movEnd(m), winStart, winEnd);
      });
      var chips = overlapping.map(function (m) {
        var cat = state.catById[m.categoria];
        return '<span class="chan"><span class="chan-dot" style="background:' + cat.color + '"></span>' +
          '<span class="chan-body"><span class="chan-top"><span class="chan-name">' + cat.nombre + '</span>' +
          '<span class="chan-val"><b>$' + fmtMoney(m.importe) + '</b></span></span></span></span>';
      }).join("");
      chartEl.innerHTML =
        '<div class="tl7-empty">Todavía no hay gasto desglosado día por día para el ' + fmtDateShort(winStart) + ' – ' + fmtDateFull(winEnd) + '. ' +
        'Estos días están incluidos dentro de los totales por periodo que se muestran abajo — en cuanto se agregue el detalle diario de esas fechas, este panorama se actualiza solo.</div>' +
        (chips ? '<div class="chan-list" style="margin-top:6px;">' + chips + '</div>' : "");
      noteEl.textContent = "Usa el filtro de abajo para ver el desglose completo de cualquier rango de fechas.";
      return;
    }

    var maxDay = Math.max.apply(null, dayTotals.map(function (dt) { return dt.total; }));
    var usedCats = {};
    dayTotals.forEach(function (dt) { dt.cats.forEach(function (c) { usedCats[c] = true; }); });
    legendEl.innerHTML = Object.keys(usedCats).map(function (id) {
      var c = state.catById[id];
      return '<span><i style="background:' + c.color + '"></i>' + c.nombre + '</span>';
    }).join("");

    var html = '<div class="tl7">';
    dayTotals.forEach(function (dt) {
      var color = dt.cats.length === 1 ? state.catById[dt.cats[0]].color : "var(--ink)";
      var h = dt.total > 0 ? Math.max(6, Math.round((dt.total / maxDay) * 100)) : 2;
      html += '<div class="tl7-col">' +
        (dt.total > 0 ? '<span class="tl7-amt">$' + fmtMoney(dt.total) + '</span>' : '') +
        '<div class="tl7-bar" style="height:' + h + '%;background:' + (dt.total > 0 ? color : "#EFEAE0") + '"></div>' +
        '<span class="tl7-x"><b>' + dt.date.getDate() + '</b>' + dt.date.toLocaleDateString("es-MX", { month: "short" }) + '</span>' +
        '</div>';
    });
    html += "</div>";
    chartEl.innerHTML = html;
    var sum = dayTotals.reduce(function (a, dt) { return a + dt.total; }, 0);
    noteEl.textContent = "Gasto con fecha exacta en estos 7 días: $" + fmtMoney(sum) + " MXN. Usa el filtro de abajo para ver el desglose completo de cualquier rango de fechas.";
  }

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

  function renderResults() {
    var desde = state.desde, hasta = state.hasta;
    if (!desde || !hasta) return;

    var filtered = state.data.movimientos.filter(function (m) {
      if (state.activeCat !== "all" && m.categoria !== state.activeCat) return false;
      return overlaps(movStart(m), movEnd(m), desde, hasta);
    });

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
    filtered.forEach(function (m) {
      byCat[m.categoria] = (byCat[m.categoria] || 0) + m.importe;
    });
    var breakdownEl = document.getElementById("resBreakdown");
    var catIds = Object.keys(byCat).sort(function (a, b) { return byCat[b] - byCat[a]; });
    if (catIds.length === 0) {
      breakdownEl.innerHTML = "";
    } else {
      breakdownEl.innerHTML = catIds.map(function (id) {
        var c = state.catById[id];
        var pct = total > 0 ? (byCat[id] / total * 100) : 0;
        return '<div class="chan">' +
          '<span class="chan-dot" style="background:' + c.color + '"></span>' +
          '<div class="chan-body">' +
          '<div class="chan-top"><span class="chan-name">' + c.nombre + '</span>' +
          '<span class="chan-val"><b>$' + fmtMoney(byCat[id]) + '</b> · ' + pct.toFixed(1) + '%</span></div>' +
          '<div class="track"><div class="fill" style="width:' + pct.toFixed(1) + '%;background:' + c.color + '"></div></div>' +
          '</div></div>';
      }).join("");
    }

    var movsEl = document.getElementById("resMovs");
    if (filtered.length === 0) {
      movsEl.innerHTML = '<div class="empty-state">No hay movimientos registrados en este rango y categoría.</div>';
      return;
    }
    var sorted = filtered.slice().sort(function (a, b) { return movStart(a) - movStart(b); });
    movsEl.innerHTML = sorted.map(function (m) {
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
})();
