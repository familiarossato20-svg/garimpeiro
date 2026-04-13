const axios = require('axios');
const config = require('./config');

const ESTADOS_WM = {
  'SC': 'Santa Catarina',
  'PR': 'Paraná',
  'RS': 'Rio Grande do Sul',
};

// Mapeamento de aliases de marca (config → possíveis nomes na API)
const MARCA_ALIASES = {
  'vw': ['volkswagen'],
  'volkswagen': ['vw'],
  'chevrolet': ['gm', 'gm - chevrolet'],
  'gm': ['chevrolet'],
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

// Mapeamento de nomes de marca pra formato da API Webmotors
const MARCA_API = {
  'VW': 'Volkswagen',
  'Chevrolet': 'Chevrolet',  // API aceita Chevrolet direto
  'Fiat': 'Fiat',
  'Hyundai': 'Hyundai',
  'Renault': 'Renault',
  'Ford': 'Ford',
  'Toyota': 'Toyota',
  'Honda': 'Honda',
  'Nissan': 'Nissan',
  'Jeep': 'Jeep',
  'Kia': 'Kia',
};

async function buscarWebmotors(modelo, marca) {
  const resultados = [];
  const marcaSlug = (MARCA_API[marca] || marca).toLowerCase();
  const modeloSlug = modelo.toLowerCase().replace(/[-\s]+/g, '-');

  for (const estado of config.filtros.regioes) {
    const estadoNome = ESTADOS_WM[estado];
    if (!estadoNome) continue;

    try {
      // Formato correto: usar url= com path do site Webmotors
      // Make/Model como query params não funcionam mais (API mudou)
      const wmUrl = `https://www.webmotors.com.br/carros/estoque/${marcaSlug}/${modeloSlug}`;

      const { data } = await axios.get('https://www.webmotors.com.br/api/search/car', {
        params: {
          url: wmUrl,
          State: estadoNome,
          PriceRange: `${config.filtros.precoMin}-${config.filtros.precoMax}`,
          YearRange: `${config.filtros.anoMinimo}-2026`,
          SearchOrder: 1,
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
            // Webmotors é plataforma de lojas — NÃO filtrar por particular
            // (SellerType é sempre "PJ" no Webmotors)

            // Filtrar pelo modelo que realmente estamos buscando
            // A API às vezes retorna resultados genéricos/promovidos que não batem
            const spec = item.Specification || item;
            const modeloResult = str(spec.Model).toLowerCase();
            const makeResult = str(spec.Make).toLowerCase();
            const modeloBusca = modelo.toLowerCase();
            const marcaBusca = marca.toLowerCase();

            // Verifica se o resultado é da marca/modelo que buscamos
            const marcaOk = makeResult.includes(marcaBusca) || marcaBusca.includes(makeResult)
              || MARCA_ALIASES[marcaBusca]?.some(a => makeResult.includes(a));
            const modeloOk = modeloResult.includes(modeloBusca) || modeloBusca.includes(modeloResult);

            if (!marcaOk || !modeloOk) return false;

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
            const preco = item.Prices?.Price || spec.Prices?.Price
              || spec.Price || item.Price
              || 0;

            // Ano — YearFabrication pode ser string "2021"
            const ano = parseInt(spec.YearFabrication || spec.YearModel
              || item.YearFabrication || item.YearModel) || 0;

            // KM / Odometer (NÃO NumberPorts que é portas!)
            const km = spec.Odometer || item.Odometer || 0;

            // Cidade — está em Seller, não em Specification
            const seller = item.Seller || {};
            const cidade = str(seller.City) || str(spec.City) || str(item.City) || '';

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
