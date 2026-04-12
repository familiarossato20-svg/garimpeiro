const axios = require('axios');

const FIPE_API = 'https://parallelum.com.br/fipe/api/v2';

// Cache de consultas FIPE pra não bater na API toda hora
const cache = new Map();

// Mapeamento de marcas para IDs da FIPE
const marcasFipe = {};

async function carregarMarcas() {
  if (Object.keys(marcasFipe).length > 0) return;
  
  try {
    const { data } = await axios.get(`${FIPE_API}/cars/brands`);
    data.forEach(m => {
      marcasFipe[m.name.toLowerCase()] = m.code;
    });
    console.log(`[FIPE] ${Object.keys(marcasFipe).length} marcas carregadas`);
  } catch (err) {
    console.error('[FIPE] Erro ao carregar marcas:', err.message);
  }
}

async function buscarModelos(marcaCodigo) {
  const cacheKey = `modelos_${marcaCodigo}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const { data } = await axios.get(`${FIPE_API}/cars/brands/${marcaCodigo}/models`);
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[FIPE] Erro modelos marca ${marcaCodigo}:`, err.message);
    return [];
  }
}

async function buscarAnos(marcaCodigo, modeloCodigo) {
  const cacheKey = `anos_${marcaCodigo}_${modeloCodigo}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const { data } = await axios.get(`${FIPE_API}/cars/brands/${marcaCodigo}/models/${modeloCodigo}/years`);
    cache.set(cacheKey, data);
    return data;
  } catch (err) {
    console.error(`[FIPE] Erro anos ${marcaCodigo}/${modeloCodigo}:`, err.message);
    return [];
  }
}

async function consultarPrecoFipe(marcaNome, modeloNome, ano) {
  const cacheKey = `preco_${marcaNome}_${modeloNome}_${ano}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    await carregarMarcas();

    // Encontrar marca
    const marcaLower = marcaNome.toLowerCase();
    let marcaCodigo = null;
    
    for (const [nome, codigo] of Object.entries(marcasFipe)) {
      if (nome.includes(marcaLower) || marcaLower.includes(nome)) {
        marcaCodigo = codigo;
        break;
      }
    }

    if (!marcaCodigo) {
      console.log(`[FIPE] Marca não encontrada: ${marcaNome}`);
      return null;
    }

    // Encontrar modelo
    const modelos = await buscarModelos(marcaCodigo);
    const modeloLower = modeloNome.toLowerCase();
    
    let modeloEncontrado = modelos.find(m => 
      m.name.toLowerCase().includes(modeloLower) || 
      modeloLower.includes(m.name.toLowerCase())
    );

    if (!modeloEncontrado) {
      // Tenta match parcial (primeira palavra)
      const primeiraPalavra = modeloLower.split(' ')[0];
      modeloEncontrado = modelos.find(m => 
        m.name.toLowerCase().includes(primeiraPalavra)
      );
    }

    if (!modeloEncontrado) {
      console.log(`[FIPE] Modelo não encontrado: ${modeloNome}`);
      return null;
    }

    // Encontrar ano
    const anos = await buscarAnos(marcaCodigo, modeloEncontrado.code);
    const anoStr = String(ano);
    
    let anoEncontrado = anos.find(a => a.name.includes(anoStr));
    
    if (!anoEncontrado && anos.length > 0) {
      // Pega o ano mais próximo
      anoEncontrado = anos[0]; // mais recente
    }

    if (!anoEncontrado) {
      console.log(`[FIPE] Ano não encontrado: ${ano}`);
      return null;
    }

    // Buscar preço
    const { data } = await axios.get(
      `${FIPE_API}/cars/brands/${marcaCodigo}/models/${modeloEncontrado.code}/years/${anoEncontrado.code}`
    );

    const preco = parseInt(data.price.replace(/[^\d]/g, '')) / 100;
    
    const resultado = {
      marca: data.brand,
      modelo: data.model,
      ano: data.modelYear,
      combustivel: data.fuel,
      codigoFipe: data.codeFipe,
      mesReferencia: data.referenceMonth,
      preco: preco,
    };

    cache.set(cacheKey, resultado);
    console.log(`[FIPE] ${resultado.marca} ${resultado.modelo} ${resultado.ano}: R$ ${preco.toLocaleString('pt-BR')}`);
    
    return resultado;
  } catch (err) {
    console.error(`[FIPE] Erro consulta ${marcaNome} ${modeloNome} ${ano}:`, err.message);
    return null;
  }
}

// Limpar cache (chamar 1x por dia)
function limparCache() {
  cache.clear();
  console.log('[FIPE] Cache limpo');
}

module.exports = {
  consultarPrecoFipe,
  limparCache,
  carregarMarcas,
};
