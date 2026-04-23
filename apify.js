/**
 * Apify integration para Garimpeiro L-Car
 * 
 * Usa o Web Scraper Actor da Apify pra buscar veículos no Webmotors e ML
 * bypassa PerimeterX porque roda em headless browser com proxies residenciais
 * 
 * Free tier: $5/mês ≈ 500 páginas, usamos ~6/dia = 180/mês (sobra)
 */

const axios = require('axios');
const config = require('./config');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_BASE = 'https://api.apify.com/v2';

// Actor IDs
const WEB_SCRAPER = 'apify~web-scraper';

/**
 * Busca veículos via Apify Web Scraper
 * Roda headless browser na infra da Apify (bypassa PerimeterX)
 */
async function garimparViaApify() {
  if (!APIFY_TOKEN) {
    console.log('[APIFY] Token não configurado. Pule.');
    return [];
  }

  console.log('[APIFY] Iniciando garimpo via Apify...');

  const estados = {
    SC: 'santa-catarina',
    PR: 'parana', 
    RS: 'rio-grande-do-sul',
  };

  // URLs de busca no Webmotors (1 por estado, busca genérica com filtro de preço)
  const startUrls = Object.values(estados).map(estado => ({
    url: `https://www.webmotors.com.br/carros/estoque/${estado}?PriceRange=${config.filtros.precoMin}-${config.filtros.precoMax}&YearRange=${config.filtros.anoMinimo}-2026`,
    method: 'GET',
  }));

  // Page function que roda DENTRO do browser da Apify
  const pageFunction = `
    async function pageFunction(context) {
      const { request, jQuery: $, log } = context;
      
      // Tentar pegar dados da API interna do Webmotors
      const urlObj = new URL(request.url);
      const estado = urlObj.pathname.split('/').pop();
      
      // Buscar via API do WM (funciona de dentro do browser)
      try {
        const apiUrl = 'https://www.webmotors.com.br/api/search/car?url=' + 
          encodeURIComponent(request.url) + 
          '&DisplayPerPage=50&DisplayPage=1';
        
        const response = await fetch(apiUrl);
        const data = await response.json();
        
        if (data && data.SearchResults) {
          const results = data.SearchResults.map(item => {
            const spec = item.Specification || item;
            const seller = item.Seller || {};
            const prices = item.Prices || {};
            
            const getMake = (v) => typeof v === 'object' ? (v.Value || v.Name || '') : (v || '');
            
            return {
              fonte: 'Webmotors',
              titulo: (getMake(spec.Make) + ' ' + getMake(spec.Model) + ' ' + getMake(spec.Version)).trim(),
              marca: getMake(spec.Make),
              modelo: getMake(spec.Model),
              ano: parseInt(spec.YearFabrication || spec.YearModel) || 0,
              preco: prices.Price || prices.SearchPrice || 0,
              km: spec.Odometer ? Math.round(spec.Odometer) + ' km' : '',
              cidade: seller.City || '',
              estado: (() => {
                const s = seller.State || '';
                const m = s.match(/\\(([A-Z]{2})\\)/);
                return m ? m[1] : estado.substring(0,2).toUpperCase();
              })(),
              link: item.UniqueId ? 'https://www.webmotors.com.br/comprar/' + item.UniqueId : '',
              particular: seller.SellerType === 'PF',
            };
          });
          
          log.info('API WM: ' + results.length + ' resultados para ' + estado);
          return results;
        }
      } catch(e) {
        log.warning('API WM falhou: ' + e.message + ', tentando scrape HTML...');
      }
      
      // Fallback: scrape da página HTML
      const results = [];
      $('.CardStyled, .card-item, [data-qa="card"]').each((i, el) => {
        try {
          const $el = $(el);
          const titulo = $el.find('.card-title, h2, [data-qa="title"]').text().trim();
          const precoText = $el.find('.card-price, [data-qa="price"]').text().trim();
          const preco = parseInt(precoText.replace(/\\D/g, '')) || 0;
          const link = $el.find('a').first().attr('href') || '';
          
          if (titulo && preco > 0) {
            results.push({
              fonte: 'Webmotors',
              titulo,
              marca: titulo.split(' ')[0] || '',
              modelo: titulo.split(' ').slice(1, 3).join(' ') || '',
              ano: parseInt(titulo.match(/(20\\d{2}|19\\d{2})/)?.[1]) || 0,
              preco,
              km: '',
              cidade: '',
              estado: estado.substring(0,2).toUpperCase(),
              link: link.startsWith('http') ? link : 'https://www.webmotors.com.br' + link,
              particular: false,
            });
          }
        } catch(e) {}
      });
      
      log.info('HTML scrape: ' + results.length + ' resultados para ' + estado);
      return results;
    }
  `;

  try {
    // Rodar Web Scraper via API sincronamente (max 5 min)
    const runUrl = `${APIFY_BASE}/acts/${WEB_SCRAPER}/run-sync-get-dataset-items?token=${APIFY_TOKEN}`;
    
    const input = {
      startUrls,
      pageFunction,
      proxyConfiguration: { useApifyProxy: true },
      maxRequestsPerCrawl: 6, // 3 estados × 2 páginas max
      maxConcurrency: 3,
      pageLoadTimeoutSecs: 30,
      maxRequestRetries: 2,
    };

    console.log(`[APIFY] Enviando ${startUrls.length} URLs para Web Scraper...`);
    
    const response = await axios.post(runUrl, input, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 300000, // 5 min
      maxBodyLength: 10 * 1024 * 1024,
    });

    // response.data é um array de arrays (1 por página)
    const allResults = [];
    if (Array.isArray(response.data)) {
      for (const pageResults of response.data) {
        if (Array.isArray(pageResults)) {
          allResults.push(...pageResults);
        }
      }
    }

    // Filtrar por preço, ano, e estados
    const regioes = config.filtros.regioes || ['SC', 'PR', 'RS'];
    const filtered = allResults.filter(r => {
      if (!r || !r.preco) return false;
      if (r.preco < config.filtros.precoMin || r.preco > config.filtros.precoMax) return false;
      if (r.ano && r.ano < config.filtros.anoMinimo) return false;
      if (r.estado && !regioes.includes(r.estado)) return false;
      return true;
    });

    console.log(`[APIFY] Total: ${allResults.length} brutos → ${filtered.length} filtrados`);
    return filtered;

  } catch (err) {
    if (err.response) {
      console.error(`[APIFY] Erro HTTP ${err.response.status}: ${JSON.stringify(err.response.data).substring(0, 200)}`);
    } else {
      console.error(`[APIFY] Erro: ${err.message}`);
    }
    return [];
  }
}

/**
 * Busca simples via Apify proxy (fetch HTML com proxy residencial)
 * Mais barato e simples que o Web Scraper completo
 */
async function fetchViaApifyProxy(url) {
  if (!APIFY_TOKEN) return null;

  try {
    const proxyUrl = `http://auto:${APIFY_TOKEN}@proxy.apify.com:8000`;
    const response = await axios.get(url, {
      proxy: false,
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.webmotors.com.br/',
      },
      timeout: 15000,
    });
    return response.data;
  } catch (err) {
    console.error(`[APIFY-PROXY] Erro: ${err.message}`);
    return null;
  }
}

module.exports = {
  garimparViaApify,
  fetchViaApifyProxy,
  isConfigured: () => !!APIFY_TOKEN,
};
