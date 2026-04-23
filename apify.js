/**
 * Apify integration para Garimpeiro L-Car
 * Usa Web Scraper da Apify com proxy residencial pra bypassa PerimeterX
 */

const axios = require('axios');
const config = require('./config');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_BASE = 'https://api.apify.com/v2';

async function garimparViaApify() {
  if (!APIFY_TOKEN) {
    console.log('[APIFY] Token nao configurado.');
    return [];
  }

  console.log('[APIFY] Iniciando garimpo via Apify...');

  const estados = ['santa-catarina', 'parana', 'rio-grande-do-sul'];
  const todosAnuncios = [];

  for (const estado of estados) {
    try {
      const apiUrl = 'https://www.webmotors.com.br/api/search/car?url=' +
        encodeURIComponent('https://www.webmotors.com.br/carros/estoque/' + estado) +
        '&DisplayPerPage=50&DisplayPage=1';

      console.log('[APIFY] Buscando ' + estado + '...');

      const actorUrl = APIFY_BASE + '/acts/apify~web-scraper/run-sync-get-dataset-items?token=' + APIFY_TOKEN;

      const pageFunc = `async function pageFunction(context) {
  const { request, log } = context;
  var bodyText = document.body ? document.body.innerText : "";
  try {
    var data = JSON.parse(bodyText);
    if (data && data.SearchResults) {
      log.info("JSON direto: " + data.SearchResults.length + " resultados");
      return data.SearchResults;
    }
  } catch(e) {
    log.warning("Body nao e JSON, tentando fetch API...");
  }
  try {
    var r = await fetch(request.url, { headers: { Accept: "application/json" } });
    var data2 = await r.json();
    if (data2 && data2.SearchResults) {
      log.info("Fetch API: " + data2.SearchResults.length + " resultados");
      return data2.SearchResults;
    }
  } catch(e2) {
    log.warning("Fetch falhou: " + e2.message);
  }
  log.warning("Sem resultados para " + request.url);
  return [];
}`;

      const input = {
        startUrls: [{ url: apiUrl }],
        pageFunction: pageFunc,
        proxyConfiguration: {
          useApifyProxy: true,
          apifyProxyGroups: ['RESIDENTIAL'],
        },
        maxRequestsPerCrawl: 1,
        maxConcurrency: 1,
        pageLoadTimeoutSecs: 45,
        maxRequestRetries: 2,
      };

      const response = await axios.post(actorUrl, input, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 180000,
      });

      let results = [];
      if (Array.isArray(response.data)) {
        for (const item of response.data) {
          if (Array.isArray(item)) {
            results.push(...item);
          } else if (item && (item.Specification || item.Prices)) {
            results.push(item);
          }
        }
      }

      console.log('[APIFY] ' + estado + ': ' + results.length + ' brutos');

      // Debug: log primeiro item pra entender estrutura
      if (results.length > 0) {
        const first = results[0];
        console.log('[APIFY] DEBUG keys: ' + Object.keys(first).join(','));
        const spec = first.Specification || first;
        const prices = first.Prices || {};
        const seller = first.Seller || {};
        console.log('[APIFY] DEBUG spec keys: ' + Object.keys(spec).join(','));
        console.log('[APIFY] DEBUG prices: ' + JSON.stringify(prices).substring(0, 200));
        console.log('[APIFY] DEBUG seller: ' + JSON.stringify(seller).substring(0, 200));
        const gv = (v) => {
          if (!v) return '';
          if (typeof v === 'string') return v;
          return v.Value || v.Name || v.name || v.value || String(v);
        };
        console.log('[APIFY] DEBUG modelo: ' + gv(spec.Model) + ', preco: ' + (prices.Price || prices.SearchPrice || 0) + ', ano: ' + (spec.YearFabrication || spec.YearModel));
      }

      for (const item of results) {
        try {
          const spec = item.Specification || item;
          const seller = item.Seller || {};
          const prices = item.Prices || {};

          const gv = (v) => {
            if (!v) return '';
            if (typeof v === 'string') return v;
            return v.Value || v.Name || v.name || v.value || String(v);
          };

          const preco = prices.Price || prices.SearchPrice || 0;
          const ano = parseInt(spec.YearFabrication || spec.YearModel) || 0;
          if (!preco || preco < 5000 || preco > 100000) continue;
          if (ano && ano < 2012) continue;

          const sellerState = gv(seller.State);
          const pIdx = sellerState.indexOf('(');
          const cIdx = sellerState.indexOf(')');
          const estadoReal = pIdx > -1 ? sellerState.substring(pIdx + 1, cIdx) : 'SC';
          if (!['SC', 'PR', 'RS'].includes(estadoReal)) continue;

          todosAnuncios.push({
            fonte: 'Webmotors',
            titulo: (gv(spec.Make) + ' ' + gv(spec.Model) + ' ' + gv(spec.Version)).trim(),
            marca: gv(spec.Make), modelo: gv(spec.Model), ano, preco,
            km: spec.Odometer ? Math.round(spec.Odometer) + ' km' : '',
            cidade: gv(seller.City), estado: estadoReal,
            link: item.UniqueId ? 'https://www.webmotors.com.br/comprar/' + item.UniqueId : '',
            particular: seller.SellerType === 'PF',
            dataAnuncio: '', imagem: item.PhotoPath || '',
            cor: gv(spec.Color && spec.Color.Primary ? spec.Color.Primary : spec.Color),
            combustivel: gv(spec.Fuel), cambio: gv(spec.Transmission),
          });
        } catch (e) { /* skip */ }
      }
    } catch (err) {
      const msg = err.response ? (err.response.status + ': ' + JSON.stringify(err.response.data).substring(0, 200)) : err.message;
      console.error('[APIFY] Erro ' + estado + ': ' + msg);
    }
  }

  console.log('[APIFY] Total final: ' + todosAnuncios.length + ' anuncios');
  return todosAnuncios;
}

module.exports = {
  garimparViaApify,
  isConfigured: () => !!APIFY_TOKEN,
};
