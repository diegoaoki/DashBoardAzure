/**
 * Orquestra: carrega /api/board, popula KPIs, banner de sprint, tabela,
 * gráficos, filtros e navegação.
 */
(function () {
  const D = window.DASH_DATA;
  const C = window.DASH_CHARTS;

  const VIEWS = {
    "visao-geral": { title: "Visão geral", subtitle: "Relatórios do board do Azure DevOps" },
    responsaveis: { title: "Responsáveis", subtitle: "Distribuição de itens por pessoa" },
    sprint: { title: "Sprint", subtitle: "Progresso da iteração atual" },
    aging: { title: "Aging", subtitle: "Há quanto tempo os itens estão em aberto" },
  };

  let CURRENT = null;

  function kpiCards(t) {
    return [
      { label: "Total de itens", value: D.fmtNum(t.total), sub: t.truncated ? "amostra (truncado)" : "no board" },
      { label: "Em aberto", value: D.fmtNum(t.abertos), sub: "não concluídos" },
      { label: "Concluídos", value: D.fmtNum(t.concluidos), sub: "estados de done" },
      { label: "Idade média (aberto)", value: D.fmtNum(t.idadeMediaAberta) + " d", sub: "dias desde criação" },
    ];
  }

  function renderKpis(t) {
    document.getElementById("kpiGrid").innerHTML = kpiCards(t)
      .map(
        (k) => `
        <div class="kpi">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value">${k.value}</div>
          <div class="kpi-delta">${k.sub}</div>
        </div>`
      )
      .join("");
  }

  function renderSprint(s) {
    const el = document.getElementById("sprintBanner");
    if (!s) {
      el.hidden = true;
      return;
    }
    const pct = s.total ? Math.round((s.concluidos / s.total) * 100) : 0;
    const ptsPct = s.pontos ? Math.round((s.pontosConcluidos / s.pontos) * 100) : 0;
    el.hidden = false;
    el.innerHTML = `
      <div class="banner-head">
        <strong>${s.nome}</strong>
        <span>${s.concluidos}/${s.total} itens concluídos · ${s.pontosConcluidos}/${s.pontos} pts</span>
      </div>
      <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      <div class="banner-sub">${pct}% dos itens · ${ptsPct}% dos pontos</div>`;
  }

  function renderTable(filter = "") {
    const term = filter.trim().toLowerCase();
    const rows = CURRENT.itens.filter(
      (i) =>
        i.titulo.toLowerCase().includes(term) ||
        String(i.responsavel).toLowerCase().includes(term)
    );
    const body = document.getElementById("itemsTableBody");
    body.innerHTML = rows.length
      ? rows
          .map(
            (i) => `
        <tr>
          <td class="num">#${i.id}</td>
          <td>${escapeHtml(i.titulo)}</td>
          <td><span class="pill">${escapeHtml(i.tipo)}</span></td>
          <td><span class="pill">${escapeHtml(i.estado)}</span></td>
          <td>${escapeHtml(i.responsavel)}</td>
          <td class="num ${i.idadeDias > 30 ? "trend-down" : ""}">${i.idadeDias}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:28px">
           Nenhum item encontrado.</td></tr>`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function setView(view) {
    const meta = VIEWS[view] || VIEWS["visao-geral"];
    document.getElementById("viewTitle").textContent = meta.title;
    document.getElementById("viewSubtitle").textContent = meta.subtitle;
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === view);
    });
  }

  function setStatus(result) {
    const badge = document.getElementById("statusBadge");
    const src = document.getElementById("sourceInfo");
    if (result.usingMock) {
      badge.textContent = "Dados de exemplo";
      badge.className = "status-badge warn";
      src.textContent = result.error || "Mock (API não configurada)";
    } else {
      const d = result.data;
      const when = new Date(d.generatedAt).toLocaleString("pt-BR");
      badge.textContent = "Conectado";
      badge.className = "status-badge ok";
      src.innerHTML = `${escapeHtml(d.org)} / ${escapeHtml(d.project)}<br>${escapeHtml(d.team)}<br><small>atualizado ${when}</small>`;
    }
  }

  async function refresh() {
    const badge = document.getElementById("statusBadge");
    badge.textContent = "Carregando…";
    badge.className = "status-badge";
    const result = await D.load();
    CURRENT = result.data;
    setStatus(result);
    renderKpis(CURRENT.totals);
    renderSprint(CURRENT.sprint);
    C.render(CURRENT);
    renderTable(document.getElementById("tableSearch").value);
  }

  function bindEvents() {
    document.getElementById("tableSearch").addEventListener("input", (e) => renderTable(e.target.value));
    document.getElementById("refreshBtn").addEventListener("click", refresh);
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        setView(el.dataset.view);
        document.getElementById("sidebar").classList.remove("open");
      });
    });
    document.getElementById("toggleSidebar").addEventListener("click", () => {
      document.getElementById("sidebar").classList.toggle("open");
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    C.init();
    bindEvents();
    refresh();
  });
})();
