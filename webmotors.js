const axios = require('axios');
const config = require('./config');

const ESTADOS_WM = {
  'SC': 'Santa Catarina',
  'PR': 'Paraná',
  'RS': 'Rio Grande do Sul',
};

/**
 * Extrai string de um campo que pode ser string ou objeto {Name: "..."} ou {Value: "..."}
 */
function str(campo) {
  if (!campo) return '';
  if (typeof campo === 'string') return campo;
  if (typeof campo === 'object') return campo.Name || campo.Value || campo.name || campo.value || String(campo);
  return String(campo);
}

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
            // Dados podem estar na raiz ou em Specification
            const spec = item.Specification || item;
            const seller = item.Seller || spec.Seller || {};

            if (config.filtros.apenasParticular) {
              const sellerType = str(seller.SellerType || seller.sellerType);
              if (sellerType && sellerType !== 'PF') return false;
            }
            return true;
          })
          .map(item => {
            // Dados podem estar na raiz ou em Specification
            const spec = item.Specification || item;

            // Make e Model podem ser objetos {Name: "VW"} ou strings
            const makeName = str(spec.Make) || str(item.Make) || marca;
            const modelName = str(spec.Model) || str(item.Model) || modelo;
            const version = str(spec.Version) || str(item.Version) || '';

            // Preço pode estar em diferentes lugares
            const preco = spec.Price || item.Price
              || item.Prices?.Price || spec.Prices?.Price
              || 0;

            // Ano pode estar em diferentes campos
            const ano = spec.YearFabrication || spec.YearModel
              || item.YearFabrication || item.YearModel
              || 0;

            // KM / Odometer
            const km = spec.Odometer || item.Odometer || spec.NumberPorts || 0;

            // Cidade
            const cidade = str(spec.City) || str(item.City)
              || str(spec.Localization?.City) || str(item.Localization?.City)
              || '';

            // Link
            const uniqueId = item.UniqueId || spec.UniqueId || item.Id || '';
            const link = uniqueId
              ? `https://www.webmotors.com.br/comprar/${uniqueId}`
              : '';

            // Imagem
            const imagem = item.Media?.[0]?.Path || spec.Media?.[0]?.Path
              || item.Photo?.ImageUrl || spec.Photo?.ImageUrl
              || '';

            // Combustível e câmbio
            const combustivel = str(spec.Fuel) || str(item.Fuel) || '';
            const cambio = str(spec.Transmission) || str(item.Transmission) || '';
            const cor = str(spec.Color) || str(item.Color) || '';

            return {
              fonte: 'Webmotors',
              titulo: `${makeName} ${modelName} ${version}`.trim(),
              marca: makeName,
              modelo: modelName,
              ano: ano,
              preco: preco,
              km: km ? `${km} km` : '',
              cidade: cidade,
              estado: estado,
              link: link,
              particular: true, // Já filtrado acima
              dataAnuncio: '',
              imagem: imagem,
              cor: cor,
              combustivel: combustivel,
              cambio: cambio,
            };
          })
          .filter(a => {
            // Validação final
            if (!a.preco || a.preco < config.filtros.precoMin || a.preco > config.filtros.precoMax) return false;
            if (a.ano && a.ano < config.filtros.anoMinimo) return false;
            if (!a.marca || !a.modelo) return false;
            return true;
          });

        resultados.push(...anuncios);
        console.log(`[WM] ${marca} ${modelo} em ${estado}: ${anuncios.length} anúncios`);
      } else {
        console.log(`[WM] ${marca} ${modelo} em ${estado}: sem SearchResults no response`);
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
