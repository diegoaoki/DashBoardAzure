/**
 * Vercel Serverless Function — relatórios do board do Azure DevOps.
 *
 * Toda a configuração vem de variáveis de ambiente (Vercel → Settings → Environment Variables):
 *   AZDO_ORG        (obrigatório)  Nome da organização. Ex.: "minhaempresa"
 *   AZDO_PROJECT    (obrigatório)  Nome do projeto. Ex.: "MeuProjeto"
 *   AZDO_PAT        (obrigatório)  Personal Access Token (escopo Work Items: Read)
 *   AZDO_TEAM       (opcional)     Time/board. Padrão: time padrão do projeto
 *   AZDO_DONE_STATES(opcional)     Estados considerados "concluído", separados por vírgula.
 *                                  Padrão: Closed,Done,Resolved,Completed,Removed
 *
 * O navegador só chama /api/board — o PAT nunca sai do servidor.
 */

const API = "7.1";
const DEFAULT_DONE = ["Closed", "Done", "Resolved", "Completed", "Removed"];
const MAX_ITEMS = 2000; // teto de segurança p/ rate limit
const BATCH = 200; // limite da API workitemsbatch

function authHeader(pat) {
  return "Basic " + Buffer.from(":" + pat).toString("base64");
}

async function azGet(url, pat) {
  const r = await fetch(url, { headers: { Authorization: authHeader(pat) } });
  if (!r.ok) throw new Error(`Azure DevOps ${r.status}: ${await r.text()}`);
  return r.json();
}

async function azPost(url, pat, body) {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(pat),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`Azure DevOps ${r.status}: ${await r.text()}`);
  return r.json();
}

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

function daysBetween(a, b) {
  return Math.max(0, Math.round((b - a) / 86400000));
}

module.exports = async (req, res) => {
  const { AZDO_ORG, AZDO_PROJECT, AZDO_PAT, AZDO_TEAM, AZDO_DONE_STATES } = process.env;

  if (!AZDO_ORG || !AZDO_PROJECT || !AZDO_PAT) {
    res.status(500).json({
      error:
        "Configuração ausente. Defina AZDO_ORG, AZDO_PROJECT e AZDO_PAT nas variáveis de ambiente do Vercel.",
    });
    return;
  }

  const org = encodeURIComponent(AZDO_ORG);
  const project = encodeURIComponent(AZDO_PROJECT);
  const base = `https://dev.azure.com/${org}`;
  const projBase = `${base}/${project}`;
  const teamBase = AZDO_TEAM ? `${projBase}/${encodeURIComponent(AZDO_TEAM)}` : projBase;
  const doneStates = (AZDO_DONE_STATES
    ? AZDO_DONE_STATES.split(",").map((s) => s.trim())
    : DEFAULT_DONE
  ).map((s) => s.toLowerCase());

  try {
    // 1) WIQL — ids dos work items do projeto
    const wiql = await azPost(`${teamBase}/_apis/wit/wiql?api-version=${API}`, AZDO_PAT, {
      query:
        "SELECT [System.Id] FROM WorkItems " +
        "WHERE [System.TeamProject] = @project " +
        "AND [System.WorkItemType] <> '' " +
        "ORDER BY [System.ChangedDate] DESC",
    });

    let ids = (wiql.workItems || []).map((w) => w.id);
    const truncated = ids.length > MAX_ITEMS;
    ids = ids.slice(0, MAX_ITEMS);

    // 2) Detalhes em lote
    const fields = [
      "System.Id",
      "System.Title",
      "System.WorkItemType",
      "System.State",
      "System.AssignedTo",
      "System.CreatedDate",
      "System.ChangedDate",
      "System.IterationPath",
      "Microsoft.VSTS.Common.ClosedDate",
      "Microsoft.VSTS.Scheduling.StoryPoints",
    ];

    const items = [];
    for (const part of chunk(ids, BATCH)) {
      if (!part.length) continue;
      const batch = await azPost(
        `${base}/_apis/wit/workitemsbatch?api-version=${API}`,
        AZDO_PAT,
        { ids: part, fields }
      );
      for (const wi of batch.value || []) items.push(wi.fields);
    }

    // 3) Sprint atual (se houver time)
    let currentIteration = null;
    try {
      const it = await azGet(
        `${teamBase}/_apis/work/teamsettings/iterations?$timeframe=current&api-version=${API}`,
        AZDO_PAT
      );
      currentIteration = it.value && it.value[0] ? it.value[0] : null;
    } catch {
      /* time sem iterations configuradas — segue sem sprint */
    }

    // 4) Agregações
    const now = Date.now();
    const byState = {};
    const byType = {};
    const byAssignee = {};
    const agingBuckets = { "0-7d": 0, "8-30d": 0, "31-90d": 0, "90d+": 0 };
    let openCount = 0;
    let doneCount = 0;
    let openAgeSum = 0;
    const sprintPath = currentIteration ? currentIteration.path : null;
    let sprintTotal = 0;
    let sprintDone = 0;
    let sprintPoints = 0;
    let sprintPointsDone = 0;

    const tableRows = [];

    for (const f of items) {
      const state = f["System.State"] || "—";
      const type = f["System.WorkItemType"] || "—";
      const assignee =
        (f["System.AssignedTo"] && f["System.AssignedTo"].displayName) || "Não atribuído";
      const created = f["System.CreatedDate"] ? new Date(f["System.CreatedDate"]).getTime() : now;
      const isDone = doneStates.includes(String(state).toLowerCase());
      const ageDays = daysBetween(created, now);

      byState[state] = (byState[state] || 0) + 1;
      byType[type] = (byType[type] || 0) + 1;
      byAssignee[assignee] = (byAssignee[assignee] || 0) + 1;

      if (isDone) {
        doneCount++;
      } else {
        openCount++;
        openAgeSum += ageDays;
        if (ageDays <= 7) agingBuckets["0-7d"]++;
        else if (ageDays <= 30) agingBuckets["8-30d"]++;
        else if (ageDays <= 90) agingBuckets["31-90d"]++;
        else agingBuckets["90d+"]++;
      }

      if (sprintPath && f["System.IterationPath"] === sprintPath) {
        sprintTotal++;
        const pts = Number(f["Microsoft.VSTS.Scheduling.StoryPoints"]) || 0;
        sprintPoints += pts;
        if (isDone) {
          sprintDone++;
          sprintPointsDone += pts;
        }
      }

      tableRows.push({
        id: f["System.Id"],
        titulo: f["System.Title"] || "",
        tipo: type,
        estado: state,
        responsavel: assignee,
        idadeDias: ageDays,
        concluido: isDone,
      });
    }

    const topAssignees = Object.entries(byAssignee)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([nome, qtd]) => ({ nome, qtd }));

    const payload = {
      generatedAt: new Date().toISOString(),
      org: AZDO_ORG,
      project: AZDO_PROJECT,
      team: AZDO_TEAM || "(time padrão)",
      totals: {
        total: items.length,
        abertos: openCount,
        concluidos: doneCount,
        idadeMediaAberta: openCount ? Math.round(openAgeSum / openCount) : 0,
        truncated,
      },
      byState: Object.entries(byState).map(([nome, qtd]) => ({ nome, qtd })),
      byType: Object.entries(byType).map(([nome, qtd]) => ({ nome, qtd })),
      byAssignee: topAssignees,
      aging: Object.entries(agingBuckets).map(([faixa, qtd]) => ({ faixa, qtd })),
      sprint: currentIteration
        ? {
            nome: currentIteration.name,
            total: sprintTotal,
            concluidos: sprintDone,
            abertos: sprintTotal - sprintDone,
            pontos: sprintPoints,
            pontosConcluidos: sprintPointsDone,
            inicio: currentIteration.attributes && currentIteration.attributes.startDate,
            fim: currentIteration.attributes && currentIteration.attributes.finishDate,
          }
        : null,
      // amostra ordenada pelos mais antigos em aberto, depois recentes
      itens: tableRows
        .sort((a, b) => Number(b.idadeDias) - Number(a.idadeDias))
        .slice(0, 50),
    };

    // cache na borda: 5 min, serve "stale" enquanto revalida
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json(payload);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
};
