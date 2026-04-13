const axios = require('axios');
const cheerio = require('cheerio');
const config = require('./config');

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
      // ESTRATÉGIA 1: API com url= param
      let veiculos = await tentarAPI(marcaSlug, modeloSlug, estadoSlug, estado);

      // ESTRATÉGIA 2: Scraping HTML com Cheerio (fallback)
      if (veiculos.length === 0) {
        veiculos = await tentarScraping(marcaSlug, modeloSlug, estadoSlug, estado, marca, modelo);
      }

      resultados.push(...veiculos);
      console.log(`[WM] ${marca} ${modelo} em ${estado}: ${veiculos.length} anuncios`);

    } catch (err) {
      console.log(`[WM] Erro ${modelo} em ${estado}: ${err.message}`);
    }

    await sleep(2000);
  }

  return resultados;
}

async function tentarAPI(marcaSlug, modeloSlug, estadoSlug, estadoSigla) {
  try {
    const wmUrl = `https://www.webmotors.com.br/carros/estoque/${marcaSlug}/${modeloSlug}/${estadoSlug}`;

    const { data } = await axios.get('https://www.webmotors.com.br/api/search/car', {
      params: {
        url: wmUrl,
        DisplayPerPage: 50,
        DisplayPage: 1,
      },
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.webmotors.com.br/',
      },
      timeout: 15000,
    });

    if (!data || !data.SearchResults || !data.SearchResults.length) return [];

    // Filtrar resultados que realmente batem com o modelo buscado
    const modeloLower = modeloSlug.replace(/-/g, ' ');
    const filtrados = data.SearchResults.filter(item => {
      const spec = item.Specification || item;
      const modelResult = str(spec.Model).toLowerCase();
      return modelResult.includes(modeloLower) || modeloLower.includes(modelResult);
    });

    return filtrados
      .map(item => parseSearchResult(item, estadoSigla))
      .filter(a => a && a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);
  } catch (err) {
    console.log(`[WM-API] Falhou: ${err.message}`);
    return [];
  }
}

async function tentarScraping(marcaSlug, modeloSlug, estadoSlug, estadoSigla, marcaOriginal, modeloOriginal) {
  try {
    const url = `https://www.webmotors.com.br/carros/estoque/${marcaSlug}/${modeloSlug}/${estadoSlug}`;

    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
        'Referer': 'https://www.webmotors.com.br/',
      },
      timeout: 20000,
    });

    const $ = cheerio.load(html);

    // Estratégia A: __NEXT_DATA__
    const nextDataScript = $('script#__NEXT_DATA__').html();
    if (nextDataScript) {
      try {
        const nextData = JSON.parse(nextDataScript);
        const searchResults = nextData?.props?.pageProps?.searchResults
          || nextData?.props?.pageProps?.data?.SearchResults
          || nextData?.props?.pageProps?.SearchResults
          || [];

        if (searchResults.length > 0) {
          console.log(`[WM-SCRAPE] __NEXT_DATA__: ${searchResults.length} resultados`);
          return searchResults
            .map(item => parseSearchResult(item, estadoSigla))
            .filter(a => a && a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);
        }
      } catch (e) {
        console.log(`[WM-SCRAPE] Erro parsing __NEXT_DATA__: ${e.message}`);
      }
    }

    // Estratégia B: JSON embutido em script tags
    let foundResults = [];
    $('script').each((_, el) => {
      const text = $(el).html() || '';
      const match = text.match(/"SearchResults"\s*:\s*(\[[\s\S]*?\])\s*,\s*"Filter/);
      if (match) {
        try {
          const results = JSON.parse(match[1]);
          if (results.length > 0) {
            console.log(`[WM-SCRAPE] Script JSON: ${results.length} resultados`);
            foundResults = results;
          }
        } catch (e) { /* ignore */ }
      }
    });

    if (foundResults.length > 0) {
      return foundResults
        .map(item => parseSearchResult(item, estadoSigla))
        .filter(a => a && a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);
    }

    // Estratégia C: Parse HTML direto (cards)
    const cards = [];
    $('[class*="Card"], [data-qa="ad-card"], [class*="listing"]').each((_, el) => {
      const card = $(el);
      const titulo = card.find('h2, [class*="Title"], [class*="title"]').first().text().trim();
      const precoText = card.find('[class*="Price"], [class*="price"]').first().text().trim();
      const link = card.find('a').first().attr('href') || '';

      if (titulo && precoText) {
        const preco = parseInt(precoText.replace(/[^\d]/g, ''));
        if (preco > 0 && preco >= config.filtros.precoMin && preco <= config.filtros.precoMax) {
          cards.push({
            fonte: 'Webmotors',
            titulo: titulo,
            marca: marcaOriginal,
            modelo: modeloOriginal,
            ano: extrairAno(titulo),
            preco: preco,
            km: '',
            cidade: '',
            estado: estadoSigla,
            link: link.startsWith('http') ? link : 'https://www.webmotors.com.br' + link,
            particular: false,
            dataAnuncio: '',
            imagem: '',
            cor: '',
            combustivel: '',
            cambio: '',
          });
        }
      }
    });

    if (cards.length > 0) {
      console.log(`[WM-SCRAPE] HTML cards: ${cards.length} resultados`);
      return cards;
    }

    console.log(`[WM-SCRAPE] Nenhum resultado de ${url}`);
    return [];
  } catch (err) {
    console.log(`[WM-SCRAPE] Erro: ${err.message}`);
    return [];
  }
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

function extrairAno(texto) {
  const match = texto.match(/\b(20[12]\d)\b/);
  return match ? parseInt(match[1]) : 0;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { buscarWebmotors };
