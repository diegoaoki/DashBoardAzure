/**
 * Criação e atualização dos gráficos (Chart.js via CDN).
 */
window.DASH_CHARTS = (function () {
  const D = window.DASH_DATA;

  const COLORS = {
    accent: "#4f8cff",
    accent2: "#22d3ee",
    good: "#34d399",
    grid: "rgba(36, 49, 84, 0.6)",
    text: "#9aa7c7",
    palette: ["#4f8cff", "#22d3ee", "#34d399", "#f59e0b", "#f87171"],
  };

  Chart.defaults.color = COLORS.text;
  Chart.defaults.font.family =
    '"Segoe UI", system-ui, -apple-system, Roboto, Helvetica, Arial, sans-serif';
  Chart.defaults.plugins.legend.labels.usePointStyle = true;

  const baseScales = {
    x: { grid: { color: COLORS.grid }, ticks: { color: COLORS.text } },
    y: { grid: { color: COLORS.grid }, ticks: { color: COLORS.text }, beginAtZero: true },
  };

  let revenue, category, region, weekday;

  function init() {
    const rc = document.getElementById("revenueChart").getContext("2d");
    const grad = rc.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, "rgba(79,140,255,0.35)");
    grad.addColorStop(1, "rgba(79,140,255,0)");

    revenue = new Chart(rc, {
      type: "line",
      data: {
        labels: [],
        datasets: [
          {
            label: "Receita (R$ mil)",
            data: [],
            borderColor: COLORS.accent,
            backgroundColor: grad,
            fill: true,
            tension: 0.35,
            pointRadius: 3,
            pointBackgroundColor: COLORS.accent,
          },
          {
            label: "Meta (R$ mil)",
            data: [],
            borderColor: COLORS.good,
            borderDash: [6, 5],
            fill: false,
            tension: 0.3,
            pointRadius: 0,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        scales: baseScales,
      },
    });

    category = new Chart(document.getElementById("categoryChart"), {
      type: "doughnut",
      data: {
        labels: D.categorias.map((c) => c.nome),
        datasets: [
          {
            data: D.categorias.map((c) => c.valor),
            backgroundColor: COLORS.palette,
            borderColor: "#151d36",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: { legend: { position: "right" } },
      },
    });

    region = new Chart(document.getElementById("regionChart"), {
      type: "bar",
      data: {
        labels: D.regioes.map((r) => r.nome),
        datasets: [
          {
            label: "Receita (R$ mil)",
            data: D.regioes.map((r) => r.valor),
            backgroundColor: COLORS.accent2,
            borderRadius: 6,
            maxBarThickness: 46,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: "y",
        plugins: { legend: { display: false } },
        scales: baseScales,
      },
    });

    weekday = new Chart(document.getElementById("weekdayChart"), {
      type: "bar",
      data: {
        labels: D.pedidosPorDia.map((d) => d.dia),
        datasets: [
          {
            label: "Pedidos",
            data: D.pedidosPorDia.map((d) => d.pedidos),
            backgroundColor: COLORS.accent,
            borderRadius: 6,
            maxBarThickness: 54,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: baseScales,
      },
    });
  }

  function updatePeriod(nMeses) {
    const labels = D.sliceUltimos(D.meses, nMeses);
    revenue.data.labels = labels;
    revenue.data.datasets[0].data = D.sliceUltimos(D.receitaMensal, nMeses);
    revenue.data.datasets[1].data = D.sliceUltimos(D.metaMensal, nMeses);
    revenue.update();
  }

  return { init, updatePeriod };
})();
