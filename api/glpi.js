/**
 * Vercel Serverless Function — proxy do dashboard GLPI (utilsdashboards).
 *
 * O endpoint do GLPI não permite CORS; esta função busca server-side.
 *
 * Variáveis de ambiente (Vercel → Settings → Environment Variables):
 *   GLPI_ENDPOINT     (recomendado) URL completa do endpoint, COM o token.
 *                     Ex.: https://avenida.verdanadesk.com/plugins/utilsdashboards/
 *                          front/ajax/graphic.json.php?token=XXXX
 *   GLPI_ALLOWED_HOST (opcional)    host permitido para ?url=.
 *                     Padrão: avenida.verdanadesk.com
 *
 * Uso:
 *   GET /api/glpi              → usa GLPI_ENDPOINT
 *   GET /api/glpi?url=<urlGLPI> → só se o host estiver na allowlist (anti-SSRF)
 */
module.exports = async (req, res) => {
  const allowedHost = process.env.GLPI_ALLOWED_HOST || "avenida.verdanadesk.com";
  let target = req.query && req.query.url;

  if (target) {
    let host;
    try {
      host = new URL(target).hostname;
    } catch {
      res.status(400).json({ error: "URL inválida." });
      return;
    }
    if (host !== allowedHost) {
      res.status(403).json({ error: `Host não permitido: ${host} (esperado ${allowedHost}).` });
      return;
    }
  } else {
    target = process.env.GLPI_ENDPOINT;
    if (!target) {
      res.status(500).json({
        error:
          "Defina GLPI_ENDPOINT nas variáveis de ambiente do Vercel (ou chame com ?url=<endpoint GLPI>).",
      });
      return;
    }
  }

  try {
    const r = await fetch(target, { headers: { Accept: "application/json" } });
    const text = await r.text();
    if (!r.ok) {
      res.status(502).json({ error: `GLPI ${r.status}: ${text.slice(0, 300)}` });
      return;
    }
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      res.status(502).json({ error: "Resposta do GLPI não é JSON (token inválido/expirado?)." });
      return;
    }
    res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=300");
    res.status(200).json(json);
  } catch (err) {
    res.status(502).json({ error: String(err.message || err) });
  }
};
