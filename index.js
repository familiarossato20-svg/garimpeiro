const cron = require('node-cron');
const http = require('http');
const config = require('./config');
const { executarGarimpo } = require('./garimpeiro');
const { gerarDashboardHTML } = require('./dashboard');
const { statusAPIs } = require('./fipe');
const { garimparViaApify, isConfigured: apifyConfigured } = require('./apify');
const fs = require('fs');

// Criar pasta de resultados
if (!fs.existsSync('./resultados')) {
  fs.mkdirSync('./resultados');
}

// Carregar último resultado
function carregarResultado(data) {
  const arquivo = `./resultados/garimpo-${data}.json`;
  if (fs.existsSync(arquivo)) {
    return JSON.parse(fs.readFileSync(arquivo, 'utf-8'));
  }
  return null;
}

function listarHistorico() {
  if (!fs.existsSync('./resultados')) return [];
  return fs.readdirSync('./resultados')
    .filter(f => f.startsWith('garimpo-') && f.endsWith('.json'))
    .map(f => f.replace('garimpo-', '').replace('.json', ''))
    .sort()
    .reverse()
    .slice(0, 30); // últimos 30 dias
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  // Dashboard principal
  if ((url.pathname === '/' || url.pathname === '/resultado') && req.method === 'GET') {
    const dataParam = url.searchParams.get('data') || new Date().toISOString().split('T')[0];
    const resultado = carregarResultado(dataParam);
    const historico = listarHistorico();

    if (resultado) {
      const html = gerarDashboardHTML(resultado.oportunidades || [], resultado.stats || {}, historico);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } else {
      const html = gerarDashboardHTML([], { totalAnalisados: 0, fontes: [] }, historico);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    }
    return;
  }

  // Forçar garimpo (retorna JSON pra AJAX)
  if (url.pathname === '/garimpar' && req.method === 'GET') {
    if (global._garimpoRodando) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'already_running' }));
      return;
    }
    global._garimpoRodando = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'started' }));
    executarGarimpo()
      .then(() => { global._garimpoRodando = false; })
      .catch(err => { global._garimpoRodando = false; console.error('Erro no garimpo:', err); });
    return;
  }

  // Status do garimpo
  if (url.pathname === '/api/garimpo-status' && req.method === 'GET') {
    const dataHoje = new Date().toISOString().split('T')[0];
    const resultado = carregarResultado(dataHoje);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      rodando: !!global._garimpoRodando,
      temResultado: !!resultado,
      totalAnalisados: resultado?.totalAnalisados || 0,
      oportunidades: resultado?.oportunidades?.length || 0,
      apifyConfigured: apifyConfigured(),
    }));
    return;
  }

  // Garimpo via Apify (bypassa PerimeterX)
  if (url.pathname === '/api/garimpo-apify' && req.method === 'GET') {
    if (!apifyConfigured()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'APIFY_TOKEN não configurado no Railway' }));
      return;
    }
    if (global._garimpoRodando) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'already_running' }));
      return;
    }

    global._garimpoRodando = true;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'started', mode: 'apify' }));

    // Rodar garimpo via Apify em background
    (async () => {
      try {
        console.log('[APIFY] Iniciando garimpo via Apify...');
        const anuncios = await garimparViaApify();
        console.log(`[APIFY] ${anuncios.length} anúncios coletados`);

        if (anuncios.length > 0) {
          const { calcularMargem } = require('./margem');
          const { limparCache } = require('./fipe');
          limparCache();
          const oportunidades = await calcularMargem(anuncios);

          const resultado = {
            data: new Date().toISOString(),
            totalAnalisados: anuncios.length,
            oportunidades: oportunidades.slice(0, 50),
            stats: { totalAnalisados: anuncios.length, fontes: ['Apify-Webmotors'] },
            fonte: 'apify',
          };

          const dataStr = new Date().toISOString().split('T')[0];
          const arquivo = `./resultados/garimpo-${dataStr}.json`;
          if (!fs.existsSync('./resultados')) fs.mkdirSync('./resultados');
          fs.writeFileSync(arquivo, JSON.stringify(resultado, null, 2));
          console.log(`[APIFY] Salvo: ${arquivo} — ${oportunidades.length} oportunidades`);
        } else {
          console.log('[APIFY] Nenhum anúncio coletado');
        }
      } catch (err) {
        console.error('[APIFY] Erro:', err.message);
      } finally {
        global._garimpoRodando = false;
      }
    })();
    return;
  }

  // API JSON
  if (url.pathname === '/api/resultado' && req.method === 'GET') {
    const dataParam = url.searchParams.get('data') || new Date().toISOString().split('T')[0];
    const resultado = carregarResultado(dataParam);
    res.writeHead(resultado ? 200 : 404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(resultado || { error: 'Sem resultado pra essa data' }));
    return;
  }

  // Import — recebe resultados do GitHub Actions
  if (url.pathname === '/api/import' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const resultado = JSON.parse(body);
        const dataStr = new Date().toISOString().split('T')[0];
        const arquivo = `./resultados/garimpo-${dataStr}.json`;

        if (!fs.existsSync('./resultados')) fs.mkdirSync('./resultados');
        fs.writeFileSync(arquivo, JSON.stringify(resultado, null, 2));

        console.log(`[IMPORT] Recebido: ${resultado.totalAnalisados} analisados, ${resultado.oportunidades?.length || 0} oportunidades (fonte: ${resultado.fonte || 'desconhecida'})`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, saved: arquivo }));
      } catch (err) {
        console.error('[IMPORT] Erro:', err.message);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Import RAW — recebe anúncios brutos do browser, calcula margem FIPE server-side
  if (url.pathname === '/api/import-raw' && req.method === 'POST') {
    // CORS headers pra aceitar POST do browser
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const { anuncios, fontes } = JSON.parse(body);
        console.log(`[IMPORT-RAW] Recebido ${anuncios.length} anúncios brutos do browser (fontes: ${fontes.join(', ')})`);

        const { calcularMargem, removerDuplicatas } = require('./margem');
        const { limparCache } = require('./fipe');

        limparCache();
        const unicos = removerDuplicatas(anuncios);
        console.log(`[IMPORT-RAW] Após dedup: ${unicos.length}`);

        const oportunidades = await calcularMargem(unicos);
        console.log(`[IMPORT-RAW] Oportunidades com margem: ${oportunidades.length}`);

        const resultado = {
          data: new Date().toISOString(),
          totalAnalisados: anuncios.length,
          oportunidades: oportunidades.slice(0, 50),
          stats: { totalAnalisados: anuncios.length, fontes },
          fonte: 'browser-scraper',
        };

        const dataStr = new Date().toISOString().split('T')[0];
        const arquivo = `./resultados/garimpo-${dataStr}.json`;
        if (!fs.existsSync('./resultados')) fs.mkdirSync('./resultados');
        fs.writeFileSync(arquivo, JSON.stringify(resultado, null, 2));

        console.log(`[IMPORT-RAW] Salvo: ${arquivo}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          ok: true,
          totalAnalisados: anuncios.length,
          oportunidades: oportunidades.length,
          saved: arquivo,
        }));
      } catch (err) {
        console.error('[IMPORT-RAW] Erro:', err.message);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // CORS preflight pra import-raw
  if (url.pathname === '/api/import-raw' && req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    res.end();
    return;
  }

  // Health
  if (url.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      servico: 'Garimpeiro L-Car',
      proximaExecucao: config.cronSchedule,
      filtros: config.filtros,
      modelosMonitorados: config.modelosPrioritarios.length,
      fontesAtivas: Object.entries(config.fontes).filter(([k,v]) => v).map(([k]) => k),
      fipeAPIs: statusAPIs(),
      apify: apifyConfigured() ? 'configurado' : 'não configurado — adicione APIFY_TOKEN no Railway',
    }));
    return;
  }

  // Diagnóstico — testa cada fonte e mostra resposta bruta
  if (url.pathname === '/diagnostico' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });

    const axios = require('axios');
    const resultados = {};

    // Teste 1: Webmotors API com url= param
    try {
      const wmResp = await axios.get('https://www.webmotors.com.br/api/search/car', {
        params: {
          url: 'https://www.webmotors.com.br/carros/estoque/volkswagen/gol/santa-catarina',
          DisplayPerPage: 3,
          DisplayPage: 1,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        timeout: 15000,
        validateStatus: () => true,
      });
      resultados.webmotors_api = {
        status: wmResp.status,
        hasSearchResults: !!(wmResp.data && wmResp.data.SearchResults),
        count: wmResp.data?.SearchResults?.length || 0,
        firstModel: wmResp.data?.SearchResults?.[0]?.Specification?.Model || null,
        headers: { contentType: wmResp.headers['content-type'], server: wmResp.headers['server'] },
      };
    } catch (e) {
      resultados.webmotors_api = { error: e.message, code: e.code };
    }

    // Teste 2: Webmotors HTML (scraping)
    try {
      const wmHtml = await axios.get('https://www.webmotors.com.br/carros/estoque/volkswagen/gol/santa-catarina', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        timeout: 15000,
        validateStatus: () => true,
      });
      const bodyPreview = typeof wmHtml.data === 'string' ? wmHtml.data.substring(0, 500) : 'non-string response';
      const hasNextData = typeof wmHtml.data === 'string' && wmHtml.data.includes('__NEXT_DATA__');
      const hasSearchResults = typeof wmHtml.data === 'string' && wmHtml.data.includes('SearchResults');
      resultados.webmotors_html = {
        status: wmHtml.status,
        bodyLength: typeof wmHtml.data === 'string' ? wmHtml.data.length : 0,
        hasNextData,
        hasSearchResults,
        bodyPreview,
      };
    } catch (e) {
      resultados.webmotors_html = { error: e.message, code: e.code };
    }

    // Teste 3: Mercado Livre API
    try {
      const mlResp = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
        params: {
          q: 'Volkswagen Gol',
          category: 'MLB1744',
          state: 'TUxCUFNBTk8',
          limit: 3,
        },
        timeout: 15000,
        validateStatus: () => true,
      });
      resultados.mercadolivre = {
        status: mlResp.status,
        count: mlResp.data?.results?.length || 0,
        total: mlResp.data?.paging?.total || 0,
        firstTitle: mlResp.data?.results?.[0]?.title || null,
        firstPrice: mlResp.data?.results?.[0]?.price || null,
      };
    } catch (e) {
      resultados.mercadolivre = { error: e.message, code: e.code };
    }

    // Teste 4: FIPE AppSpot
    try {
      const fipeResp = await axios.get('https://fipeapi.appspot.com/api/1/carros/marcas.json', {
        timeout: 10000,
        validateStatus: () => true,
      });
      resultados.fipe_appspot = {
        status: fipeResp.status,
        count: Array.isArray(fipeResp.data) ? fipeResp.data.length : 0,
        firstBrand: fipeResp.data?.[0]?.fipe_name || null,
      };
    } catch (e) {
      resultados.fipe_appspot = { error: e.message, code: e.code };
    }

    // Teste 5: FIPE Parallelum
    try {
      const fipe2 = await axios.get('https://parallelum.com.br/fipe/api/v2/cars/brands', {
        timeout: 10000,
        validateStatus: () => true,
      });
      resultados.fipe_parallelum = {
        status: fipe2.status,
        count: Array.isArray(fipe2.data) ? fipe2.data.length : 0,
      };
    } catch (e) {
      resultados.fipe_parallelum = { error: e.message, code: e.code };
    }

    res.end(JSON.stringify(resultados, null, 2));
    return;
  }

  // 404
  res.writeHead(302, { 'Location': '/' });
  res.end();
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  const fontesAtivas = Object.entries(config.fontes).filter(([k,v]) => v).map(([k]) => k);
  console.log(`\n🔍 Garimpeiro L-Car rodando na porta ${PORT}`);
  console.log(`🌐 Dashboard: http://localhost:${PORT}`);
  console.log(`📅 Agendado: ${config.cronSchedule} (todo dia às 7h)`);
  console.log(`📍 Regiões: ${config.filtros.regioes.join(', ')}`);
  console.log(`💰 Margem mínima: R$ ${config.filtros.margemMinima.toLocaleString('pt-BR')}`);
  console.log(`🚗 Modelos monitorados: ${config.modelosPrioritarios.length}`);
  console.log(`🔎 Fontes ativas: ${fontesAtivas.join(', ')}`);
  console.log(`🤖 Apify: ${apifyConfigured() ? 'ATIVO ✅' : 'não configurado'}\n`);
});

// Função de garimpo agendado (prefere Apify se configurado)
async function garimpoAgendado() {
  if (apifyConfigured()) {
    console.log('[CRON] Usando Apify...');
    try {
      const anuncios = await garimparViaApify();
      if (anuncios.length > 0) {
        const { calcularMargem } = require('./margem');
        const { limparCache } = require('./fipe');
        limparCache();
        const oportunidades = await calcularMargem(anuncios);
        const resultado = {
          data: new Date().toISOString(),
          totalAnalisados: anuncios.length,
          oportunidades: oportunidades.slice(0, 50),
          stats: { totalAnalisados: anuncios.length, fontes: ['Apify-Webmotors'] },
          fonte: 'apify-cron',
        };
        const dataStr = new Date().toISOString().split('T')[0];
        const arquivo = `./resultados/garimpo-${dataStr}.json`;
        if (!fs.existsSync('./resultados')) fs.mkdirSync('./resultados');
        fs.writeFileSync(arquivo, JSON.stringify(resultado, null, 2));
        console.log(`[CRON] Apify OK: ${oportunidades.length} oportunidades salvas`);
        return;
      }
    } catch(err) { console.error('[CRON] Apify falhou:', err.message); }
  }
  // Fallback: garimpo direto (provavelmente vai dar 403)
  await executarGarimpo();
}

// Agendar execução diária
cron.schedule(config.cronSchedule, () => {
  console.log('\n⏰ Execução agendada disparada');
  garimpoAgendado().catch(err => console.error('Erro no garimpo agendado:', err));
});

if (process.env.RUN_ON_START === 'true') {
  console.log('\n🚀 Executando garimpo inicial...');
  garimpoAgendado().catch(err => console.error('Erro no garimpo inicial:', err));
}
