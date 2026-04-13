const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');

const PROXY_URL = process.env.PROXY_URL || ''; // ex: https://garimpeiro-proxy.xxx.workers.dev
const PROXY_KEY = process.env.PROXY_KEY || 'garimpeiro-lcar-2026';

const ESTADOS_WM = {
  'SC': 'santa-catarina',
  'PR': 'parana',
  'RS': 'rio-grande-do-sul',
};

const MARCA_SLUG = {
  'VW': 'volkswagen',
  'Chevrolet': 'chevrolet',
  'Fiat': 'fiat',
  'Hyundai': 'hyundai',
  'Renault': 'renault',
  'Ford': 'ford',
  'Toyota': 'toyota',
  'Honda': 'honda',
  'Nissan': 'nissan',
  'Jeep': 'jeep',
  'Kia': 'kia',
};

function str(campo) {
  if (!campo) return '';
  if (typeof campo === 'string') return campo;
  if (typeof campo === 'object') return campo.Name || campo.Value || campo.name || campo.value || String(campo);
  return String(campo);
}

async function buscarWebmotors(modelo, marca) {
  const resultados = [];
  const marcaSlug = (MARCA_SLUG[marca] || marca).toLowerCase();
  const modeloSlug = modelo.toLowerCase().replace(/[-\s]+/g, '-');

  for (const estado of config.filtros.regioes) {
    const estadoSlug = ESTADOS_WM[estado];
    if (!estadoSlug) continue;

    try {
      const wmPageUrl = `https://www.webmotors.com.br/carros/estoque/${marcaSlug}/${modeloSlug}/${estadoSlug}`;
      let veiculos = [];

      if (PROXY_URL) {
        // VIA PROXY (Cloudflare Worker)
        veiculos = await buscarViaProxy(wmPageUrl, modeloSlug, estado);
      } else {
        // DIRETO (fallback — pode falhar do Railway)
        veiculos = await buscarDireto(wmPageUrl, modeloSlug, estado, marca, modelo);
      }

      resultados.push(...veiculos);
      if (veiculos.length > 0) {
        console.log(`[WM] ${marca} ${modelo} em ${estado}: ${veiculos.length} anuncios`);
      }

    } catch (err) {
      console.log(`[WM] Erro ${modelo} em ${estado}: ${err.message}`);
    }

    await sleep(2000);
  }

  return resultados;
}

/**
 * Busca via Cloudflare Worker proxy
 */
async function buscarViaProxy(wmPageUrl, modeloSlug, estadoSigla) {
  try {
    const { data } = await axios.get(`${PROXY_URL}/webmotors/api`, {
      params: {
        url: wmPageUrl,
        key: PROXY_KEY,
        perPage: 50,
      },
      timeout: 20000,
    });

    if (!data || !data.SearchResults || !data.SearchResults.length) return [];

    const modeloLower = modeloSlug.replace(/-/g, ' ');
    return data.SearchResults
      .filter(item => {
        const spec = item.Specification || item;
        const modelResult = str(spec.Model).toLowerCase();
        return modelResult.includes(modeloLower) || modeloLower.includes(modelResult);
      })
      .map(item => parseSearchResult(item, estadoSigla))
      .filter(a => a && a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);

  } catch (err) {
    console.log(`[WM-PROXY] Erro: ${err.message}`);
    return [];
  }
}

/**
 * Busca direta (sem proxy) — API + scraping Cheerio
 */
async function buscarDireto(wmPageUrl, modeloSlug, estadoSigla, marcaOriginal, modeloOriginal) {
  // Tenta API
  try {
    const { data } = await axios.get('https://www.webmotors.com.br/api/search/car', {
      params: { url: wmPageUrl, DisplayPerPage: 50, DisplayPage: 1 },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.webmotors.com.br/',
      },
      timeout: 15000,
    });

    if (data && data.SearchResults && data.SearchResults.length > 0) {
      const modeloLower = modeloSlug.replace(/-/g, ' ');
      const filtrados = data.SearchResults.filter(item => {
        const spec = item.Specification || item;
        const modelResult = str(spec.Model).toLowerCase();
        return modelResult.includes(modeloLower) || modeloLower.includes(modelResult);
      });

      if (filtrados.length > 0) {
        return filtrados
          .map(item => parseSearchResult(item, estadoSigla))
          .filter(a => a && a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);
      }
    }
  } catch (e) {
    // API falhou, tenta scraping
  }

  // Tenta scraping HTML
  try {
    const { data: html } = await axios.get(wmPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html',
      },
      timeout: 20000,
    });

    const $ = cheerio.load(html);
    const nextDataScript = $('script#__NEXT_DATA__').html();
    if (nextDataScript) {
      const nextData = JSON.parse(nextDataScript);
      const searchResults = nextData?.props?.pageProps?.searchResults
        || nextData?.props?.pageProps?.data?.SearchResults
        || nextData?.props?.pageProps?.SearchResults || [];

      if (searchResults.length > 0) {
        return searchResults
          .map(item => parseSearchResult(item, estadoSigla))
          .filter(a => a && a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);
      }
    }
  } catch (e) {
    // Scraping falhou
  }

  return [];
}

function parseSearchResult(item, estadoSigla) {
  try {
    const spec = item.Specification || item;
    const seller = item.Seller || {};
    const prices = item.Prices || spec.Prices || {};

    const makeName = str(spec.Make) || str(item.Make) || '';
    const modelName = str(spec.Model) || str(item.Model) || '';
    const version = str(spec.Version) || str(item.Version) || '';

    const preco = prices.Price || prices.SearchPrice || spec.Price || item.Price || 0;
    const ano = parseInt(spec.YearFabrication || spec.YearModel || item.YearFabrication || item.YearModel) || 0;
    const km = spec.Odometer || item.Odometer || 0;
    const cidade = str(seller.City) || '';
    const uniqueId = item.UniqueId || spec.UniqueId || '';
    const cor = str(spec.Color && spec.Color.Primary ? spec.Color.Primary : spec.Color) || '';
    const combustivel = str(spec.Fuel) || '';
    const cambio = str(spec.Transmission) || '';

    if (!preco || preco <= 0) return null;

    return {
      fonte: 'Webmotors',
      titulo: (makeName + ' ' + modelName + ' ' + version).trim() || spec.Title || '',
      marca: makeName,
      modelo: modelName,
      ano: ano,
      preco: preco,
      km: km ? Math.round(km) + ' km' : '',
      cidade: cidade,
      estado: estadoSigla,
      link: uniqueId ? 'https://www.webmotors.com.br/comprar/' + uniqueId : '',
      particular: seller.SellerType === 'PF',
      dataAnuncio: '',
      imagem: item.PhotoPath || '',
      cor: cor,
      combustivel: combustivel,
      cambio: cambio,
    };
  } catch (e) {
    return null;
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { buscarWebmotors };
