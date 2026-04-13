const axios = require('axios');
const config = require('./config');

const PROXY_URL = process.env.PROXY_URL || '';
const PROXY_KEY = process.env.PROXY_KEY || 'garimpeiro-lcar-2026';

const ESTADOS_ML = {
  'SC': 'TUxCUFNBTk8',
  'PR': 'TUxCUFBBUk4',
  'RS': 'TUxCUFJJT0c',
};

async function buscarMercadoLivre(modelo, marca) {
  const resultados = [];

  for (const estado of config.filtros.regioes) {
    const estadoId = ESTADOS_ML[estado];
    if (!estadoId) continue;

    try {
      const query = `${marca} ${modelo}`.trim();

      let data;

      if (PROXY_URL) {
        // Via proxy Cloudflare
        const resp = await axios.get(`${PROXY_URL}/mercadolivre`, {
          params: {
            q: query,
            state: estadoId,
            price_min: config.filtros.precoMin,
            price_max: config.filtros.precoMax,
            limit: 50,
            key: PROXY_KEY,
          },
          timeout: 20000,
        });
        data = resp.data;
      } else {
        // Direto
        const resp = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
          params: {
            q: query,
            category: 'MLB1744',
            state: estadoId,
            price: `${config.filtros.precoMin}-${config.filtros.precoMax}`,
            ITEM_CONDITION: '2230581',
            sort: 'price_asc',
            limit: 50,
          },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
        },
        timeout: 15000,
        });
        data = resp.data;
      }

      if (data && data.results) {
        data.results.forEach(item => {
          try {
            const anoAttr = item.attributes?.find(a => a.id === 'VEHICLE_YEAR');
            const kmAttr = item.attributes?.find(a => a.id === 'KILOMETERS');
            const ano = parseInt(anoAttr?.value_name) || 0;
            if (ano > 0 && ano < config.filtros.anoMinimo) return;

            resultados.push({
              fonte: 'MercadoLivre',
              titulo: item.title || '',
              marca, modelo, ano,
              preco: item.price || 0,
              km: kmAttr?.value_name || '',
              cidade: item.seller_address?.city?.name || '',
              estado: estado,
              link: item.permalink || '',
              particular: true,
              dataAnuncio: item.stop_time || '',
              imagem: item.thumbnail || '',
            });
          } catch(e) {}
        });
      }
    } catch (err) {
      console.log(`[ML] ERRO ${modelo} ${estado}: HTTP ${err.response?.status || 'N/A'} - ${err.message}`);
      
      if (err.response?.status === 403) {
        console.log(`[ML] Tentando sem filtro de estado...`);
        try {
          const { data } = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
            params: { q: `${marca} ${modelo} ${estado}`, category: 'MLB1744', limit: 20 },
            timeout: 15000,
          });
          console.log(`[ML] Fallback: ${data.results?.length || 0} resultados`);
          data.results?.forEach(item => {
            const ano = parseInt(item.attributes?.find(a => a.id === 'VEHICLE_YEAR')?.value_name) || 0;
            if (ano > 0 && ano < config.filtros.anoMinimo) return;
            if (item.price < config.filtros.precoMin || item.price > config.filtros.precoMax) return;
            resultados.push({
              fonte: 'MercadoLivre', titulo: item.title || '', marca, modelo, ano,
              preco: item.price || 0, km: item.attributes?.find(a => a.id === 'KILOMETERS')?.value_name || '',
              cidade: item.seller_address?.city?.name || '', estado,
              link: item.permalink || '', particular: true, dataAnuncio: '', imagem: item.thumbnail || '',
            });
          });
        } catch(e2) {
          console.log(`[ML] Fallback tambem falhou: ${e2.message}`);
        }
      }
    }
    await sleep(1500);
  }
  console.log(`[ML] Total ${marca} ${modelo}: ${resultados.length}`);
  return resultados;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
module.exports = { buscarMercadoLivre };
