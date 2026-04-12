const config = require('./config');
const { buscarOLX } = require('./olx');
const { buscarMercadoLivre } = require('./mercadolivre');
const { buscarWebmotors } = require('./webmotors');
const { buscarLocaliza } = require('./localiza');
const { calcularMargem, removerDuplicatas } = require('./margem');
const { formatarRelatorio } = require('./relatorio');
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
    console.log(`\n--- Buscando: ${modeloConfig.marca} ${modeloConfig.modelo} (prioridade ${modeloConfig.prioridade}) ---`);

    if (config.fontes.olx) {
      try {
        const r = await buscarOLX(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...r);
        if (r.length > 0 && !fontesUsadas.includes('OLX')) fontesUsadas.push('OLX');
      } catch (err) { console.error('[GARIMPEIRO] Erro OLX:', err.message); }
    }

    if (config.fontes.mercadolivre) {
      try {
        const r = await buscarMercadoLivre(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...r);
        if (r.length > 0 && !fontesUsadas.includes('MercadoLivre')) fontesUsadas.push('MercadoLivre');
      } catch (err) { console.error('[GARIMPEIRO] Erro ML:', err.message); }
    }

    if (config.fontes.webmotors) {
      try {
        const r = await buscarWebmotors(modeloConfig.modelo, modeloConfig.marca);
        console.log(`[GARIMPEIRO] WM retornou ${r.length} para ${modeloConfig.modelo}`);
        todosAnuncios.push(...r);
        if (r.length > 0 && !fontesUsadas.includes('Webmotors')) fontesUsadas.push('Webmotors');
      } catch (err) { console.error('[GARIMPEIRO] Erro WM:', err.message); }
    }

    if (config.fontes.localiza) {
      try {
        const r = await buscarLocaliza(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...r);
        if (r.length > 0 && !fontesUsadas.includes('Localiza')) fontesUsadas.push('Localiza');
      } catch (err) { console.error('[GARIMPEIRO] Erro Localiza:', err.message); }
    }

    await sleep(3000);
  }

  console.log(`\n=== TOTAL COLETADO: ${todosAnuncios.length} anuncios ===`);
  console.log(`Fontes que retornaram dados: ${fontesUsadas.join(', ') || 'nenhuma'}`);

  if (todosAnuncios.length > 0) {
    console.log('Amostra primeiro anuncio:', JSON.stringify(todosAnuncios[0]).substring(0, 300));
  }

  todosAnuncios = removerDuplicatas(todosAnuncios);
  console.log(`Apos remover duplicatas: ${todosAnuncios.length}`);

  const totalAnalisados = todosAnuncios.length;

  console.log('\nCalculando margens com FIPE...');
  let oportunidades = [];
  try {
    oportunidades = await calcularMargem(todosAnuncios);
  } catch(err) {
    console.log('ERRO no calculo de margem: ' + err.message);
  }
  console.log(`Oportunidades com margem >= R$${config.filtros.margemMinima}: ${oportunidades.length}`);

  const stats = { totalAnalisados, fontes: fontesUsadas };
  const relatorio = formatarRelatorio(oportunidades, stats);

  const fs = require('fs');
  if (!fs.existsSync('./resultados')) fs.mkdirSync('./resultados');
  const resultado = {
    data: new Date().toISOString(),
    totalAnalisados,
    oportunidades: oportunidades.slice(0, 20),
    stats,
  };
  fs.writeFileSync(
    `./resultados/garimpo-${new Date().toISOString().split('T')[0]}.json`,
    JSON.stringify(resultado, null, 2)
  );

  const tempoTotal = Math.round((Date.now() - inicio) / 1000);
  console.log(`\nGarimpo concluido em ${tempoTotal} segundos`);
  console.log(`Total analisados: ${totalAnalisados}`);
  console.log(`Oportunidades: ${oportunidades.length}\n`);

  return oportunidades;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

module.exports = { executarGarimpo };
