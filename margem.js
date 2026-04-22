const config = require('./config');
const { consultarPrecoFipe, statusAPIs } = require('./fipe');

const FIPE_FALHA_THRESHOLD = 0.8;

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

  // AGRUPAR por marca+modelo+ano — consulta FIPE 1x por grupo, não 1x por anúncio
  const grupos = {};
  for (const a of anuncios) {
    const key = `${(a.marca||'').toLowerCase()}_${(a.modelo||'').toLowerCase()}_${a.ano}`;
    if (!grupos[key]) grupos[key] = { marca: a.marca, modelo: a.modelo, ano: a.ano, titulo: a.titulo, anuncios: [] };
    grupos[key].anuncios.push(a);
  }

  const grupoKeys = Object.keys(grupos);
  console.log(`[MARGEM] ${anuncios.length} anúncios em ${grupoKeys.length} grupos marca+modelo+ano`);

  // Processar grupos em batches de 5 em paralelo
  const BATCH_SIZE = 5;
  let fipeConsultas = 0;
  let fipeFalhas = 0;

  for (let i = 0; i < grupoKeys.length; i += BATCH_SIZE) {
    const batch = grupoKeys.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(batch.map(async (key) => {
      const grupo = grupos[key];
      fipeConsultas++;

      try {
        const fipe = await consultarPrecoFipe(grupo.marca, grupo.modelo, grupo.ano, grupo.titulo);

        if (!fipe || !fipe.preco) {
          fipeFalhas++;
          return { grupo, fipe: null };
        }
        return { grupo, fipe };
      } catch (err) {
        fipeFalhas++;
        return { grupo, fipe: null };
      }
    }));

    // Aplicar resultado FIPE a todos os anúncios do grupo
    for (const { grupo, fipe } of results) {
      for (const anuncio of grupo.anuncios) {
        if (!fipe) {
          semMargem.push({
            ...anuncio, fipe: 0, codigoFipe: '', margemBruta: 0, margemLiquida: 0,
            percentualAbaixoFipe: 0, score: 0, prioridadeModelo: getPrioridade(anuncio), semFipe: true,
          });
          continue;
        }

        const margemBruta = fipe.preco - anuncio.preco;
        const margemLiquida = margemBruta - config.filtros.custoPreparacao;
        const percentualAbaixoFipe = ((fipe.preco - anuncio.preco) / fipe.preco) * 100;

        if (margemLiquida < config.filtros.margemMinima) continue;

        const prioridadeNum = getPrioridade(anuncio);
        const prioridadeBonus = prioridadeNum > 0 ? (4 - prioridadeNum) * 10 : 0;
        const score = Math.round(
          (margemLiquida / 1000) * 3 + percentualAbaixoFipe * 2 + prioridadeBonus
        );

        comMargem.push({
          ...anuncio, fipe: fipe.preco, codigoFipe: fipe.codigoFipe,
          margemBruta, margemLiquida,
          percentualAbaixoFipe: Math.round(percentualAbaixoFipe * 10) / 10,
          score, prioridadeModelo: prioridadeNum, semFipe: false,
        });
      }
    }

    // Log progresso
    const done = Math.min(i + BATCH_SIZE, grupoKeys.length);
    if (done % 10 === 0 || done === grupoKeys.length) {
      console.log(`[MARGEM] FIPE: ${done}/${grupoKeys.length} grupos processados`);
    }
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
