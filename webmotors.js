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
      
      const { data, status, headers } = await axios.get('https://www.webmotors.com.br/api/search/car', {
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

      console.log(`[WM] ${estado}: HTTP ${status}, content-type: ${headers['content-type']}`);
      console.log(`[WM] ${estado}: tipo data: ${typeof data}`);
      
      if (typeof data === 'string') {
        console.log(`[WM] ${estado}: resposta eh string, primeiros 200 chars: ${data.substring(0, 200)}`);
        continue;
      }
      
      console.log(`[WM] ${estado}: keys: ${Object.keys(data).join(', ')}`);
      
      // Tentar todas as possiveis estruturas
      let items = [];
      if (data.SearchResults) { items = data.SearchResults; console.log('[WM] Usando SearchResults'); }
      else if (data.Vehicles) { items = data.Vehicles; console.log('[WM] Usando Vehicles'); }
      else if (data.Result) { items = data.Result; console.log('[WM] Usando Result'); }
      else if (data.results) { items = data.results; console.log('[WM] Usando results'); }
      else if (data.data) { items = data.data; console.log('[WM] Usando data.data'); }
      else if (Array.isArray(data)) { items = data; console.log('[WM] data eh array direto'); }
      else {
        console.log(`[WM] ${estado}: estrutura desconhecida. Primeiro nivel:`);
        for (const key of Object.keys(data).slice(0, 10)) {
          const val = data[key];
          console.log(`  ${key}: ${typeof val} ${Array.isArray(val) ? '(array len=' + val.length + ')' : typeof val === 'object' ? '(obj keys=' + Object.keys(val || {}).slice(0,5).join(',') + ')' : String(val).substring(0, 50)}`);
        }
      }

      console.log(`[WM] ${estado}: ${items.length} items encontrados`);
      
      if (items.length > 0) {
        const sample = items[0];
        console.log(`[WM] Amostra keys: ${Object.keys(sample).slice(0, 15).join(', ')}`);
        console.log(`[WM] Amostra: Make=${sample.Make}, Model=${sample.Model}, Price=${sample.Price}, Year=${sample.YearFabrication || sample.YearModel}`);
      }

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
        } catch(e) { console.log(`[WM] Erro parse item: ${e.message}`); }
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
