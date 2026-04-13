const config = require('./config');

/**
 * Formata o relatório diário de oportunidades
 */
function formatarRelatorio(oportunidades, stats) {
  if (oportunidades.length === 0) {
    return `🔍 *GARIMPEIRO L-CAR — ${dataHoje()}*\n\n` +
      `Nenhuma oportunidade encontrada hoje.\n\n` +
      `📊 Analisados: ${stats.totalAnalisados} anúncios\n` +
      `🔎 Fontes: ${stats.fontes.join(', ') || 'nenhuma'}\n` +
      `📍 Regiões: ${config.filtros.regioes.join(', ')}`;
  }

  const modoFallback = oportunidades[0]?.semFipe;

  let msg = `🏆 *GARIMPEIRO L-CAR — ${dataHoje()}*\n`;

  if (modoFallback) {
    msg += `⚠️ *FIPE indisponível — anúncios sem cálculo de margem*\n`;
    msg += `*Top ${Math.min(oportunidades.length, 15)} anúncios do dia*\n\n`;
  } else {
    msg += `*Top ${Math.min(oportunidades.length, 10)} oportunidades do dia*\n\n`;
  }

  const topN = oportunidades.slice(0, modoFallback ? 15 : 10);

  topN.forEach((op, i) => {
    const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    const titulo = op.titulo || `${op.marca} ${op.modelo} ${op.ano || ''}`.trim();

    msg += `${emoji} *${titulo}*\n`;
    if (op.cidade || op.estado) msg += `📍 ${op.cidade || '?'} - ${op.estado || '?'}\n`;
    msg += `💰 Preço: *R$ ${op.preco.toLocaleString('pt-BR')}*\n`;

    if (!op.semFipe) {
      msg += `📊 FIPE: R$ ${op.fipe.toLocaleString('pt-BR')}\n`;
      msg += `🔥 Margem: *R$ ${op.margemLiquida.toLocaleString('pt-BR')}* (${op.percentualAbaixoFipe}% abaixo)\n`;
    }

    if (op.km) msg += `🛣️ KM: ${op.km}\n`;
    msg += `📱 Fonte: ${op.fonte}\n`;
    if (op.link) msg += `🔗 ${op.link}\n`;
    msg += `\n`;
  });

  msg += `——————————————\n`;
  msg += `📊 *Resumo:*\n`;
  msg += `• Analisados: ${stats.totalAnalisados} anúncios\n`;

  if (!modoFallback) {
    msg += `• Com margem ≥ R$ ${config.filtros.margemMinima.toLocaleString('pt-BR')}: ${oportunidades.length}\n`;
    msg += `• Melhor margem: R$ ${oportunidades[0].margemLiquida.toLocaleString('pt-BR')}\n`;
  } else {
    msg += `• Listados: ${oportunidades.length} (sem filtro de margem — FIPE indisponível)\n`;
  }

  msg += `• Fontes: ${stats.fontes.join(', ') || 'nenhuma'}\n`;
  msg += `• Regiões: ${config.filtros.regioes.join(', ')}\n`;
  msg += `• Filtro: ${config.filtros.anoMinimo}+ | R$${(config.filtros.precoMin/1000)}k-${(config.filtros.precoMax/1000)}k | Particular`;

  return msg;
}

/**
 * Formata mensagem resumida pra cada oportunidade individual
 */
function formatarOportunidade(op) {
  const titulo = op.titulo || `${op.marca} ${op.modelo} ${op.ano || ''}`.trim();

  let msg = `🔥 *OPORTUNIDADE: ${titulo}*\n\n`;
  if (op.cidade || op.estado) msg += `📍 ${op.cidade || '?'} - ${op.estado || '?'}\n`;
  msg += `💰 Preço: R$ ${op.preco.toLocaleString('pt-BR')}\n`;

  if (!op.semFipe) {
    msg += `📊 FIPE: R$ ${op.fipe.toLocaleString('pt-BR')}\n`;
    msg += `✅ Margem líquida: *R$ ${op.margemLiquida.toLocaleString('pt-BR')}*\n`;
    msg += `📉 ${op.percentualAbaixoFipe}% abaixo da FIPE\n`;
  }

  if (op.km) msg += `🛣️ KM: ${op.km}\n`;
  msg += `📱 ${op.fonte}\n`;
  if (op.link) msg += `🔗 ${op.link}`;

  return msg;
}

function dataHoje() {
  return new Date().toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

module.exports = { formatarRelatorio, formatarOportunidade };
