/**
 * Inicialização do app: KPIs, tabela, filtros e navegação.
 */
(function () {
  const D = window.DASH_DATA;
  const C = window.DASH_CHARTS;

  const VIEWS = {
    "visao-geral": { title: "Visão geral", subtitle: "Resumo de desempenho — período atual" },
    vendas: { title: "Vendas", subtitle: "Acompanhamento de receita e pedidos" },
    produtos: { title: "Produtos", subtitle: "Desempenho do catálogo" },
    regioes: { title: "Regiões", subtitle: "Distribuição geográfica de receita" },
  };

  function renderKpis(nMeses) {
    const grid = document.getElementById("kpiGrid");
    grid.innerHTML = D.kpis(nMeses)
      .map(
        (k) => `
        <div class="kpi">
          <div class="kpi-label">${k.label}</div>
          <div class="kpi-value">${k.value}</div>
          <div class="kpi-delta ${k.up ? "up" : "down"}">
            ${k.up ? "▲" : "▼"} ${Math.abs(k.delta)}% vs. período anterior
          </div>
        </div>`
      )
      .join("");
  }

  function renderTable(filter = "") {
    const body = document.getElementById("productTableBody");
    const term = filter.trim().toLowerCase();
    const rows = D.produtos
      .filter((p) => p.nome.toLowerCase().includes(term))
      .sort((a, b) => b.receita - a.receita);

    body.innerHTML = rows.length
      ? rows
          .map(
            (p) => `
        <tr>
          <td>${p.nome}</td>
          <td><span class="pill">${p.categoria}</span></td>
          <td class="num">${D.fmtNum(p.unidades)}</td>
          <td class="num">${D.fmtBRL(p.receita)}</td>
          <td class="num ${p.variacao >= 0 ? "trend-up" : "trend-down"}">
            ${p.variacao >= 0 ? "▲" : "▼"} ${Math.abs(p.variacao).toFixed(1)}%
          </td>
        </tr>`
          )
          .join("")
      : `<tr><td colspan="5" style="text-align:center;color:var(--text-dim);padding:28px">
           Nenhum produto encontrado.
         </td></tr>`;
  }

  function setView(view) {
    const meta = VIEWS[view] || VIEWS["visao-geral"];
    document.getElementById("viewTitle").textContent = meta.title;
    document.getElementById("viewSubtitle").textContent = meta.subtitle;
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === view);
    });
  }

  function bindEvents() {
    document.getElementById("periodFilter").addEventListener("change", (e) => {
      const n = parseInt(e.target.value, 10);
      renderKpis(n);
      C.updatePeriod(n);
    });

    document.getElementById("tableSearch").addEventListener("input", (e) => {
      renderTable(e.target.value);
    });

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
    const n = parseInt(document.getElementById("periodFilter").value, 10);
    C.init();
    C.updatePeriod(n);
    renderKpis(n);
    renderTable();
    bindEvents();
  });
})();
