const axios = require('axios');
const config = require('./config');

// OLX tem uma API interna que podemos usar
// Endpoint: https://www.olx.com.br/api/v2/search
// Parâmetros: category (veículos=2020), region, price_min, price_max, etc.

const ESTADOS_DDD = {
  'SC': { id: 42, slug: 'santa-catarina' },
  'PR': { id: 41, slug: 'parana' },
  'RS': { id: 43, slug: 'rio-grande-do-sul' },
};

async function buscarOLX(modelo, marca) {
  const resultados = [];

  for (const estado of config.filtros.regioes) {
    const estadoInfo = ESTADOS_DDD[estado];
    if (!estadoInfo) continue;

    try {
      const query = `${marca} ${modelo}`.trim();
      
      const { data } = await axios.get('https://www.olx.com.br/api/v1.5/search/', {
        params: {
          q: query,
          category: 2020, // categoria veículos
          region: estadoInfo.id,
          price_min: config.filtros.precoMin,
          price_max: config.filtros.precoMax,
          // Filtrar por particular
          professional: config.filtros.apenasParticular ? 0 : undefined,
          sort: 'price', // ordenar por preço (mais barato primeiro)
          limit: 50,
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'application/json',
        },
        timeout: 15000,
      });

      if (data && data.data) {
        const anuncios = data.data
          .filter(item => {
            // Filtrar por ano mínimo
            const anoStr = item.properties?.find(p => p.name === 'year')?.value;
            const ano = parseInt(anoStr);
            if (ano && ano < config.filtros.anoMinimo) return false;
            
            // Filtrar lojistas
            if (config.filtros.apenasParticular && item.professional) return false;
            
            return true;
          })
          .map(item => {
            const preco = item.price ? parseInt(String(item.price).replace(/\D/g, '')) : 0;
            const ano = item.properties?.find(p => p.name === 'year')?.value || '';
            const km = item.properties?.find(p => p.name === 'mileage')?.value || '';
            
            return {
              fonte: 'OLX',
              titulo: item.subject || item.title || '',
              marca: marca,
              modelo: modelo,
              ano: parseInt(ano) || 0,
              preco: preco,
              km: km,
              cidade: item.location?.city_name || '',
              estado: item.location?.uf || estado,
              link: item.url || `https://www.olx.com.br/${item.list_id}`,
              particular: !item.professional,
              dataAnuncio: item.list_time || '',
              imagem: item.images?.[0]?.original || item.thumbnail || '',
            };
          })
          .filter(a => a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);

        resultados.push(...anuncios);
        console.log(`[OLX] ${query} em ${estado}: ${anuncios.length} anúncios`);
      }
    } catch (err) {
      // Se a API da OLX mudar, tenta scraping alternativo
      console.log(`[OLX] API v1.5 falhou para ${modelo} em ${estado}: ${err.message}`);
      
      // Tenta endpoint alternativo
      try {
        const anunciosAlt = await buscarOLXAlternativo(modelo, marca, estado);
        resultados.push(...anunciosAlt);
      } catch (err2) {
        console.log(`[OLX] Alternativo também falhou: ${err2.message}`);
      }
    }

    // Delay entre estados pra não ser bloqueado
    await sleep(2000);
  }

  return resultados;
}

async function buscarOLXAlternativo(modelo, marca, estado) {
  const estadoInfo = ESTADOS_DDD[estado];
  const query = encodeURIComponent(`${marca} ${modelo}`);
  
  const { data } = await axios.get(
    `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-${estadoInfo.slug}?q=${query}&pe=${config.filtros.precoMax}&ps=${config.filtros.precoMin}&rs=32`, // rs=32 = particular
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html',
      },
      timeout: 15000,
    }
  );

  // Parse HTML básico pra extrair dados do JSON embutido
  const jsonMatch = data.match(/window\.__NEXT_DATA__\s*=\s*(\{.+?\})\s*<\/script>/s);
  if (!jsonMatch) return [];

  try {
    const nextData = JSON.parse(jsonMatch[1]);
    const ads = nextData?.props?.pageProps?.ads || [];
    
    return ads
      .filter(ad => {
        const ano = parseInt(ad.properties?.find(p => p.name === 'year')?.value);
        return ano >= config.filtros.anoMinimo;
      })
      .map(ad => ({
        fonte: 'OLX',
        titulo: ad.subject || '',
        marca: marca,
        modelo: modelo,
        ano: parseInt(ad.properties?.find(p => p.name === 'year')?.value) || 0,
        preco: parseInt(String(ad.price).replace(/\D/g, '')) || 0,
        km: ad.properties?.find(p => p.name === 'mileage')?.value || '',
        cidade: ad.location?.city_name || '',
        estado: estado,
        link: ad.url || '',
        particular: !ad.professional,
        dataAnuncio: ad.list_time || '',
        imagem: ad.images?.[0]?.original || '',
      }));
  } catch (e) {
    return [];
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { buscarOLX };
