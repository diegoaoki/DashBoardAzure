/**
 * Carrega /api/board, aplica filtros (analista / período), recalcula
 * KPIs / gráficos / sprint / tabela e controla a navegação do menu.
 */
(function () {
  const D = window.DASH_DATA;
  const C = window.DASH_CHARTS;

  const VIEWS = {
    "visao-geral": { title: "Visão geral", subtitle: "Relatórios do board do Azure DevOps" },
    responsaveis: { title: "Responsáveis", subtitle: "Distribuição de itens por analista" },
    sprint: { title: "Sprint", subtitle: "Progresso da iteração atual" },
    aging: { title: "Aging", subtitle: "Há quanto tempo os itens estão em aberto" },
    qas: { title: "QAs", subtitle: "Cards comentados por QA — 1 por card, mesmo com vários comentários" },
  };

  let RAW = null; // payload completo da API
  let view = "visao-geral";

  const $ = (id) => document.getElementById(id);

  /* ---------- filtros ---------- */
  function filtered() {
    const analyst = $("analystFilter").value;
    const days = parseInt($("periodFilter").value, 10) || 0;
    const minTime = days ? Date.now() - days * 86400000 : 0;
    return RAW.items.filter((i) => {
      if (analyst && i.responsavel !== analyst) return false;
      if (minTime && new Date(i.criadoEm).getTime() < minTime) return false;
      return true;
    });
  }

  function countBy(items, key) {
    const m = {};
    for (const i of items) m[i[key]] = (m[i[key]] || 0) + 1;
    return Object.entries(m).map(([nome, qtd]) => ({ nome, qtd }));
  }

  // Conta, por pessoa, em quantos cards distintos ela comentou.
  // item.comentaristas já vem distinto por card (1 por pessoa por card).
  function countQA(items) {
    const m = {};
    for (const i of items)
      for (const nome of i.comentaristas || []) m[nome] = (m[nome] || 0) + 1;
    return Object.entries(m)
      .map(([nome, qtd]) => ({ nome, qtd }))
      .sort((a, b) => b.qtd - a.qtd)
      .slice(0, 15);
  }

  function aggregate(items) {
    const abertos = items.filter((i) => !i.concluido);
    const buckets = { "0-7d": 0, "8-30d": 0, "31-90d": 0, "90d+": 0 };
    let ageSum = 0;
    for (const i of abertos) {
      ageSum += i.idadeDias;
      if (i.idadeDias <= 7) buckets["0-7d"]++;
      else if (i.idadeDias <= 30) buckets["8-30d"]++;
      else if (i.idadeDias <= 90) buckets["31-90d"]++;
      else buckets["90d+"]++;
    }
    const sp = RAW.sprint;
    let sprint = null;
    if (sp) {
      const inSprint = items.filter((i) => i.iteracao === sp.path);
      const done = inSprint.filter((i) => i.concluido);
      sprint = {
        nome: sp.nome,
        total: inSprint.length,
        concluidos: done.length,
        abertos: inSprint.length - done.length,
        pontos: inSprint.reduce((a, i) => a + i.pontos, 0),
        pontosConcluidos: done.reduce((a, i) => a + i.pontos, 0),
      };
    }
    return {
      totals: {
        total: items.length,
        abertos: abertos.length,
        concluidos: items.length - abertos.length,
        idadeMediaAberta: abertos.length ? Math.round(ageSum / abertos.length) : 0,
        truncated: RAW.truncated,
      },
      byState: countBy(items, "estado").sort((a, b) => b.qtd - a.qtd),
      byType: countBy(items, "tipo").sort((a, b) => b.qtd - a.qtd),
      byAssignee: countBy(items, "responsavel")
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 8),
      byQA: countQA(items),
      aging: Object.entries(buckets).map(([faixa, qtd]) => ({ faixa, qtd })),
      sprint,
      itens: items.slice().sort((a, b) => b.idadeDias - a.idadeDias),
    };
  }

  /* ---------- render ---------- */
  function renderKpis(t) {
    const cards = [
      { label: "Total de itens", value: D.fmtNum(t.total), sub: t.truncated ? "amostra (truncado)" : "no filtro" },
      { label: "Em aberto", value: D.fmtNum(t.abertos), sub: "não concluídos" },
      { label: "Concluídos", value: D.fmtNum(t.concluidos), sub: "estados de done" },
      { label: "Idade média (aberto)", value: D.fmtNum(t.idadeMediaAberta) + " d", sub: "dias desde criação" },
    ];
    $("kpiGrid").innerHTML = cards
      .map(
        (k) => `<div class="kpi">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value">${k.value}</div>
          <div class="kpi-delta">${k.sub}</div>
        </div>`
      )
      .join("");
  }

  function renderSprint(s) {
    const el = $("sprintBanner");
    if (!s || !s.total) {
      el.dataset.empty = "1";
      el.innerHTML = `<div class="banner-sub">Sem itens de sprint para o filtro atual.</div>`;
      applyView(view);
      return;
    }
    el.dataset.empty = "";
    const pct = Math.round((s.concluidos / s.total) * 100);
    const ptsPct = s.pontos ? Math.round((s.pontosConcluidos / s.pontos) * 100) : 0;
    el.innerHTML = `
      <div class="banner-head">
        <strong>${esc(s.nome)}</strong>
        <span>${s.concluidos}/${s.total} itens · ${s.pontosConcluidos}/${s.pontos} pts</span>
      </div>
      <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      <div class="banner-sub">${pct}% dos itens · ${ptsPct}% dos pontos concluídos</div>`;
    applyView(view);
  }

  function renderTable(rows) {
    const term = $("tableSearch").value.trim().toLowerCase();
    const list = rows.filter(
      (i) =>
        i.titulo.toLowerCase().includes(term) ||
        String(i.responsavel).toLowerCase().includes(term)
    );
    $("itemsTableBody").innerHTML = list.length
      ? list
          .slice(0, 100)
          .map(
            (i) => `<tr>
          <td class="num">#${i.id}</td>
          <td>${esc(i.titulo)}</td>
          <td><span class="pill">${esc(i.tipo)}</span></td>
          <td><span class="pill">${esc(i.estado)}</span></td>
          <td>${esc(i.responsavel)}</td>
          <td class="num ${i.idadeDias > 30 ? "trend-down" : ""}">${i.idadeDias}</td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="6" style="text-align:center;color:var(--text-dim);padding:28px">
           Nenhum item para os filtros atuais.</td></tr>`;
  }

  function recompute() {
    const agg = aggregate(filtered());
    renderKpis(agg.totals);
    renderSprint(agg.sprint);
    C.render(agg);
    renderTable(agg.itens);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /* ---------- navegação ---------- */
  function applyView(v) {
    view = v;
    const meta = VIEWS[v] || VIEWS["visao-geral"];
    $("viewTitle").textContent = meta.title;
    $("viewSubtitle").textContent = meta.subtitle;
    document.querySelectorAll(".nav-item").forEach((el) =>
      el.classList.toggle("active", el.dataset.view === v)
    );
    // mostra/oculta blocos conforme data-views; sem o atributo = sempre visível
    document.querySelectorAll("[data-views]").forEach((el) => {
      const allowed = el.dataset.views.split(/\s+/).includes(v);
      const emptyBanner = el.id === "sprintBanner" && el.dataset.empty === "1" && v !== "sprint";
      el.hidden = !allowed || emptyBanner;
    });
  }

  /* ---------- status / boot ---------- */
  function fillAnalysts() {
    const sel = $("analystFilter");
    const prev = sel.value;
    const nomes = [...new Set(RAW.items.map((i) => i.responsavel))].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    sel.innerHTML =
      '<option value="">Todos</option>' +
      nomes.map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join("");
    if (nomes.includes(prev)) sel.value = prev;
  }

  function setStatus(result) {
    const badge = $("statusBadge");
    const src = $("sourceInfo");
    if (result.usingMock) {
      badge.textContent = "Dados de exemplo";
      badge.className = "status-badge warn";
      src.textContent = result.error || "Mock (API não configurada)";
    } else {
      const d = result.data;
      const when = new Date(d.generatedAt).toLocaleString("pt-BR");
      badge.textContent = "Conectado";
      badge.className = "status-badge ok";
      src.innerHTML = `${esc(d.org)} / ${esc(d.project)}<br>${esc(d.team)}<br><small>atualizado ${when}</small>`;
    }
  }

  async function refresh() {
    const loader = $("loader");
    const badge = $("statusBadge");
    loader.classList.remove("hidden");
    badge.textContent = "Carregando…";
    badge.className = "status-badge";
    try {
      const result = await D.load();
      RAW = result.data;
      setStatus(result);
      fillAnalysts();
      recompute();
      applyView(view);
    } finally {
      loader.classList.add("hidden");
    }
  }

  function bind() {
    $("analystFilter").addEventListener("change", recompute);
    $("periodFilter").addEventListener("change", recompute);
    $("tableSearch").addEventListener("input", () => renderTable(aggregate(filtered()).itens));
    $("refreshBtn").addEventListener("click", refresh);
    document.querySelectorAll(".nav-item").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.preventDefault();
        applyView(el.dataset.view);
        $("sidebar").classList.remove("open");
      })
    );
    $("toggleSidebar").addEventListener("click", () =>
      $("sidebar").classList.toggle("open")
    );
  }

  document.addEventListener("DOMContentLoaded", () => {
    C.init();
    bind();
    refresh();
  });
})();
