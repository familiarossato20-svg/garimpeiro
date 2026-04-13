const cron = require('node-cron');
const http = require('http');
const config = require('./config');
const { executarGarimpo } = require('./garimpeiro');
const { gerarDashboardHTML } = require('./dashboard');
const { statusAPIs } = require('./fipe');
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

  // Forçar garimpo
  if (url.pathname === '/garimpar' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<html><body style="background:#0a0a0a;color:#fff;font-family:sans-serif;padding:40px;text-align:center"><h2>🔍 Garimpo iniciado...</h2><p>Isso pode levar alguns minutos. Volte ao dashboard depois.</p><a href="/" style="color:#00C853">← Voltar ao dashboard</a></body></html>');
    executarGarimpo().catch(err => console.error('Erro no garimpo:', err));
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
    }));
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
  console.log(`🔎 Fontes ativas: ${fontesAtivas.join(', ')}\n`);
});

// Agendar execução diária
cron.schedule(config.cronSchedule, () => {
  console.log('\n⏰ Execução agendada disparada');
  executarGarimpo().catch(err => console.error('Erro no garimpo agendado:', err));
});

if (process.env.RUN_ON_START === 'true') {
  console.log('\n🚀 Executando garimpo inicial...');
  executarGarimpo().catch(err => console.error('Erro no garimpo inicial:', err));
}
