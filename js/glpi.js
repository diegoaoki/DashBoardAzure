/**
 * Aba "Suporte GLPI" — relatório de tickets do GLPI (utilsdashboards).
 * Busca via /api/glpi (proxy serverless que evita CORS).
 * Carrega na abertura da página; filtros no topo recalculam todo o relatório.
 */
window.DASH_GLPI = (function () {
  const STATUS_NAMES = {
    1: "Novo", 2: "Em atend. (atribuído)", 3: "Em atend. (planejado)",
    4: "Pendente", 5: "Solucionado", 6: "Fechado",
  };
  const REQUEST_TYPES = {
    1: "Helpdesk", 2: "E-mail", 3: "Telefone", 4: "Outro",
    5: "Escrito", 6: "Direto", 7: "Formulário",
  };
  const COLORS = [
    "#4cc9f0", "#f72585", "#06d6a0", "#ffd166", "#ef476f", "#a06cd5",
    "#ff9e00", "#90e0ef", "#b5179e", "#80ed99", "#fdc500", "#48bfe3",
  ];

  const $ = (id) => document.getElementById(id);
  let loaded = false;
  let charts = {};
  let allTickets = [];
  let lastDupes = 0;

  const parseDate = (s) => {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]) : null;
  };
  const diffHours = (a, b) => (!a || !b ? null : (b - a) / 3600000 < 0 ? null : (b - a) / 3600000);
  const fmtDur = (h) => {
    if (h == null || isNaN(h)) return "—";
    if (h < 1) return Math.round(h * 60) + " min";
    if (h < 24) return h.toFixed(1) + "h";
    return (h / 24).toFixed(1) + "d";
  };
  const isOpen = (st) => ![5, 6].includes(Number(st));
  const esc = (s) =>
    String(s).replace(/[&<>"']/g, (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
    );
  const fmtDateShort = (d) =>
    !d ? "—" : d.toLocaleDateString("pt-BR") + " " +
      d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  /* ---------- analista (técnico) via dataset CLD_TECNICOS ----------
   * O endpoint de tickets só tem IDs. O nome do analista vem do
   * dataset de técnicos, cruzado por ticket_id = ID. Um ticket pode
   * ter mais de um técnico (grupo) → guardamos lista.
   */
  let tecMap = {}; // ticket_id -> [{ id, nome }]
  function buildTecMap(rows) {
    tecMap = {};
    (rows || []).forEach((r) => {
      const tid = r.ticket_id;
      if (tid == null) return;
      const id = r.tecnico_id != null ? String(r.tecnico_id) : "";
      const nome = r.tecnico || r.login || (id ? "Téc. " + id : "—");
      (tecMap[tid] = tecMap[tid] || []).push({ id, nome });
    });
  }
  const tecsOf = (ticketId) => tecMap[ticketId] || [];
  const analistaNomes = (ticketId) => {
    const ts = tecsOf(ticketId);
    if (!ts.length) return "—";
    return [...new Set(ts.map((x) => x.nome))].join(", ");
  };
  const recipName = (id) => (id != null && id !== "" ? String(id) : "—");

  function badge(text, kind) {
    const b = $("glpiBadge");
    b.textContent = text;
    b.className = "status-badge" + (kind ? " " + kind : "");
  }
  function destroyCharts() {
    Object.values(charts).forEach((c) => c && c.destroy());
    charts = {};
  }

  /* ---------- filtros globais ---------- */
  function readFilters() {
    return {
      st: $("glpiFltStatus").value,
      og: $("glpiFltOrigem").value,
      rq: $("glpiFltReq").value,
      an: $("glpiFltAnalista").value,
      days: parseInt($("glpiFltPeriodo").value, 10) || 0,
    };
  }
  function baseFiltered() {
    const f = readFilters();
    const minTime = f.days ? Date.now() - f.days * 86400000 : 0;
    return allTickets.filter((t) => {
      if (f.st && String(t.STATUS) !== f.st) return false;
      if (f.og && String(t.REQUESTTYPES_ID) !== f.og) return false;
      if (f.rq && String(t.USERS_ID_RECIPIENT) !== f.rq) return false;
      if (f.an && !tecsOf(t.ID).some((x) => x.id === f.an)) return false;
      if (minTime) {
        const d = parseDate(t.DATE);
        if (!d || d.getTime() < minTime) return false;
      }
      return true;
    });
  }
  function fillFilterOptions() {
    const og = $("glpiFltOrigem");
    const ogPrev = og.value;
    const tipos = [...new Set(allTickets.map((t) => String(t.REQUESTTYPES_ID)).filter(Boolean))]
      .sort((a, b) => a - b);
    og.innerHTML =
      '<option value="">Todas</option>' +
      tipos
        .map((id) => `<option value="${esc(id)}">${esc(REQUEST_TYPES[id] || "Tipo " + id)}</option>`)
        .join("");
    if (tipos.includes(ogPrev)) og.value = ogPrev;

    const rq = $("glpiFltReq");
    const rqPrev = rq.value;
    const reqs = [...new Set(allTickets.map((t) => String(t.USERS_ID_RECIPIENT)).filter((v) => v && v !== "0"))]
      .sort((a, b) => Number(a) - Number(b));
    rq.innerHTML =
      '<option value="">Todos</option>' +
      reqs.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`).join("");
    if (reqs.includes(rqPrev)) rq.value = rqPrev;

    // Analista = técnico (dataset CLD_TECNICOS), distinto por tecnico_id
    const an = $("glpiFltAnalista");
    const anPrev = an.value;
    const byId = {};
    Object.values(tecMap).forEach((arr) =>
      arr.forEach((x) => { if (x.id) byId[x.id] = x.nome; })
    );
    const ans = Object.entries(byId).sort((a, b) =>
      String(a[1]).localeCompare(String(b[1]), "pt-BR")
    );
    an.innerHTML =
      '<option value="">Todos</option>' +
      ans.map(([id, nome]) => `<option value="${esc(id)}">${esc(nome)}</option>`).join("");
    if (ans.some(([id]) => id === anPrev)) an.value = anPrev;
  }

  /* ---------- charts/render ---------- */
  function doughnut(canvasId, obj) {
    const labels = Object.keys(obj);
    return new Chart($(canvasId), {
      type: "doughnut",
      data: {
        labels,
        datasets: [{
          data: Object.values(obj),
          backgroundColor: labels.map((_, i) => COLORS[i % COLORS.length]),
          borderWidth: 2,
          borderColor: "#151d36",
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: "60%",
        plugins: { legend: { position: "right", labels: { boxWidth: 10, font: { size: 11 } } } },
      },
    });
  }

  function kpi(label, value, sub) {
    return `<div class="kpi"><div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}</div>
      <div class="kpi-delta">${sub || ""}</div></div>`;
  }

  function renderAll(tickets, dupes) {
    destroyCharts();
    const total = tickets.length;
    const closed = tickets.filter((t) => !isOpen(t.STATUS)).length;
    const open = total - closed;

    const ttas = [], ttrs = [];
    tickets.forEach((t) => {
      const o = parseDate(t.DATE);
      const tta = diffHours(o, parseDate(t.TAKEINTOACCOUNTDATE));
      const ttr = diffHours(o, parseDate(t.SOLVEDATE));
      if (tta !== null) ttas.push(tta);
      if (ttr !== null) ttrs.push(ttr);
    });
    const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
    const dts = tickets.map((t) => parseDate(t.DATE)).filter(Boolean).sort((a, b) => a - b);
    const range = dts.length
      ? dts[0].toLocaleDateString("pt-BR") + " → " + dts[dts.length - 1].toLocaleDateString("pt-BR")
      : "";

    $("glpiKpi").innerHTML = [
      kpi("Total de tickets", total.toLocaleString("pt-BR"), range),
      kpi("Fechados / Solucionados", closed.toLocaleString("pt-BR"), total ? ((closed / total) * 100).toFixed(1) + "%" : ""),
      kpi("Em aberto", open.toLocaleString("pt-BR"), total ? ((open / total) * 100).toFixed(1) + "%" : ""),
      kpi("1º atendimento médio", fmtDur(avg(ttas)), "abertura → 1º toque"),
      kpi("Tempo médio resolução", fmtDur(avg(ttrs)), "abertura → solução"),
      kpi("Duplicatas removidas", dupes.toLocaleString("pt-BR"), "no carregamento"),
    ].join("");

    const byStatus = {};
    tickets.forEach((t) => {
      const l = STATUS_NAMES[t.STATUS] || "Status " + t.STATUS;
      byStatus[l] = (byStatus[l] || 0) + 1;
    });
    charts.status = doughnut("glpiChStatus", byStatus);

    const byType = {};
    tickets.forEach((t) => {
      const l = REQUEST_TYPES[t.REQUESTTYPES_ID] || "Tipo " + t.REQUESTTYPES_ID;
      byType[l] = (byType[l] || 0) + 1;
    });
    charts.type = doughnut("glpiChType", byType);

    const buckets = { "< 1h": 0, "1-4h": 0, "4-24h": 0, "1-3d": 0, "3-7d": 0, "> 7d": 0 };
    ttrs.forEach((h) => {
      if (h < 1) buckets["< 1h"]++;
      else if (h < 4) buckets["1-4h"]++;
      else if (h < 24) buckets["4-24h"]++;
      else if (h < 72) buckets["1-3d"]++;
      else if (h < 168) buckets["3-7d"]++;
      else buckets["> 7d"]++;
    });
    charts.ttr = new Chart($("glpiChTtr"), {
      type: "bar",
      data: { labels: Object.keys(buckets), datasets: [{ data: Object.values(buckets), backgroundColor: COLORS, borderRadius: 4 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });

    const byDay = {};
    tickets.forEach((t) => {
      const d = parseDate(t.DATE);
      if (!d) return;
      const k = d.toISOString().slice(0, 10);
      byDay[k] = (byDay[k] || 0) + 1;
    });
    const days = Object.keys(byDay).sort();
    charts.timeline = new Chart($("glpiChTimeline"), {
      type: "line",
      data: {
        labels: days,
        datasets: [{
          label: "Aberturas", data: days.map((d) => byDay[d]),
          borderColor: "#4cc9f0", backgroundColor: "rgba(76,201,240,0.15)",
          tension: 0.25, fill: true, pointRadius: 2,
        }],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 20 } }, y: { beginAtZero: true } },
      },
    });

    const recip = {};
    tickets.forEach((t) => {
      const id = t.USERS_ID_RECIPIENT;
      if (!id) return;
      (recip[id] = recip[id] || { total: 0, closed: 0 }).total++;
      if (!isOpen(t.STATUS)) recip[id].closed++;
    });
    $("glpiRecip").innerHTML = Object.entries(recip)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 15)
      .map(([id, v]) => `<tr><td>${esc(recipName(id))}</td><td class="num">${v.total}</td><td class="num">${v.closed}</td><td class="num">${v.total - v.closed}</td></tr>`)
      .join("") || `<tr><td colspan="4" style="text-align:center;color:var(--text-dim);padding:20px">—</td></tr>`;

    // Top analistas (técnicos): cada técnico do ticket conta 1
    const ana = {};
    tickets.forEach((t) => {
      const seen = new Set();
      tecsOf(t.ID).forEach((x) => {
        if (seen.has(x.nome)) return;
        seen.add(x.nome);
        ana[x.nome] = (ana[x.nome] || 0) + 1;
      });
    });
    $("glpiUpd").innerHTML = Object.entries(ana)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([nome, v]) => `<tr><td>${esc(nome)}</td><td class="num">${v}</td></tr>`)
      .join("") || `<tr><td colspan="2" style="text-align:center;color:var(--text-dim);padding:20px">—</td></tr>`;

    renderTable(tickets);
  }

  function renderTable(base) {
    const q = $("glpiSearch").value.trim().toLowerCase();
    const sort = $("glpiSort").value;

    let rows = base
      .filter((t) => {
        if (!q) return true;
        return [
          t.ID, t.NAME,
          t.USERS_ID_RECIPIENT,
          analistaNomes(t.ID),
        ]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .map((t) => {
        const o = parseDate(t.DATE);
        return {
          ...t,
          _o: o,
          _f: parseDate(t.TAKEINTOACCOUNTDATE),
          _s: parseDate(t.SOLVEDATE),
          _c: parseDate(t.CLOSEDATE),
          _tta: diffHours(o, parseDate(t.TAKEINTOACCOUNTDATE)),
          _ttr: diffHours(o, parseDate(t.SOLVEDATE)),
        };
      });

    rows.sort((a, b) => {
      if (sort === "date_desc") return (b._o || 0) - (a._o || 0);
      if (sort === "date_asc") return (a._o || 0) - (b._o || 0);
      if (sort === "ttr_desc") return (b._ttr || -1) - (a._ttr || -1);
      if (sort === "ttr_asc") return (a._ttr == null ? Infinity : a._ttr) - (b._ttr == null ? Infinity : b._ttr);
      return 0;
    });

    $("glpiCount").textContent = "· " + rows.length + " de " + allTickets.length;
    const max = 500;
    let html = rows.slice(0, max).map((t) => `<tr>
        <td class="num">${esc(t.ID)}</td>
        <td>${esc(t.NAME || "")}</td>
        <td><span class="pill">${STATUS_NAMES[t.STATUS] || esc(t.STATUS)}</span></td>
        <td>${fmtDateShort(t._o)}</td>
        <td>${fmtDateShort(t._f)}</td>
        <td>${fmtDateShort(t._s)}</td>
        <td>${fmtDateShort(t._c)}</td>
        <td class="num">${fmtDur(t._tta)}</td>
        <td class="num">${fmtDur(t._ttr)}</td>
        <td>${esc(recipName(t.USERS_ID_RECIPIENT))}</td>
        <td>${esc(analistaNomes(t.ID))}</td>
      </tr>`).join("");
    if (rows.length > max)
      html += `<tr><td colspan="11" style="text-align:center;color:var(--text-dim);padding:12px">+ ${rows.length - max} linhas ocultas (refine a busca)</td></tr>`;
    $("glpiTickets").innerHTML =
      html || `<tr><td colspan="11" style="text-align:center;color:var(--text-dim);padding:28px">Nenhum ticket para os filtros.</td></tr>`;
  }

  function recompute() {
    if (allTickets.length) renderAll(baseFiltered(), lastDupes);
  }

  async function load() {
    const override = $("glpiEndpoint").value.trim();
    const url = "/api/glpi" + (override ? "?url=" + encodeURIComponent(override) : "");
    badge("Carregando…", "");
    $("glpiReload").disabled = true;
    $("glpiTopReload").disabled = true;
    try {
      // tickets + técnicos em paralelo (técnicos é opcional)
      const [r, rt] = await Promise.all([
        fetch(url, { headers: { Accept: "application/json" }, cache: "no-store" }),
        fetch("/api/glpi?src=tecnicos", { headers: { Accept: "application/json" }, cache: "no-store" }).catch(() => null),
      ]);
      const json = await r.json();
      if (!r.ok || json.error) throw new Error(json.error || "HTTP " + r.status);
      if (json.Warning) throw new Error("Aviso do servidor: " + json.Warning);
      if (!Array.isArray(json.data)) throw new Error("Formato inesperado: esperava { data: [...] }.");

      let tec = null;
      if (rt && rt.ok) {
        const tj = await rt.json().catch(() => null);
        if (tj && Array.isArray(tj.data)) tec = tj.data;
      }
      buildTecMap(tec);

      $("glpiName").textContent =
        (json.name || "(sem nome)") + (tec ? "" : " · (sem dataset de técnicos)");
      const seen = new Set();
      const tickets = [];
      let dupes = 0;
      for (const t of json.data) {
        const key = [t.ID, t.DATE, t.STATUS, t.USERS_ID_RECIPIENT, t.USERS_ID_LASTUPDATER].join("|");
        if (seen.has(key)) { dupes++; continue; }
        seen.add(key);
        tickets.push(t);
      }
      allTickets = tickets;
      lastDupes = dupes;
      fillFilterOptions();
      recompute();
      badge("✓ " + tickets.length + " tickets", "ok");
      loaded = true;
    } catch (e) {
      badge("Erro", "warn");
      $("glpiName").textContent = String(e.message || e);
    } finally {
      $("glpiReload").disabled = false;
      $("glpiTopReload").disabled = false;
    }
  }

  function bind() {
    $("glpiReload").addEventListener("click", load);
    $("glpiTopReload").addEventListener("click", load);
    ["glpiFltStatus", "glpiFltOrigem", "glpiFltReq", "glpiFltAnalista", "glpiFltPeriodo"].forEach((id) =>
      $(id).addEventListener("change", recompute)
    );
    $("glpiSearch").addEventListener("input", () => {
      if (allTickets.length) renderTable(baseFiltered());
    });
    $("glpiSort").addEventListener("change", () => {
      if (allTickets.length) renderTable(baseFiltered());
    });
  }

  // chamado pelo app: carga na abertura da página (1x) e ao abrir a aba
  function activate() {
    if (!loaded) load();
  }

  document.addEventListener("DOMContentLoaded", bind);
  return { activate, reload: load };
})();
