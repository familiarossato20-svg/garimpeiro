const axios = require('axios');
const config = require('./config');

// Cache de consultas FIPE pra não bater na API toda hora
const cache = new Map();

// Mapeamento de marcas para IDs da FIPE (carregado dinamicamente)
const marcasFipe = {};

// Qual API está funcionando (detectado automaticamente)
let apiAtiva = null;
let apiFalhas = new Set();

// ============================================================
// CONFIGURAÇÃO DAS APIs
// ============================================================

const APIs = {
  appspot: {
    name: 'FipeAPI AppSpot',
    base: 'https://fipeapi.appspot.com/api/1',
    marcas: () => `https://fipeapi.appspot.com/api/1/carros/marcas.json`,
    modelos: (marcaId) => `https://fipeapi.appspot.com/api/1/carros/veiculos/${marcaId}.json`,
    anos: (marcaId, modeloId) => `https://fipeapi.appspot.com/api/1/carros/veiculo/${marcaId}/${modeloId}.json`,
    preco: (marcaId, modeloId, anoId) => `https://fipeapi.appspot.com/api/1/carros/veiculo/${marcaId}/${modeloId}/${anoId}.json`,
    parseMarcas: (data) => data.map(m => ({ code: String(m.id), name: m.fipe_name || m.name })),
    parseModelos: (data) => data.map(m => ({ code: String(m.id), name: m.fipe_name || m.name })),
    parseAnos: (data) => data.map(a => ({ code: a.id || a.fipe_codigo, name: a.name })),
    parsePreco: (data) => {
      const precoStr = data.preco || data.price || '';
      return {
        brand: data.marca || '',
        model: data.veiculo || data.name || '',
        modelYear: data.ano_modelo || 0,
        fuel: data.combustivel || '',
        codeFipe: data.fipe_codigo || '',
        referenceMonth: data.referencia || '',
        price: precoStr,
      };
    },
  },
  parallelum: {
    name: 'Parallelum',
    base: 'https://parallelum.com.br/fipe/api/v2',
    marcas: () => `https://parallelum.com.br/fipe/api/v2/cars/brands`,
    modelos: (marcaId) => `https://parallelum.com.br/fipe/api/v2/cars/brands/${marcaId}/models`,
    anos: (marcaId, modeloId) => `https://parallelum.com.br/fipe/api/v2/cars/brands/${marcaId}/models/${modeloId}/years`,
    preco: (marcaId, modeloId, anoId) => `https://parallelum.com.br/fipe/api/v2/cars/brands/${marcaId}/models/${modeloId}/years/${anoId}`,
    parseMarcas: (data) => data.map(m => ({ code: String(m.code), name: m.name })),
    parseModelos: (data) => data.map(m => ({ code: String(m.code), name: m.name })),
    parseAnos: (data) => data.map(a => ({ code: a.code, name: a.name })),
    parsePreco: (data) => ({
      brand: data.brand || '',
      model: data.model || '',
      modelYear: data.modelYear || 0,
      fuel: data.fuel || '',
      codeFipe: data.codeFipe || '',
      referenceMonth: data.referenceMonth || '',
      price: data.price || '',
    }),
  },
};

// Ordem de tentativa
const apiOrdem = ['appspot', 'parallelum'];

// ============================================================
// FUNÇÕES PRINCIPAIS
// ============================================================

async function fetchComFallback(urlFn, parseFn) {
  // Se já sabemos qual API funciona, tenta ela primeiro
  const ordem = apiAtiva ? [apiAtiva, ...apiOrdem.filter(a => a !== apiAtiva)] : apiOrdem;

  for (const apiKey of ordem) {
    if (apiFalhas.has(apiKey)) continue;

    const api = APIs[apiKey];
    const url = urlFn(api);

    try {
      const { data } = await axios.get(url, {
        timeout: 10000,
        headers: { 'Accept': 'application/json' },
      });

      // Se chegou aqui, essa API funciona
      if (!apiAtiva || apiAtiva !== apiKey) {
        console.log(`[FIPE] API ativa: ${api.name}`);
        apiAtiva = apiKey;
      }

      return parseFn(api, data);
    } catch (err) {
      console.log(`[FIPE] ${api.name} falhou: ${err.message}`);
      if (err.response?.status === 403 || err.response?.status === 429) {
        apiFalhas.add(apiKey);
        console.log(`[FIPE] ${api.name} bloqueada — removida das tentativas`);
      }
    }
  }

  return null;
}

async function carregarMarcas() {
  if (Object.keys(marcasFipe).length > 0) return true;

  const resultado = await fetchComFallback(
    (api) => api.marcas(),
    (api, data) => api.parseMarcas(data)
  );

  if (!resultado) {
    console.error('[FIPE] TODAS as APIs falharam ao carregar marcas');
    return false;
  }

  resultado.forEach(m => {
    marcasFipe[m.name.toLowerCase()] = m.code;
  });

  console.log(`[FIPE] ${Object.keys(marcasFipe).length} marcas carregadas`);
  return true;
}

async function buscarModelos(marcaCodigo) {
  const cacheKey = `modelos_${marcaCodigo}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const resultado = await fetchComFallback(
    (api) => api.modelos(marcaCodigo),
    (api, data) => api.parseModelos(data)
  );

  if (resultado) cache.set(cacheKey, resultado);
  return resultado || [];
}

async function buscarAnos(marcaCodigo, modeloCodigo) {
  const cacheKey = `anos_${marcaCodigo}_${modeloCodigo}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  const resultado = await fetchComFallback(
    (api) => api.anos(marcaCodigo, modeloCodigo),
    (api, data) => api.parseAnos(data)
  );

  if (resultado) cache.set(cacheKey, resultado);
  return resultado || [];
}

async function consultarPrecoFipe(marcaNome, modeloNome, ano) {
  const cacheKey = `preco_${marcaNome}_${modeloNome}_${ano}`;
  if (cache.has(cacheKey)) return cache.get(cacheKey);

  try {
    const marcasOk = await carregarMarcas();
    if (!marcasOk) return null;

    // Encontrar marca
    const marcaLower = marcaNome.toLowerCase();
    let marcaCodigo = null;

    // Mapeamento de nomes comuns para nomes FIPE
    const aliasesMarca = {
      'vw': 'volkswagen',
      'volkswagen': 'volkswagen',
      'chevrolet': 'gm - chevrolet',
      'gm': 'gm - chevrolet',
    };

    const marcaBusca = aliasesMarca[marcaLower] || marcaLower;

    for (const [nome, codigo] of Object.entries(marcasFipe)) {
      if (nome.includes(marcaBusca) || marcaBusca.includes(nome) || nome.includes(marcaLower)) {
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

    let anoEncontrado = anos.find(a => a.name && a.name.includes(anoStr));

    if (!anoEncontrado && anos.length > 0) {
      // Pega o ano mais próximo
      anoEncontrado = anos[0];
    }

    if (!anoEncontrado) {
      console.log(`[FIPE] Ano não encontrado: ${ano}`);
      return null;
    }

    // Buscar preço
    const precoData = await fetchComFallback(
      (api) => api.preco(marcaCodigo, modeloEncontrado.code, anoEncontrado.code),
      (api, data) => api.parsePreco(data)
    );

    if (!precoData || !precoData.price) {
      console.log(`[FIPE] Sem preço para ${marcaNome} ${modeloNome} ${ano}`);
      return null;
    }

    // Parse do preço (R$ 23.055,00 → 23055)
    const precoStr = String(precoData.price);
    let preco = 0;

    if (precoStr.includes(',')) {
      // Formato BR: R$ 23.055,00
      preco = parseInt(precoStr.replace(/[^\d,]/g, '').replace(',', '.'));
    } else {
      // Formato numérico
      preco = parseInt(precoStr.replace(/[^\d]/g, ''));
      if (preco > 1000000) preco = preco / 100; // Se veio em centavos
    }

    const resultado = {
      marca: precoData.brand,
      modelo: precoData.model,
      ano: precoData.modelYear || ano,
      combustivel: precoData.fuel,
      codigoFipe: precoData.codeFipe,
      mesReferencia: precoData.referenceMonth,
      preco: preco,
    };

    cache.set(cacheKey, resultado);
    console.log(`[FIPE] ${resultado.marca || marcaNome} ${resultado.modelo || modeloNome} ${ano}: R$ ${preco.toLocaleString('pt-BR')}`);

    return resultado;
  } catch (err) {
    console.error(`[FIPE] Erro consulta ${marcaNome} ${modeloNome} ${ano}:`, err.message);
    return null;
  }
}

// Limpar cache (chamar 1x por dia)
function limparCache() {
  cache.clear();
  apiFalhas.clear();
  apiAtiva = null;
  console.log('[FIPE] Cache e estado de APIs limpos');
}

// Status das APIs (pra debug)
function statusAPIs() {
  return {
    apiAtiva: apiAtiva ? APIs[apiAtiva].name : 'Nenhuma',
    bloqueadas: [...apiFalhas].map(k => APIs[k]?.name || k),
    cacheSize: cache.size,
  };
}

module.exports = {
  consultarPrecoFipe,
  limparCache,
  carregarMarcas,
  statusAPIs,
};
