/**
 * Vercel Serverless Function — dados do board do Azure DevOps.
 *
 * Retorna os work items detalhados (incluindo os comentaristas de cada
 * card). A agregação (KPIs, gráficos, aba QAs) e os filtros (analista /
 * período) são feitos no cliente.
 *
 * Variáveis de ambiente (Vercel → Settings → Environment Variables):
 *   AZDO_ORG          (obrigatório)  organização (https://dev.azure.com/<ORG>)
 *   AZDO_PROJECT      (obrigatório)  projeto
 *   AZDO_PAT          (obrigatório)  Personal Access Token (Work Items: Read)
 *   AZDO_TEAM         (opcional)     time/board. Padrão: time padrão do projeto
 *   AZDO_DONE_STATES  (opcional)     estados de "concluído" (vírgula).
 *                                    Padrão: Closed,Done,Resolved,Completed,Removed
 *   AZDO_QA_MAX_ITEMS (opcional)     teto de cards p/ buscar comentários. Padrão: 600
 */

const API = "7.1";
const COMMENTS_API = "7.1-preview.3";
const DEFAULT_DONE = ["Closed", "Done", "Resolved", "Completed", "Removed"];
const MAX_ITEMS = 2000;
const BATCH = 200;
const POOL = 12; // chamadas de comentários simultâneas

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
    headers: { Authorization: authHeader(pat), "Content-Type": "application/json" },
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

/** Executa fn sobre arr com no máximo `size` chamadas simultâneas. */
async function mapPool(arr, size, fn) {
  const res = new Array(arr.length);
  let idx = 0;
  const workers = Array.from({ length: Math.min(size, arr.length) }, async () => {
    while (idx < arr.length) {
      const cur = idx++;
      res[cur] = await fn(arr[cur], cur);
    }
  });
  await Promise.all(workers);
  return res;
}

module.exports = async (req, res) => {
  const {
    AZDO_ORG,
    AZDO_PROJECT,
    AZDO_PAT,
    AZDO_TEAM,
    AZDO_DONE_STATES,
    AZDO_QA_MAX_ITEMS,
  } = process.env;

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
  const qaMax = parseInt(AZDO_QA_MAX_ITEMS, 10) || 600;

  try {
    const wiql = await azPost(`${teamBase}/_apis/wit/wiql?api-version=${API}`, AZDO_PAT, {
      query:
        "SELECT [System.Id] FROM WorkItems " +
        "WHERE [System.TeamProject] = @project AND [System.WorkItemType] <> '' " +
        "ORDER BY [System.ChangedDate] DESC",
    });

    let ids = (wiql.workItems || []).map((w) => w.id);
    const totalNoBoard = ids.length;
    const truncated = ids.length > MAX_ITEMS;
    ids = ids.slice(0, MAX_ITEMS);

    const fields = [
      "System.Id",
      "System.Title",
      "System.WorkItemType",
      "System.State",
      "System.AssignedTo",
      "System.CreatedDate",
      "System.IterationPath",
      "System.CommentCount",
      "Microsoft.VSTS.Scheduling.StoryPoints",
    ];

    const now = Date.now();
    const items = [];
    for (const part of chunk(ids, BATCH)) {
      if (!part.length) continue;
      const batch = await azPost(
        `${base}/_apis/wit/workitemsbatch?api-version=${API}`,
        AZDO_PAT,
        { ids: part, fields }
      );
      for (const wi of batch.value || []) {
        const f = wi.fields;
        const estado = f["System.State"] || "—";
        const criado = f["System.CreatedDate"] ? new Date(f["System.CreatedDate"]).getTime() : now;
        items.push({
          id: f["System.Id"],
          titulo: f["System.Title"] || "",
          tipo: f["System.WorkItemType"] || "—",
          estado,
          responsavel:
            (f["System.AssignedTo"] && f["System.AssignedTo"].displayName) || "Não atribuído",
          criadoEm: new Date(criado).toISOString(),
          idadeDias: daysBetween(criado, now),
          concluido: doneStates.includes(String(estado).toLowerCase()),
          iteracao: f["System.IterationPath"] || "",
          pontos: Number(f["Microsoft.VSTS.Scheduling.StoryPoints"]) || 0,
          comentarios: Number(f["System.CommentCount"]) || 0,
          comentaristas: [], // preenchido abaixo p/ cards com comentários
        });
      }
    }

    // QAs: buscar comentários só dos cards que têm comentários (teto qaMax,
    // priorizando os mais recentemente alterados — items já vem nessa ordem).
    const byId = new Map(items.map((i) => [i.id, i]));
    const comCards = items.filter((i) => i.comentarios > 0).slice(0, qaMax);
    const qaTruncated = items.filter((i) => i.comentarios > 0).length > qaMax;

    await mapPool(comCards, POOL, async (it) => {
      try {
        const j = await azGet(
          `${projBase}/_apis/wit/workItems/${it.id}/comments?api-version=${COMMENTS_API}&$top=200`,
          AZDO_PAT
        );
        const nomes = new Set();
        for (const c of j.comments || []) {
          const n = c.createdBy && c.createdBy.displayName;
          if (n) nomes.add(n); // distinto por pessoa => 1 por card
        }
        byId.get(it.id).comentaristas = [...nomes];
      } catch {
        /* falha em 1 card não derruba o resto */
      }
    });

    let sprint = null;
    let sprints = [];
    try {
      const it = await azGet(
        `${teamBase}/_apis/work/teamsettings/iterations?api-version=${API}`,
        AZDO_PAT
      );
      sprints = (it.value || []).map((v) => ({
        nome: v.name,
        path: v.path,
        inicio: v.attributes && v.attributes.startDate,
        fim: v.attributes && v.attributes.finishDate,
        timeframe: v.attributes && v.attributes.timeFrame, // past | current | future
      }));
      const cur = sprints.find((s) => s.timeframe === "current");
      if (cur) sprint = { nome: cur.nome, path: cur.path, inicio: cur.inicio, fim: cur.fim };
    } catch {
      /* time sem iterations configuradas */
    }

    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=600");
    res.status(200).json({
      generatedAt: new Date().toISOString(),
      org: AZDO_ORG,
      project: AZDO_PROJECT,
      team: AZDO_TEAM || "(time padrão)",
      doneStates,
      sprint,
      sprints,
      totalNoBoard,
      truncated,
      qaTruncated,
      items,
    });
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
};
