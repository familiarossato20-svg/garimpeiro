const axios = require('axios');
const config = require('./config');

const ESTADOS = {
  'SC': { slug: 'sc' },
  'PR': { slug: 'pr' },
  'RS': { slug: 'rs' },
};

async function buscarOLX(modelo, marca) {
  const resultados = [];

  for (const estado of config.filtros.regioes) {
    const estadoInfo = ESTADOS[estado];
    if (!estadoInfo) continue;

    try {
      const query = `${marca} ${modelo}`.trim();
      const url = `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-${estadoInfo.slug}`;
      
      console.log(`[OLX] Buscando: ${query} em ${estado}...`);

      const { data, status } = await axios.get(url, {
        params: { q: query, pe: config.filtros.precoMax, ps: config.filtros.precoMin, rs: 32 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'pt-BR,pt;q=0.9',
        },
        timeout: 20000,
      });

      console.log(`[OLX] ${estado}: HTTP ${status}, ${data.length} bytes`);
      const nextMatch = data.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
      if (nextMatch) {
        const nextData = JSON.parse(nextMatch[1]);
        const ads = nextData?.props?.pageProps?.ads || nextData?.props?.pageProps?.searchResult?.ads || [];
        console.log(`[OLX] ${estado}: ${ads.length} anuncios`);
        ads.forEach(ad => {
          try {
            const preco = ad.price ? parseInt(String(ad.price).replace(/\D/g, '')) : 0;
            const ano = parseInt(ad.properties?.find(p => p.name === 'carmodel_year' || p.name === 'year')?.value) || 0;
            const km = ad.properties?.find(p => p.name === 'mileage' || p.name === 'km')?.value || '';
            if (preco < config.filtros.precoMin || preco > config.filtros.precoMax) return;
            if (ano > 0 && ano < config.filtros.anoMinimo) return;
            if (config.filtros.apenasParticular && ad.professional) return;
            resultados.push({
              fonte: 'OLX', titulo: ad.subject || ad.title || `${marca} ${modelo}`,
              marca, modelo, ano, preco, km,
              cidade: ad.location?.city_name || ad.location?.municipality || '',
              estado: ad.location?.uf || estado,
              link: ad.url || '', particular: !ad.professional,
              dataAnuncio: ad.listTime || ad.list_time || '',
              imagem: ad.images?.[0]?.original || ad.thumbnail || '',
            });
          } catch(e) {}
        });
      } else {
        console.log(`[OLX] ${estado}: sem __NEXT_DATA__`);
      }
    } catch (err) {
      console.log(`[OLX] ERRO ${modelo} ${estado}: HTTP ${err.response?.status || 'N/A'} - ${err.message}`);
    }
    await sleep(3000);
  }
  console.log(`[OLX] Total ${marca} ${modelo}: ${resultados.length}`);
  return resultados;
}

function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
module.exports = { buscarOLX };
