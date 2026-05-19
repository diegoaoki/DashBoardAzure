# DashBoard Azure

Painel de vendas **frontend-only**, sem build e sem dependências de Node.
Feito com HTML + CSS + JavaScript puro e [Chart.js](https://www.chartjs.org/) via CDN.

## Como rodar

Não precisa instalar nada. Há duas opções:

- **Duplo clique** em `index.html` — abre direto no navegador.
- **Servidor local** (recomendado, evita restrições de CDN/CORS):

  ```powershell
  # Com Python instalado:
  python -m http.server 8080
  # Depois abra http://localhost:8080
  ```

## Estrutura

```
index.html        Layout: sidebar, topbar, KPIs, gráficos, tabela
css/styles.css    Tema escuro responsivo
js/data.js        Dados mockados + helpers de formatação (pt-BR)
js/charts.js      Configuração dos gráficos (Chart.js)
js/app.js         Inicialização, KPIs, tabela, filtros, navegação
staticwebapp.config.json   Config de roteamento p/ Azure Static Web Apps
```

## Funcionalidades

- 4 KPIs que recalculam conforme o filtro de período
- Gráfico de receita x meta (linha), categorias (rosca), regiões (barra), pedidos por dia (barra)
- Tabela de top produtos com busca/filtro
- Layout responsivo com sidebar retrátil no mobile

## Próximos passos

- [ ] Conectar a uma API real (substituir `js/data.js`)
- [ ] Autenticação
- [ ] Deploy no Azure Static Web Apps

## Deploy — Azure Static Web Apps

O projeto já inclui `staticwebapp.config.json`. Por ser estático puro,
basta apontar o app location para a raiz (`/`) e deixar o build vazio.
