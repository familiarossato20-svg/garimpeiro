/**
 * scraper-action.js — Roda no GitHub Actions
 * Busca em Webmotors e Mercado Livre (IPs do Azure/GitHub não bloqueados)
 * Envia resultados pro Railway via POST
 */

const axios = require('axios');
const fs = require('fs');
const config = require('./config');
const { calcularMargem, removerDuplicatas } = require('./margem');
const { limparCache } = require('./fipe');

const RAILWAY_URL = process.env.RAILWAY_URL || 'https://garimpeiro-production.up.railway.app';

const ESTADOS_WM = {
  'SC': 'santa-catarina',
  'PR': 'parana',
  'RS': 'rio-grande-do-sul',
};

const ESTADOS_ML = {
  'SC': 'TUxCUFNBTk8',
  'PR': 'TUxCUFBBUk4',
  'RS': 'TUxCUFJJT0c',
};

const MARCA_SLUG = {
  'VW': 'volkswagen',
  'Chevrolet': 'chevrolet',
  'Fiat': 'fiat',
  'Hyundai': 'hyundai',
  'Renault': 'renault',
  'Ford': 'ford',
  'Toyota': 'toyota',
  'Honda': 'honda',
  'Nissan': 'nissan',
  'Jeep': 'jeep',
  'Kia': 'kia',
};

function str(campo) {
  if (!campo) return '';
  if (typeof campo === 'string') return campo;
  if (typeof campo === 'object') return campo.Name || campo.Value || campo.name || campo.value || String(campo);
  return String(campo);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================
// WEBMOTORS
// ============================================================
async function buscarWebmotors(modelo, marca) {
  const resultados = [];
  const marcaSlug = (MARCA_SLUG[marca] || marca).toLowerCase();
  const modeloSlug = modelo.toLowerCase().replace(/[-\s]+/g, '-');

  for (const estado of config.filtros.regioes) {
    const estadoSlug = ESTADOS_WM[estado];
    if (!estadoSlug) continue;

    try {
      const wmUrl = `https://www.webmotors.com.br/carros/estoque/${marcaSlug}/${modeloSlug}/${estadoSlug}`;

      const { data } = await axios.get('https://www.webmotors.com.br/api/search/car', {
        params: { url: wmUrl, DisplayPerPage: 50, DisplayPage: 1 },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Referer': 'https://www.webmotors.com.br/',
        },
        timeout: 15000,
      });

      if (data && data.SearchResults) {
        const modeloLower = modeloSlug.replace(/-/g, ' ');
        const anuncios = data.SearchResults
          .filter(item => {
            const spec = item.Specification || item;
            const modelResult = str(spec.Model).toLowerCase();
            return modelResult.includes(modeloLower) || modeloLower.includes(modelResult);
          })
          .map(item => {
            const spec = item.Specification || item;
            const seller = item.Seller || {};
            const prices = item.Prices || {};
            const preco = prices.Price || prices.SearchPrice || 0;
            const ano = parseInt(spec.YearFabrication || spec.YearModel) || 0;
            if (!preco || preco < config.filtros.precoMin || preco > config.filtros.precoMax) return null;
            if (ano && ano < config.filtros.anoMinimo) return null;

            return {
              fonte: 'Webmotors',
              titulo: `${str(spec.Make)} ${str(spec.Model)} ${str(spec.Version)}`.trim(),
              marca: str(spec.Make),
              modelo: str(spec.Model),
              ano, preco,
              km: spec.Odometer ? `${Math.round(spec.Odometer)} km` : '',
              cidade: str(seller.City),
              estado,
              link: item.UniqueId ? `https://www.webmotors.com.br/comprar/${item.UniqueId}` : '',
              particular: seller.SellerType === 'PF',
              dataAnuncio: '',
              imagem: item.PhotoPath || '',
              cor: str(spec.Color?.Primary || spec.Color),
              combustivel: str(spec.Fuel),
              cambio: str(spec.Transmission),
            };
          })
          .filter(Boolean);

        resultados.push(...anuncios);
        if (anuncios.length > 0) console.log(`[WM] ${marca} ${modelo} ${estado}: ${anuncios.length}`);
      }
    } catch (err) {
      if (err.response?.status === 403) {
        console.log(`[WM] ${modelo} ${estado}: 403 BLOQUEADO`);
      } else {
        console.log(`[WM] ${modelo} ${estado}: ${err.message}`);
      }
    }

    await sleep(1500);
  }

  return resultados;
}

// ============================================================
// MERCADO LIVRE
// ============================================================
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
          category: 'MLB1744',
          state: estadoId,
          price: `${config.filtros.precoMin}-${config.filtros.precoMax}`,
          ITEM_CONDITION: '2230581',
          sort: 'price_asc',
          limit: 50,
        },
        timeout: 15000,
      });

      if (data && data.results) {
        const anuncios = data.results
          .filter(item => {
            const anoAttr = item.attributes?.find(a => a.id === 'VEHICLE_YEAR');
            const ano = parseInt(anoAttr?.value_name);
            if (ano && ano < config.filtros.anoMinimo) return false;
            return true;
          })
          .map(item => {
            const anoAttr = item.attributes?.find(a => a.id === 'VEHICLE_YEAR');
            const kmAttr = item.attributes?.find(a => a.id === 'KILOMETERS');
            return {
              fonte: 'MercadoLivre',
              titulo: item.title || '',
              marca, modelo,
              ano: parseInt(anoAttr?.value_name) || 0,
              preco: item.price || 0,
              km: kmAttr?.value_name || '',
              cidade: item.seller_address?.city?.name || '',
              estado: item.seller_address?.state?.id?.slice(-2) || estado,
              link: item.permalink || '',
              particular: true,
              dataAnuncio: '', imagem: item.thumbnail || '',
              cor: '', combustivel: '', cambio: '',
            };
          })
          .filter(a => a.preco >= config.filtros.precoMin && a.preco <= config.filtros.precoMax);

        resultados.push(...anuncios);
        if (anuncios.length > 0) console.log(`[ML] ${marca} ${modelo} ${estado}: ${anuncios.length}`);
      }
    } catch (err) {
      if (err.response?.status === 403) {
        console.log(`[ML] ${modelo} ${estado}: 403 BLOQUEADO`);
      } else {
        console.log(`[ML] ${modelo} ${estado}: ${err.message}`);
      }
    }

    await sleep(1500);
  }

  return resultados;
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const inicio = Date.now();
  console.log('========================================');
  console.log(`🔍 GARIMPO via GitHub Actions — ${new Date().toISOString()}`);
  console.log('========================================\n');

  limparCache();

  let todosAnuncios = [];
  const fontesUsadas = [];
  let wmBloqueado = 0;
  let mlBloqueado = 0;

  for (const m of config.modelosPrioritarios) {
    console.log(`--- ${m.marca} ${m.modelo} (p${m.prioridade}) ---`);

    // Webmotors
    try {
      const wm = await buscarWebmotors(m.modelo, m.marca);
      todosAnuncios.push(...wm);
      if (wm.length > 0 && !fontesUsadas.includes('Webmotors')) fontesUsadas.push('Webmotors');
    } catch (e) { wmBloqueado++; }

    // Mercado Livre
    try {
      const ml = await buscarMercadoLivre(m.modelo, m.marca);
      todosAnuncios.push(...ml);
      if (ml.length > 0 && !fontesUsadas.includes('MercadoLivre')) fontesUsadas.push('MercadoLivre');
    } catch (e) { mlBloqueado++; }

    await sleep(2000);
  }

  const totalAnalisados = todosAnuncios.length;
  console.log(`\n📊 Total coletados: ${totalAnalisados}`);

  todosAnuncios = removerDuplicatas(todosAnuncios);
  console.log(`📊 Após dedup: ${todosAnuncios.length}`);

  // Calcular margem
  console.log('\n💰 Calculando margens...');
  const oportunidades = await calcularMargem(todosAnuncios);
  console.log(`✅ Oportunidades: ${oportunidades.length}`);

  // Salvar localmente
  if (!fs.existsSync('./resultados')) fs.mkdirSync('./resultados');
  const resultado = {
    data: new Date().toISOString(),
    totalAnalisados,
    oportunidades: oportunidades.slice(0, 50),
    stats: { totalAnalisados, fontes: fontesUsadas },
    fonte: 'github-actions',
  };

  const dataStr = new Date().toISOString().split('T')[0];
  fs.writeFileSync(`./resultados/garimpo-${dataStr}.json`, JSON.stringify(resultado, null, 2));
  console.log(`💾 Salvo: resultados/garimpo-${dataStr}.json`);

  // Enviar pro Railway
  if (RAILWAY_URL) {
    try {
      await axios.post(`${RAILWAY_URL}/api/import`, resultado, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      console.log(`📤 Enviado pro Railway: ${RAILWAY_URL}`);
    } catch (err) {
      console.log(`⚠️ Falha envio Railway: ${err.message}`);
    }
  }

  const tempoTotal = Math.round((Date.now() - inicio) / 1000);
  console.log(`\n✅ Garimpo concluído em ${tempoTotal}s`);
  console.log(`📊 ${totalAnalisados} analisados, ${oportunidades.length} oportunidades, fontes: ${fontesUsadas.join(', ')}`);
  if (wmBloqueado > 0) console.log(`⚠️ WM bloqueado em ${wmBloqueado} modelos`);
  if (mlBloqueado > 0) console.log(`⚠️ ML bloqueado em ${mlBloqueado} modelos`);
}

main().catch(err => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});
