const config = require('./config');
const { consultarPrecoFipe } = require('./fipe');

/**
 * Calcula margem e score de cada oportunidade
 * 
 * Score leva em conta:
 * - Margem absoluta (quanto dinheiro)
 * - % abaixo da FIPE (quanto % tá abaixo do mercado)
 * - Prioridade do modelo (demanda na região)
 * - KM (quanto menor, melhor)
 */
async function calcularMargem(anuncios) {
  const oportunidades = [];

  for (const anuncio of anuncios) {
    try {
      // Consultar FIPE
      const fipe = await consultarPrecoFipe(anuncio.marca, anuncio.modelo, anuncio.ano);
      
      if (!fipe || !fipe.preco) {
        continue; // Sem FIPE, não dá pra calcular margem
      }

      // Calcular margem
      const margemBruta = fipe.preco - anuncio.preco;
      const margemLiquida = margemBruta - config.filtros.custoPreparacao;
      const percentualAbaixoFipe = ((fipe.preco - anuncio.preco) / fipe.preco) * 100;

      // Filtrar pela margem mínima
      if (margemLiquida < config.filtros.margemMinima) {
        continue;
      }

      // Calcular score composto
      const modeloPrioridade = config.modelosPrioritarios.find(m => 
        anuncio.modelo.toLowerCase().includes(m.modelo.toLowerCase()) ||
        m.modelo.toLowerCase().includes(anuncio.modelo.toLowerCase())
      );

      const prioridadeBonus = modeloPrioridade 
        ? (4 - modeloPrioridade.prioridade) * 10 // prioridade 1 = +30, 2 = +20, 3 = +10
        : 0;

      // Score: margem + % abaixo FIPE + prioridade do modelo
      const score = Math.round(
        (margemLiquida / 1000) * 3 +     // R$10k margem = 30 pontos
        percentualAbaixoFipe * 2 +         // 20% abaixo = 40 pontos
        prioridadeBonus                    // modelo popular = +30 pontos
      );

      oportunidades.push({
        ...anuncio,
        fipe: fipe.preco,
        codigoFipe: fipe.codigoFipe,
        margemBruta,
        margemLiquida,
        percentualAbaixoFipe: Math.round(percentualAbaixoFipe * 10) / 10,
        score,
        prioridadeModelo: modeloPrioridade?.prioridade || 0,
      });

    } catch (err) {
      console.error(`[MARGEM] Erro ${anuncio.titulo}: ${err.message}`);
    }

    // Pequeno delay pra não sobrecarregar a API FIPE
    await sleep(500);
  }

  // Ordenar por score (maior primeiro)
  oportunidades.sort((a, b) => b.score - a.score);

  return oportunidades;
}

/**
 * Remove duplicatas (mesmo carro em fontes diferentes)
 */
function removerDuplicatas(anuncios) {
  const vistos = new Set();
  
  return anuncios.filter(a => {
    // Chave: modelo + ano + preço (com tolerância de R$500)
    const precoArredondado = Math.round(a.preco / 500) * 500;
    const chave = `${a.modelo}_${a.ano}_${precoArredondado}_${a.cidade}`;
    
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { calcularMargem, removerDuplicatas };
