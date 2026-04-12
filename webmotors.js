const axios = require('axios');
const config = require('./config');

async function buscarWebmotors(modelo, marca) {
  const resultados = [];

  try {
    console.log(`[WM] Buscando: ${marca} ${modelo}...`);
    
    const { data, status } = await axios.get('https://www.webmotors.com.br/api/search/car', {
      params: {
        Make: marca, Model: modelo,
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

    console.log(`[WM] HTTP ${status}`);
    const items = data?.SearchResults || data?.Vehicles || [];
    console.log(`[WM] ${items.length} resultados`);

    items.forEach(item => {
      try {
        const preco = item.Price || item.Prices?.Price || 0;
        const ano = item.YearFabrication || item.YearModel || 0;
        const uf = item.State || item.SellerState || '';
        if (!config.filtros.regioes.includes(uf)) return;
        if (config.filtros.apenasParticular && item.Seller?.SellerType !== 'PF') return;

        resultados.push({
          fonte: 'Webmotors', titulo: `${item.Make || marca} ${item.Model || modelo} ${item.Version || ''}`.trim(),
          marca: item.Make || marca, modelo: item.Model || modelo, ano, preco,
          km: item.Odometer ? `${item.Odometer} km` : '',
          cidade: item.City || '', estado: uf,
          link: item.DetailUrl || `https://www.webmotors.com.br/comprar/${item.UniqueId}`,
          particular: item.Seller?.SellerType === 'PF', dataAnuncio: '', imagem: item.Media?.[0]?.Path || '',
        });
      } catch(e) {}
    });
  } catch (err) {
    console.log(`[WM] ERRO: HTTP ${err.response?.status || 'N/A'} - ${err.message}`);
  }
  console.log(`[WM] Total ${marca} ${modelo}: ${resultados.length}`);
  return resultados;
}

module.exports = { buscarWebmotors };
