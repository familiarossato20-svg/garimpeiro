const axios = require('axios');
const config = require('./config');

// Mercado Livre tem uma API mais acessível
// Endpoint: https://api.mercadolibre.com/sites/MLB/search

const ESTADOS_ML = {
  'SC': 'TUxCUFNBTk8',  // Santa Catarina
  'PR': 'TUxCUFBBUk4',  // Paraná
  'RS': 'TUxCUFJJT0c',  // Rio Grande do Sul
};

async function buscarMercadoLivre(modelo, marca) {
  const resultados = [];

  for (const estado of config.filtros.regioes) {
    const estadoId = ESTADOS_ML[estado];
    if (!estadoId) continue;

    try {
      const query = `${marca} ${modelo}`.trim();

      const { data } = await axios.get('https://api.mercadolibre.com/sites/MLB/search', {
        params: {
          q: query,
          category: 'MLB1744', // Carros e Caminhonetes
          state: estadoId,
          price: `${config.filtros.precoMin}-${config.filtros.precoMax}`,
          ITEM_CONDITION: '2230581', // Usado
          sort: 'price_asc',
          limit: 50,
        },
        timeout: 15000,
      });

      if (data && data.results) {
        const anuncios = data.results
          .filter(item => {
            // Filtrar por ano
            const anoAttr = item.attributes?.find(a => a.id === 'VEHICLE_YEAR');
            const ano = parseInt(anoAttr?.value_name);
            if (ano && ano < config.filtros.anoMinimo) return false;

            // Filtrar lojistas (seller_type)
            if (config.filtros.apenasParticular) {
              const isProfessional = item.seller?.seller_reputation?.level_id === 'platinum' ||
                                    item.seller?.car_dealer === true;
              if (isProfessional) return false;
            }

            return true;
          })
          .map(item => {
            const anoAttr = item.attributes?.find(a => a.id === 'VEHICLE_YEAR');
            const kmAttr = item.attributes?.find(a => a.id === 'KILOMETERS');

            return {
              fonte: 'MercadoLivre',
              titulo: item.title || '',
              marca: marca,
              modelo: modelo,
              ano: parseInt(anoAttr?.value_name) || 0,
              preco: item.price || 0,
              km: kmAttr?.value_name || '',
              cidade: item.seller_address?.city?.name || '',
              estado: item.seller_address?.state?.id?.slice(-2) || estado,
              link: item.permalink || '',
              particular: true,
              dataAnuncio: item.stop_time || '',
              imagem: item.thumbnail || '',
            };
          })
          .filter(a => a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);

        resultados.push(...anuncios);
        console.log(`[ML] ${query} em ${estado}: ${anuncios.length} anúncios`);
      }
    } catch (err) {
      console.log(`[ML] Erro ${modelo} em ${estado}: ${err.message}`);
    }

    await sleep(1500);
  }

  return resultados;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { buscarMercadoLivre };
