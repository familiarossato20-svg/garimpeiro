const config = require('./config');
const { buscarOLX } = require('./olx');
const { buscarMercadoLivre } = require('./mercadolivre');
const { buscarWebmotors } = require('./webmotors');
const { buscarLocaliza } = require('./localiza');
const { calcularMargem, removerDuplicatas } = require('./margem');
const { limparCache } = require('./fipe');
const axios = require('axios');

async function executarGarimpo() {
  const inicio = Date.now();
  console.log('\n========================================');
  console.log('GARIMPEIRO L-CAR — ' + new Date().toLocaleString('pt-BR'));
  console.log('========================================\n');

  limparCache();
  let todosAnuncios = [];
  const fontesUsadas = [];

  for (const modeloConfig of config.modelosPrioritarios) {
    console.log(`\n--- ${modeloConfig.marca} ${modeloConfig.modelo} (P${modeloConfig.prioridade}) ---`);

    if (config.fontes.olx) {
      try {
        const r = await buscarOLX(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...r);
        if (r.length > 0 && !fontesUsadas.includes('OLX')) fontesUsadas.push('OLX');
      } catch (err) { console.error('[ERR] OLX:', err.message); }
    }

    if (config.fontes.mercadolivre) {
      try {
        const r = await buscarMercadoLivre(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...r);
        if (r.length > 0 && !fontesUsadas.includes('MercadoLivre')) fontesUsadas.push('MercadoLivre');
      } catch (err) { console.error('[ERR] ML:', err.message); }
    }

    if (config.fontes.webmotors) {
      try {
        const r = await buscarWebmotors(modeloConfig.modelo, modeloConfig.marca);
        console.log(`[OK] WM: ${r.length} para ${modeloConfig.modelo}`);
        todosAnuncios.push(...r);
        if (r.length > 0 && !fontesUsadas.includes('Webmotors')) fontesUsadas.push('Webmotors');
      } catch (err) { console.error('[ERR] WM:', err.message); }
    }

    if (config.fontes.localiza) {
      try {
        const r = await buscarLocaliza(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...r);
        if (r.length > 0 && !fontesUsadas.includes('Localiza')) fontesUsadas.push('Localiza');
      } catch (err) { console.error('[ERR] Localiza:', err.message); }
    }

    await sleep(3000);
  }

  console.log(`\n=== TOTAL COLETADO: ${todosAnuncios.length} ===`);
  todosAnuncios = removerDuplicatas(todosAnuncios);
  console.log(`Apos duplicatas: ${todosAnuncios.length}`);
  const totalAnalisados = todosAnuncios.length;

  // Tentar calcular margem com FIPE
  let oportunidades = [];
  try {
    oportunidades = await calcularMargem(todosAnuncios);
    console.log(`Com margem FIPE >= R$${config.filtros.margemMinima}: ${oportunidades.length}`);
  } catch(err) {
    console.log('FIPE falhou: ' + err.message);
  }

  // Se FIPE nao retornou resultados, mostra todos os anuncios coletados
  if (oportunidades.length === 0 && todosAnuncios.length > 0) {
    console.log('FIPE sem resultados. Mostrando todos os anuncios sem margem...');
    oportunidades = todosAnuncios
      .sort((a, b) => a.preco - b.preco)
      .slice(0, 50)
      .map((item, i) => ({
        ...item,
        fipe: 0,
        codigoFipe: '',
        margemBruta: 0,
        margemLiquida: 0,
        percentualAbaixoFipe: 0,
        score: 50 - i,
        prioridadeModelo: 0,
      }));
  }

  const stats = { totalAnalisados, fontes: fontesUsadas };

  const fs = require('fs');
  if (!fs.existsSync('./resultados')) fs.mkdirSync('./resultados');
  fs.writeFileSync(
    `./resultados/garimpo-${new Date().toISOString().split('T')[0]}.json`,
    JSON.stringify({ data: new Date().toISOString(), totalAnalisados, oportunidades: oportunidades.slice(0, 50), stats }, null, 2)
  );

  const tempoTotal = Math.round((Date.now() - inicio) / 1000);
  console.log(`\nConcluido em ${tempoTotal}s | Analisados: ${totalAnalisados} | Oportunidades: ${oportunidades.length}\n`);
  return oportunidades;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
module.exports = { executarGarimpo };
