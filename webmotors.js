const axios = require('axios');
const config = require('./config');

const ESTADOS_WM = {
  'SC': 'Santa Catarina',
  'PR': 'Parana',
  'RS': 'Rio Grande do Sul',
};

let loggedSample = false;

async function buscarWebmotors(modelo, marca) {
  const resultados = [];

  for (const estado of config.filtros.regioes) {
    const estadoNome = ESTADOS_WM[estado];
    if (!estadoNome) continue;

    try {
      console.log(`[WM] Buscando: ${marca} ${modelo} em ${estado}...`);
      
      const { data, status } = await axios.get('https://www.webmotors.com.br/api/search/car', {
        params: {
          Make: marca, Model: modelo,
          State: estadoNome,
          PriceRange: `${config.filtros.precoMin}-${config.filtros.precoMax}`,
          YearRange: `${config.filtros.anoMinimo}-2026`,
          SearchOrder: 1, DisplayPerPage: 50, DisplayPage: 1,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'application/json',
        },
        timeout: 15000,
      });

      console.log(`[WM] ${estado}: HTTP ${status}`);
      const items = data?.SearchResults || [];
      console.log(`[WM] ${estado}: ${items.length} items`);

      // Log FULL first item structure once
      if (items.length > 0 && !loggedSample) {
        loggedSample = true;
        const sample = items[0];
        console.log('[WM] === ITEM COMPLETO ===');
        console.log(JSON.stringify(sample, null, 2).substring(0, 1500));
        console.log('[WM] === FIM ITEM ===');
        if (sample.Specification) {
          console.log('[WM] Specification keys: ' + Object.keys(sample.Specification).join(', '));
          console.log('[WM] Specification values: ' + JSON.stringify(sample.Specification).substring(0, 500));
        }
        // Also try Prices sub-object
        if (sample.Prices) {
          console.log('[WM] Prices: ' + JSON.stringify(sample.Prices));
        }
      }

      items.forEach(item => {
        try {
          const spec = item.Specification || {};
          const prices = item.Prices || {};
          // Try ALL possible price fields
          const preco = spec.Price || prices.Price || prices.SearchPrice || item.Price || spec.price || 0;
          const ano = spec.YearFabrication || spec.YearModel || spec.Year || item.YearFabrication || 0;
          const make = spec.Make || spec.Brand || item.Make || marca;
          const model = spec.Model || spec.ModelName || item.Model || modelo;
          const version = spec.Version || item.Version || '';
          const city = spec.City || item.City || '';
          const km = spec.Odometer || spec.Km || item.Odometer || '';

          if (preco <= 0) return;
          if (preco < config.filtros.precoMin || preco > config.filtros.precoMax) return;
          if (ano > 0 && ano < config.filtros.anoMinimo) return;

          resultados.push({
            fonte: 'Webmotors',
            titulo: `${make} ${model} ${version}`.trim(),
            marca: make, modelo: model, ano, preco,
            km: km ? `${km} km` : '',
            cidade: city, estado: estado,
            link: item.DetailUrl || `https://www.webmotors.com.br/comprar/${item.UniqueId}`,
            particular: true, dataAnuncio: '',
            imagem: item.Media?.[0]?.Path || item.PhotoPath || '',
          });
        } catch(e) { console.log(`[WM] Erro parse: ${e.message}`); }
      });
    } catch (err) {
      console.log(`[WM] ERRO ${modelo} ${estado}: HTTP ${err.response?.status || 'N/A'} - ${err.message}`);
    }
    await sleep(2000);
  }
  console.log(`[WM] Total ${marca} ${modelo}: ${resultados.length}`);
  return resultados;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
module.exports = { buscarWebmotors };
