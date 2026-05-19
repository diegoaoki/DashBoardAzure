/**
 * Dados de demonstração do dashboard.
 * Tudo mockado — substituir por chamada de API quando o backend existir.
 */
window.DASH_DATA = (function () {
  const meses = [
    "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
    "Jul", "Ago", "Set", "Out", "Nov", "Dez",
  ];

  // Receita mensal (R$ mil) e meta mensal
  const receitaMensal = [
    420, 455, 398, 510, 540, 600,
    580, 625, 690, 710, 760, 845,
  ];
  const metaMensal = [
    450, 450, 470, 500, 520, 560,
    600, 620, 650, 700, 740, 800,
  ];

  const categorias = [
    { nome: "Vestuário", valor: 1840 },
    { nome: "Calçados", valor: 1210 },
    { nome: "Acessórios", valor: 760 },
    { nome: "Casa", valor: 540 },
    { nome: "Eletro", valor: 430 },
  ];

  const regioes = [
    { nome: "Sudeste", valor: 2950 },
    { nome: "Sul", valor: 1480 },
    { nome: "Nordeste", valor: 1120 },
    { nome: "Centro-Oeste", valor: 690 },
    { nome: "Norte", valor: 410 },
  ];

  const pedidosPorDia = [
    { dia: "Seg", pedidos: 320 },
    { dia: "Ter", pedidos: 285 },
    { dia: "Qua", pedidos: 410 },
    { dia: "Qui", pedidos: 380 },
    { dia: "Sex", pedidos: 520 },
    { dia: "Sáb", pedidos: 610 },
    { dia: "Dom", pedidos: 240 },
  ];

  const produtos = [
    { nome: "Camiseta Básica Premium", categoria: "Vestuário", unidades: 4820, receita: 192800, variacao: 12.4 },
    { nome: "Tênis Runner X", categoria: "Calçados", unidades: 1960, receita: 489000, variacao: 8.1 },
    { nome: "Jaqueta Corta-Vento", categoria: "Vestuário", unidades: 1340, receita: 268000, variacao: -3.2 },
    { nome: "Mochila Urban 30L", categoria: "Acessórios", unidades: 2210, receita: 154700, variacao: 21.7 },
    { nome: "Bota Trail Pro", categoria: "Calçados", unidades: 880, receita: 308000, variacao: 5.6 },
    { nome: "Boné Snapback", categoria: "Acessórios", unidades: 3650, receita: 109500, variacao: -1.4 },
    { nome: "Conjunto Cama Queen", categoria: "Casa", unidades: 720, receita: 187200, variacao: 9.9 },
    { nome: "Liquidificador Turbo", categoria: "Eletro", unidades: 540, receita: 162000, variacao: 14.3 },
  ];

  function sliceUltimos(arr, n) {
    return arr.slice(Math.max(0, arr.length - n));
  }

  const fmtBRL = (v) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const fmtNum = (v) => v.toLocaleString("pt-BR");

  return {
    meses,
    receitaMensal,
    metaMensal,
    categorias,
    regioes,
    pedidosPorDia,
    produtos,
    sliceUltimos,
    fmtBRL,
    fmtNum,
    /**
     * Recalcula KPIs conforme o número de meses do filtro.
     */
    kpis(nMeses) {
      const receita = sliceUltimos(receitaMensal, nMeses);
      const totalReceita = receita.reduce((a, b) => a + b, 0) * 1000;
      const totalPedidos = pedidosPorDia.reduce((a, b) => a + b.pedidos, 0) * Math.round(nMeses * 4.3);
      const ticket = totalReceita / totalPedidos;
      const unidades = produtos.reduce((a, p) => a + p.unidades, 0);
      return [
        { label: "Receita total", value: fmtBRL(totalReceita), delta: 11.8, up: true },
        { label: "Pedidos", value: fmtNum(totalPedidos), delta: 6.3, up: true },
        { label: "Ticket médio", value: fmtBRL(ticket), delta: 4.2, up: true },
        { label: "Unidades vendidas", value: fmtNum(unidades), delta: -2.1, up: false },
      ];
    },
  };
})();
