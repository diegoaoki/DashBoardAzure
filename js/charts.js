/**
 * Gráficos do board (Chart.js via CDN). init() cria, render(data) popula.
 */
window.DASH_CHARTS = (function () {
  const COLORS = {
    accent: "#4f8cff",
    accent2: "#22d3ee",
    good: "#34d399",
    grid: "rgba(36, 49, 84, 0.6)",
    text: "#9aa7c7",
    palette: ["#4f8cff", "#22d3ee", "#34d399", "#f59e0b", "#f87171", "#a78bfa", "#fb7185", "#2dd4bf"],
  };

  Chart.defaults.color = COLORS.text;
  Chart.defaults.font.family =
    '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;

  const scales = {
    x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.text } },
    y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.text }, beginAtZero: true },
  };

  let state, type, assignee, aging, qa;

  function init() {
    state = new Chart(document.getElementById("stateChart"), {
      type: "bar",
      data: { labels: [], datasets: [{ label: "Itens", data: [], backgroundColor: COLORS.accent, borderRadius: 6, maxBarThickness: 60 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales },
    });

    type = new Chart(document.getElementById("typeChart"), {
      type: "doughnut",
      data: { labels: [], datasets: [{ data: [], backgroundColor: COLORS.palette, borderColor: "#151d36", borderWidth: 2 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: "60%", plugins: { legend: { position: "right" } } },
    });

    assignee = new Chart(document.getElementById("assigneeChart"), {
      type: "bar",
      data: { labels: [], datasets: [{ label: "Itens", data: [], backgroundColor: COLORS.accent2, borderRadius: 6, maxBarThickness: 40 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } }, scales },
    });

    aging = new Chart(document.getElementById("agingChart"), {
      type: "bar",
      data: {
        labels: [],
        datasets: [{
          label: "Itens em aberto",
          data: [],
          backgroundColor: ["#34d399", "#4f8cff", "#f59e0b", "#f87171"],
          borderRadius: 6,
          maxBarThickness: 80,
        }],
      },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales },
    });

    qa = new Chart(document.getElementById("qaChart"), {
      type: "bar",
      data: { labels: [], datasets: [{ label: "Cards comentados", data: [], backgroundColor: COLORS.good, borderRadius: 6, maxBarThickness: 40 }] },
      options: { responsive: true, maintainAspectRatio: false, indexAxis: "y", plugins: { legend: { display: false } }, scales },
    });
  }

  function render(d) {
    state.data.labels = d.byState.map((x) => x.nome);
    state.data.datasets[0].data = d.byState.map((x) => x.qtd);
    state.update();

    type.data.labels = d.byType.map((x) => x.nome);
    type.data.datasets[0].data = d.byType.map((x) => x.qtd);
    type.update();

    assignee.data.labels = d.byAssignee.map((x) => x.nome);
    assignee.data.datasets[0].data = d.byAssignee.map((x) => x.qtd);
    assignee.update();

    aging.data.labels = d.aging.map((x) => x.faixa);
    aging.data.datasets[0].data = d.aging.map((x) => x.qtd);
    aging.update();

    qa.data.labels = d.byQA.map((x) => x.nome);
    qa.data.datasets[0].data = d.byQA.map((x) => x.qtd);
    qa.update();
  }

  return { init, render };
})();
