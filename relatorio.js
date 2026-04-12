const config = require('./config');

/**
 * Formata o relatório diário de oportunidades
 */
function formatarRelatorio(oportunidades, stats) {
  if (oportunidades.length === 0) {
    return `🔍 *GARIMPEIRO L-CAR — ${dataHoje()}*\n\n` +
      `Nenhuma oportunidade com margem acima de R$ ${config.filtros.margemMinima.toLocaleString('pt-BR')} encontrada hoje.\n\n` +
      `📊 Analisados: ${stats.totalAnalisados} anúncios\n` +
      `🔎 Fontes: ${stats.fontes.join(', ')}\n` +
      `📍 Regiões: ${config.filtros.regioes.join(', ')}`;
  }

  let msg = `🏆 *GARIMPEIRO L-CAR — ${dataHoje()}*\n`;
  msg += `*Top ${Math.min(oportunidades.length, 10)} oportunidades do dia*\n\n`;

  const top10 = oportunidades.slice(0, 10);

  top10.forEach((op, i) => {
    const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    
    msg += `${emoji} *${op.titulo || `${op.marca} ${op.modelo} ${op.ano}`}*\n`;
    msg += `📍 ${op.cidade} - ${op.estado}\n`;
    msg += `💰 Pedindo: *R$ ${op.preco.toLocaleString('pt-BR')}*\n`;
    msg += `📊 FIPE: R$ ${op.fipe.toLocaleString('pt-BR')}\n`;
    msg += `🔥 Margem: *R$ ${op.margemLiquida.toLocaleString('pt-BR')}* (${op.percentualAbaixoFipe}% abaixo)\n`;
    if (op.km) msg += `🛣️ KM: ${op.km}\n`;
    msg += `📱 Fonte: ${op.fonte}\n`;
    msg += `🔗 ${op.link}\n`;
    msg += `\n`;
  });

  msg += `——————————————\n`;
  msg += `📊 *Resumo:*\n`;
  msg += `• Analisados: ${stats.totalAnalisados} anúncios\n`;
  msg += `• Com margem ≥ R$ ${config.filtros.margemMinima.toLocaleString('pt-BR')}: ${oportunidades.length}\n`;
  msg += `• Melhor margem: R$ ${oportunidades[0].margemLiquida.toLocaleString('pt-BR')}\n`;
  msg += `• Fontes: ${stats.fontes.join(', ')}\n`;
  msg += `• Regiões: ${config.filtros.regioes.join(', ')}\n`;
  msg += `• Filtro: ${config.filtros.anoMinimo}+ | R$${(config.filtros.precoMin/1000)}k-${(config.filtros.precoMax/1000)}k | Particular`;

  return msg;
}

/**
 * Formata mensagem resumida pra cada oportunidade individual (pra mandar separado se quiser)
 */
function formatarOportunidade(op) {
  return `🔥 *OPORTUNIDADE: ${op.marca} ${op.modelo} ${op.ano}*\n\n` +
    `📍 ${op.cidade} - ${op.estado}\n` +
    `💰 Preço: R$ ${op.preco.toLocaleString('pt-BR')}\n` +
    `📊 FIPE: R$ ${op.fipe.toLocaleString('pt-BR')}\n` +
    `✅ Margem líquida: *R$ ${op.margemLiquida.toLocaleString('pt-BR')}*\n` +
    `📉 ${op.percentualAbaixoFipe}% abaixo da FIPE\n` +
    (op.km ? `🛣️ KM: ${op.km}\n` : '') +
    `📱 ${op.fonte}\n` +
    `🔗 ${op.link}`;
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
