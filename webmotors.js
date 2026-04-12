const axios = require('axios');
const config = require('./config');

const ESTADOS_WM = {
  'SC': 'Santa Catarina',
  'PR': 'Parana',
  'RS': 'Rio Grande do Sul',
};

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
      const items = data?.SearchResults || data?.Vehicles || data || [];
      const count = Array.isArray(items) ? items.length : 0;
      console.log(`[WM] ${estado}: ${count} resultados`);

      if (Array.isArray(items)) {
        items.forEach(item => {
          try {
            const preco = item.Price || item.Prices?.Price || 0;
            const ano = item.YearFabrication || item.YearModel || 0;
            if (preco < config.filtros.precoMin || preco > config.filtros.precoMax) return;
            if (ano < config.filtros.anoMinimo) return;

            resultados.push({
              fonte: 'Webmotors',
              titulo: `${item.Make || marca} ${item.Model || modelo} ${item.Version || ''}`.trim(),
              marca: item.Make || marca,
              modelo: item.Model || modelo,
              ano, preco,
              km: item.Odometer ? `${item.Odometer} km` : '',
              cidade: item.City || '',
              estado: estado,
              link: item.DetailUrl || `https://www.webmotors.com.br/comprar/${item.UniqueId}`,
              particular: !item.Seller || item.Seller?.SellerType === 'PF',
              dataAnuncio: '',
              imagem: item.Media?.[0]?.Path || '',
            });
          } catch(e) {}
        });
      }
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
