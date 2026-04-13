const config = require('./config');
const { consultarPrecoFipe, statusAPIs } = require('./fipe');

// Contador de falhas FIPE pra decidir se entra em modo fallback
let fipeFalhas = 0;
let fipeConsultas = 0;
const FIPE_FALHA_THRESHOLD = 0.8; // Se 80%+ falhar, entra em modo sem FIPE

/**
 * Calcula margem e score de cada oportunidade
 * 
 * MODO NORMAL: Consulta FIPE, calcula margem, filtra por margemMinima
 * MODO FALLBACK: Se FIPE falhar em 80%+ das consultas, mostra TODOS os resultados
 *                ordenados por prioridade do modelo (sem cálculo de margem)
 */
async function calcularMargem(anuncios) {
  const comMargem = [];
  const semMargem = [];

  fipeFalhas = 0;
  fipeConsultas = 0;

  for (const anuncio of anuncios) {
    try {
      fipeConsultas++;

      // Consultar FIPE
      const fipe = await consultarPrecoFipe(anuncio.marca, anuncio.modelo, anuncio.ano);

      if (!fipe || !fipe.preco) {
        fipeFalhas++;
        // Guarda pra modo fallback
        semMargem.push({
          ...anuncio,
          fipe: 0,
          codigoFipe: '',
          margemBruta: 0,
          margemLiquida: 0,
          percentualAbaixoFipe: 0,
          score: 0,
          prioridadeModelo: getPrioridade(anuncio),
          semFipe: true,
        });
        continue;
      }

      // Calcular margem
      const margemBruta = fipe.preco - anuncio.preco;
      const margemLiquida = margemBruta - config.filtros.custoPreparacao;
      const percentualAbaixoFipe = ((fipe.preco - anuncio.preco) / fipe.preco) * 100;

      // Se margem negativa ou abaixo do mínimo, descarta
      if (margemLiquida < config.filtros.margemMinima) {
        continue;
      }

      // Calcular score composto
      const prioridadeNum = getPrioridade(anuncio);
      const prioridadeBonus = prioridadeNum > 0 ? (4 - prioridadeNum) * 10 : 0;

      const score = Math.round(
        (margemLiquida / 1000) * 3 +     // R$10k margem = 30 pontos
        percentualAbaixoFipe * 2 +         // 20% abaixo = 40 pontos
        prioridadeBonus                    // modelo popular = +30 pontos
      );

      comMargem.push({
        ...anuncio,
        fipe: fipe.preco,
        codigoFipe: fipe.codigoFipe,
        margemBruta,
        margemLiquida,
        percentualAbaixoFipe: Math.round(percentualAbaixoFipe * 10) / 10,
        score,
        prioridadeModelo: prioridadeNum,
        semFipe: false,
      });

    } catch (err) {
      console.error(`[MARGEM] Erro ${anuncio.titulo}: ${err.message}`);
      fipeFalhas++;
    }

    // Delay pra não sobrecarregar a API FIPE
    await sleep(500);
  }

  // Decidir modo
  const taxaFalha = fipeConsultas > 0 ? fipeFalhas / fipeConsultas : 1;

  if (comMargem.length > 0) {
    // Modo normal: tem resultados com FIPE
    console.log(`[MARGEM] Modo FIPE: ${comMargem.length} oportunidades (${fipeFalhas}/${fipeConsultas} falhas FIPE)`);
    comMargem.sort((a, b) => b.score - a.score);
    return comMargem;
  }

  if (taxaFalha >= FIPE_FALHA_THRESHOLD && semMargem.length > 0) {
    // Modo fallback: FIPE falhou demais, mostra tudo sem margem
    console.log(`[MARGEM] ⚠️ MODO FALLBACK (FIPE ${Math.round(taxaFalha * 100)}% falhas) — mostrando ${semMargem.length} anúncios SEM cálculo de margem`);
    console.log(`[MARGEM] Status APIs: ${JSON.stringify(statusAPIs())}`);

    // Ordena por prioridade do modelo, depois por menor preço
    semMargem.sort((a, b) => {
      if (a.prioridadeModelo !== b.prioridadeModelo) {
        return (a.prioridadeModelo || 99) - (b.prioridadeModelo || 99);
      }
      return a.preco - b.preco;
    });

    return semMargem;
  }

  // Nenhum resultado
  console.log(`[MARGEM] Nenhuma oportunidade encontrada (${fipeConsultas} consultados, ${fipeFalhas} falhas FIPE)`);
  return [];
}

/**
 * Retorna a prioridade do modelo (1=alta, 2=média, 3=alta margem, 0=não listado)
 */
function getPrioridade(anuncio) {
  const modeloPrioridade = config.modelosPrioritarios.find(m =>
    anuncio.modelo.toLowerCase().includes(m.modelo.toLowerCase()) ||
    m.modelo.toLowerCase().includes(anuncio.modelo.toLowerCase())
  );
  return modeloPrioridade?.prioridade || 0;
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
