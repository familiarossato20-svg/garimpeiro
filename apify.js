/**
 * Apify integration para Garimpeiro L-Car
 * 1 Actor run com múltiplas URLs (modelos x estados)
 * Proxy RESIDENTIAL bypassa PerimeterX
 */

const axios = require('axios');

const APIFY_TOKEN = process.env.APIFY_TOKEN;
const APIFY_BASE = 'https://api.apify.com/v2';

const MODELOS = [
  {m:'gol',s:'volkswagen'},{m:'onix',s:'chevrolet'},{m:'palio',s:'fiat'},
  {m:'hb20',s:'hyundai'},{m:'polo',s:'volkswagen'},{m:'sandero',s:'renault'},
  {m:'argo',s:'fiat'},{m:'cronos',s:'fiat'},{m:'etios',s:'toyota'},
  {m:'ka',s:'ford'},{m:'mobi',s:'fiat'},{m:'saveiro',s:'volkswagen'},
  {m:'toro',s:'fiat'},{m:'tracker',s:'chevrolet'},{m:'hr-v',s:'honda'},
  {m:'t-cross',s:'volkswagen'},{m:'kicks',s:'nissan'},{m:'creta',s:'hyundai'},
];
const ESTADOS = ['santa-catarina','parana','rio-grande-do-sul'];

async function garimparViaApify() {
  if (!APIFY_TOKEN) {
    console.log('[APIFY] Token nao configurado.');
    return [];
  }

  console.log('[APIFY] Iniciando garimpo via Apify...');

  // Montar todas as URLs (modelo x estado)
  const startUrls = [];
  for (const mod of MODELOS) {
    for (const estado of ESTADOS) {
      startUrls.push({
        url: 'https://www.webmotors.com.br/api/search/car?url=' +
          encodeURIComponent('https://www.webmotors.com.br/carros/estoque/' + mod.s + '/' + mod.m + '/' + estado) +
          '&DisplayPerPage=24&DisplayPage=1'
      });
    }
  }

  console.log('[APIFY] ' + startUrls.length + ' URLs para ' + MODELOS.length + ' modelos x ' + ESTADOS.length + ' estados');

  const pageFunc = `async function pageFunction(context) {
  const { request, log } = context;
  var bodyText = document.body ? document.body.innerText : "";
  try {
    var data = JSON.parse(bodyText);
    if (data && data.SearchResults && data.SearchResults.length > 0) {
      log.info("OK: " + data.SearchResults.length + " resultados");
      return data.SearchResults;
    }
  } catch(e) {}
  try {
    var r = await fetch(request.url, { headers: { Accept: "application/json" } });
    var data2 = await r.json();
    if (data2 && data2.SearchResults && data2.SearchResults.length > 0) {
      log.info("Fetch: " + data2.SearchResults.length + " resultados");
      return data2.SearchResults;
    }
  } catch(e2) {}
  return [];
}`;

  try {
    const actorUrl = APIFY_BASE + '/acts/apify~web-scraper/run-sync-get-dataset-items?token=' + APIFY_TOKEN;

    const input = {
      startUrls: startUrls,
      pageFunction: pageFunc,
      proxyConfiguration: {
        useApifyProxy: true,
        apifyProxyGroups: ['RESIDENTIAL'],
      },
      maxRequestsPerCrawl: startUrls.length,
      maxConcurrency: 5,
      pageLoadTimeoutSecs: 30,
      maxRequestRetries: 1,
    };

    const response = await axios.post(actorUrl, input, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 300000,
    });

    // Extrair resultados
    let rawItems = [];
    if (Array.isArray(response.data)) {
      for (const item of response.data) {
        if (Array.isArray(item)) {
          rawItems.push(...item);
        } else if (item && (item.Specification || item.Prices)) {
          rawItems.push(item);
        }
      }
    }

    console.log('[APIFY] Raw items: ' + rawItems.length);

    // Debug primeiro item
    if (rawItems.length > 0) {
      const f = rawItems[0];
      const sp = f.Specification || {};
      const pr = f.Prices || {};
      const gv = (v) => (!v ? '' : typeof v === 'string' ? v : v.Value || v.Name || '');
      console.log('[APIFY] Sample: ' + gv(sp.Make) + ' ' + gv(sp.Model) + ' R$' + (pr.Price||0) + ' ' + (f.Seller?.State||''));
    }

    // Parsear e filtrar
    const todosAnuncios = [];
    const gv = (v) => {
      if (!v) return '';
      if (typeof v === 'string') return v;
      return v.Value || v.Name || v.name || v.value || String(v);
    };

    for (const item of rawItems) {
      try {
        const spec = item.Specification || item;
        const seller = item.Seller || {};
        const prices = item.Prices || {};

        const preco = prices.Price || prices.SearchPrice || 0;
        const ano = parseInt(spec.YearFabrication || spec.YearModel) || 0;
        if (!preco || preco < 5000 || preco > 100000) continue;
        if (ano && ano < 2012) continue;

        const sellerState = gv(seller.State);
        const pIdx = sellerState.indexOf('(');
        const cIdx = sellerState.indexOf(')');
        const estadoReal = pIdx > -1 ? sellerState.substring(pIdx + 1, cIdx) : '';
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

    console.log('[APIFY] Filtrados: ' + todosAnuncios.length + ' anuncios SC/PR/RS R$5k-100k');
    return todosAnuncios;

  } catch (err) {
    const msg = err.response ? (err.response.status + ': ' + JSON.stringify(err.response.data).substring(0, 300)) : err.message;
    console.error('[APIFY] Erro: ' + msg);
    return [];
  }
}

module.exports = {
  garimparViaApify,
  isConfigured: () => !!APIFY_TOKEN,
};
