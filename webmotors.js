const axios = require('axios');
const config = require('./config');

const ESTADOS_WM = {
  'SC': 'Santa Catarina',
  'PR': 'Paraná',
  'RS': 'Rio Grande do Sul',
};

async function buscarWebmotors(modelo, marca) {
  const resultados = [];

  for (const estado of config.filtros.regioes) {
    const estadoNome = ESTADOS_WM[estado];
    if (!estadoNome) continue;

    try {
      const { data } = await axios.get('https://www.webmotors.com.br/api/search/car', {
        params: {
          Make: marca,
          Model: modelo,
          State: estadoNome,
          PriceRange: `${config.filtros.precoMin}-${config.filtros.precoMax}`,
          YearRange: `${config.filtros.anoMinimo}-2026`,
          SearchOrder: 1, // menor preço
          DisplayPerPage: 50,
          DisplayPage: 1,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 15000,
      });

      if (data && data.SearchResults) {
        const anuncios = data.SearchResults
          .filter(item => {
            if (config.filtros.apenasParticular && item.Seller?.SellerType !== 'PF') return false;
            return true;
          })
          .map(item => ({
            fonte: 'Webmotors',
            titulo: `${item.Make} ${item.Model} ${item.Version || ''}`.trim(),
            marca: item.Make || marca,
            modelo: item.Model || modelo,
            ano: item.YearFabrication || item.YearModel || 0,
            preco: item.Price || 0,
            km: item.Odometer ? `${item.Odometer} km` : '',
            cidade: item.City || '',
            estado: estado,
            link: `https://www.webmotors.com.br/comprar/${item.UniqueId}` || '',
            particular: item.Seller?.SellerType === 'PF',
            dataAnuncio: '',
            imagem: item.Media?.[0]?.Path || '',
          }))
          .filter(a => a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);

        resultados.push(...anuncios);
        console.log(`[WM] ${marca} ${modelo} em ${estado}: ${anuncios.length} anúncios`);
      }
    } catch (err) {
      console.log(`[WM] Erro ${modelo} em ${estado}: ${err.message}`);
    }

    await sleep(2000);
  }

  return resultados;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { buscarWebmotors };
