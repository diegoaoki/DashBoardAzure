# DashBoard Azure

Painel de **relatórios do board do Azure DevOps**, hospedado no **Vercel**.

- Frontend estático (HTML/CSS/JS + Chart.js via CDN)
- Backend = **Vercel Serverless Function** (`api/board.js`) que chama a API REST
  do Azure DevOps usando um PAT guardado como variável de ambiente.
  O token **nunca** vai pro navegador nem pro Git.

## Como funciona

```
navegador → /api/board (função no Vercel) → API REST do Azure DevOps
```

A função roda WIQL, busca os work items em lote e calcula:

- **Status / tipo** — itens por estado e por tipo (Bug, Task, User Story…)
- **Por responsável** — top pessoas por quantidade de itens
- **Sprint atual** — itens e story points concluídos vs. abertos
- **Aging** — itens em aberto por faixa de tempo (0-7 / 8-30 / 31-90 / 90+ dias)
- **QAs** — quem comentou nos cards. Conta **1 por card** por pessoa, mesmo
  com vários comentários. Busca comentários só de cards com `CommentCount > 0`,
  com teto `AZDO_QA_MAX_ITEMS` e chamadas em paralelo (a função tem
  `maxDuration` de 60s em `vercel.json`).

Resultado fica em cache na borda do Vercel por 5 min (`stale-while-revalidate`).

## Configuração no Vercel

Em **Project → Settings → Environment Variables**, adicione:

| Variável            | Obrigatória | Exemplo / descrição                                            |
| ------------------- | ----------- | -------------------------------------------------------------- |
| `AZDO_ORG`          | ✅          | Nome da organização (`https://dev.azure.com/<ORG>`)            |
| `AZDO_PROJECT`      | ✅          | Nome do projeto                                                |
| `AZDO_PAT`          | ✅          | Personal Access Token (ver abaixo)                             |
| `AZDO_TEAM`         | —           | Time/board específico. Padrão: time padrão do projeto          |
| `AZDO_DONE_STATES`  | —           | Estados de "concluído". Padrão: `Closed,Done,Resolved,Completed,Removed` |
| `AZDO_QA_MAX_ITEMS` | —           | Teto de cards para buscar comentários (aba QAs). Padrão: `600`  |

Depois faça um **redeploy** para as variáveis entrarem em vigor.

### Gerar o PAT no Azure DevOps

1. Azure DevOps → canto superior direito → **User settings** → **Personal access tokens**
2. **New Token**
3. Organização: a mesma do `AZDO_ORG`
4. Escopo: **Work Items → Read** (só leitura já basta)
5. Defina validade e clique em **Create**
6. Copie o token e cole em `AZDO_PAT` no Vercel (não dá pra ver de novo depois)

## Rodando localmente

Abrindo `index.html` direto (duplo clique) **não** há `/api/board`,
então o dashboard mostra **dados de exemplo** com o aviso "Dados de exemplo".

Para testar a função localmente é preciso a Vercel CLI (requer Node):

```powershell
npm i -g vercel
vercel dev          # define as env vars localmente quando solicitado
```

## Estrutura

```
index.html        Layout: KPIs, gráficos, tabela, banner de sprint
css/styles.css    Tema escuro responsivo
js/data.js        Carrega /api/board (fallback mock)
js/charts.js      Gráficos Chart.js (estado, tipo, responsável, aging)
js/app.js         KPIs, sprint, tabela, navegação, refresh
api/board.js      Serverless Function → Azure DevOps REST API
```

## Próximos passos

- [ ] Tendência histórica (Analytics/OData) — burndown real
- [ ] Filtro por time/área na própria UI
- [ ] Autenticação no dashboard (caso vá além de uso interno)
