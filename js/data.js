/**
 * Carrega /api/board (Vercel Function). Retorna itens detalhados;
 * a agregação e os filtros são feitos no app.js.
 * Sem API disponível (HTML aberto direto), usa um mock.
 */
window.DASH_DATA = (function () {
  const fmtNum = (v) => Number(v || 0).toLocaleString("pt-BR");

  function buildMock() {
    const nomes = ["Ana Souza", "Bruno Lima", "Carla Dias", "Diego F.", "Não atribuído"];
    const qas = ["QA Paula", "QA Rafael", "QA Tânia"];
    const tipos = ["User Story", "Bug", "Task", "Feature"];
    const estados = ["New", "Active", "Resolved", "Closed", "Removed"];
    const sprintsMock = [
      { nome: "Sprint 12", path: "Projeto Demo\\Sprint 12", timeframe: "past" },
      { nome: "Sprint 13", path: "Projeto Demo\\Sprint 13", timeframe: "past" },
      { nome: "Sprint 14", path: "Projeto Demo\\Sprint 14", timeframe: "current" },
      { nome: "Sprint 15", path: "Projeto Demo\\Sprint 15", timeframe: "future" },
    ];
    const now = Date.now();
    const items = Array.from({ length: 140 }, (_, i) => {
      const estado = estados[i % estados.length];
      const idade = (i * 7) % 220;
      const sp = sprintsMock[i % sprintsMock.length];
      return {
        id: 1000 + i,
        titulo: "Item de exemplo " + (i + 1),
        tipo: tipos[i % tipos.length],
        estado,
        responsavel: nomes[i % nomes.length],
        criadoEm: new Date(now - idade * 86400000).toISOString(),
        idadeDias: idade,
        concluido: estado === "Closed" || estado === "Removed" || estado === "Resolved",
        iteracao: sp.path,
        pontos: [0, 1, 2, 3, 5, 8][i % 6],
        comentarios: i % 3,
        // 0, 1 ou 2 QAs distintos por card (distinto = 1 por pessoa/card)
        comentaristas: i % 3 === 0 ? [] : i % 3 === 1 ? [qas[i % 3]] : [qas[i % 3], qas[(i + 1) % 3]],
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      org: "demo",
      project: "Projeto Demo",
      team: "(mock)",
      mock: true,
      doneStates: ["closed", "done", "resolved", "completed", "removed"],
      sprint: { nome: "Sprint 14", path: "Projeto Demo\\Sprint 14", inicio: null, fim: null },
      sprints: sprintsMock.map((s) => ({ ...s, inicio: null, fim: null })),
      totalNoBoard: 140,
      truncated: false,
      items,
    };
  }

  async function load() {
    try {
      const r = await fetch("/api/board", {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const body = await r.json();
      if (!r.ok || body.error) {
        return { data: buildMock(), error: body.error || `HTTP ${r.status}`, usingMock: true };
      }
      return { data: body, error: null, usingMock: false };
    } catch (e) {
      return {
        data: buildMock(),
        error: "Sem conexão com /api/board (rodando local?). Exibindo dados de exemplo.",
        usingMock: true,
      };
    }
  }

  return { load, fmtNum, buildMock };
})();
