/**
 * Carrega os dados do board via /api/board (Vercel Serverless Function).
 * Se a API não estiver disponível (ex.: abrindo o HTML direto, sem deploy),
 * cai num conjunto mockado para o layout continuar visível.
 */
window.DASH_DATA = (function () {
  const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");

  const MOCK = {
    generatedAt: new Date().toISOString(),
    org: "demo",
    project: "Projeto Demo",
    team: "(mock)",
    mock: true,
    totals: { total: 142, abertos: 58, concluidos: 84, idadeMediaAberta: 23, truncated: false },
    byState: [
      { nome: "New", qtd: 22 },
      { nome: "Active", qtd: 28 },
      { nome: "Resolved", qtd: 8 },
      { nome: "Closed", qtd: 76 },
      { nome: "Removed", qtd: 8 },
    ],
    byType: [
      { nome: "User Story", qtd: 54 },
      { nome: "Bug", qtd: 49 },
      { nome: "Task", qtd: 31 },
      { nome: "Feature", qtd: 8 },
    ],
    byAssignee: [
      { nome: "Ana Souza", qtd: 24 },
      { nome: "Bruno Lima", qtd: 19 },
      { nome: "Carla Dias", qtd: 17 },
      { nome: "Diego F.", qtd: 14 },
      { nome: "Não atribuído", qtd: 12 },
    ],
    aging: [
      { faixa: "0-7d", qtd: 14 },
      { faixa: "8-30d", qtd: 21 },
      { faixa: "31-90d", qtd: 16 },
      { faixa: "90d+", qtd: 7 },
    ],
    sprint: {
      nome: "Sprint 14",
      total: 26,
      concluidos: 11,
      abertos: 15,
      pontos: 63,
      pontosConcluidos: 28,
      inicio: null,
      fim: null,
    },
    itens: Array.from({ length: 12 }, (_, i) => ({
      id: 1000 + i,
      titulo: "Item de exemplo " + (i + 1),
      tipo: ["Bug", "User Story", "Task"][i % 3],
      estado: ["Active", "New", "Resolved"][i % 3],
      responsavel: ["Ana Souza", "Bruno Lima", "Não atribuído"][i % 3],
      idadeDias: 90 - i * 6,
      concluido: false,
    })),
  };

  async function load() {
    try {
      const r = await fetch("/api/board", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok || body.error) {
        return { data: MOCK, error: body.error || `HTTP ${r.status}`, usingMock: true };
      }
      return { data: body, error: null, usingMock: false };
    } catch (e) {
      return {
        data: MOCK,
        error: "Sem conexão com /api/board (rodando local?). Exibindo dados de exemplo.",
        usingMock: true,
      };
    }
  }

  return { load, fmtNum, MOCK };
})();
