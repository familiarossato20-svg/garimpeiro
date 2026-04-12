const axios = require('axios');
const config = require('./config');

let authToken = null;
let tokenExpiry = 0;

async function autenticar() {
  if (authToken && Date.now() < tokenExpiry) return authToken;

  const email = process.env.LOCALIZA_EMAIL;
  const senha = process.env.LOCALIZA_SENHA;
  if (!email || !senha) { console.log('[LOCALIZA] Sem credenciais'); return null; }

  const endpoints = [
    { url: 'https://api.seminovos.localiza.com/auth/login', body: { email, password: senha } },
    { url: 'https://seminovos.localiza.com/api/auth/signin', body: { username: email, password: senha } },
    { url: 'https://seminovos.localiza.com/api/v1/auth/login', body: { email, senha } },
  ];

  for (const ep of endpoints) {
    try {
      console.log(`[LOCALIZA] Tentando auth: ${ep.url}`);
      const { data } = await axios.post(ep.url, ep.body, {
        headers: { 'Content-Type': 'application/json' }, timeout: 15000,
      });
      authToken = data.token || data.access_token || data.accessToken;
      if (authToken) {
        tokenExpiry = Date.now() + 3600000;
        console.log('[LOCALIZA] Autenticado!');
        return authToken;
      }
    } catch (err) {
      console.log(`[LOCALIZA] Auth falhou ${ep.url}: ${err.response?.status || err.message}`);
    }
  }
  console.log('[LOCALIZA] Nenhum endpoint de auth funcionou');
  return null;
}

async function buscarLocaliza(modelo, marca) {
  const resultados = [];
  const token = await autenticar();
  if (!token) return resultados;

  const searchEndpoints = [
    'https://api.seminovos.localiza.com/vehicles',
    'https://seminovos.localiza.com/api/vehicles',
    'https://seminovos.localiza.com/api/v1/vehicles',
  ];

  for (const url of searchEndpoints) {
    try {
      console.log(`[LOCALIZA] Buscando ${marca} ${modelo} via ${url}`);
      const { data, status } = await axios.get(url, {
        params: { brand: marca, model: modelo, priceMin: config.filtros.precoMin, priceMax: config.filtros.precoMax, yearMin: config.filtros.anoMinimo, states: config.filtros.regioes.join(','), page: 1, pageSize: 50 },
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      console.log(`[LOCALIZA] HTTP ${status}`);
      const veiculos = data.vehicles || data.items || data.data || data.content || [];
      veiculos.forEach(v => {
        const preco = v.price || v.valor || v.salePrice || 0;
        const ano = v.year || v.yearModel || v.modelYear || 0;
        if (preco < config.filtros.precoMin || preco > config.filtros.precoMax) return;
        if (ano < config.filtros.anoMinimo) return;
        resultados.push({
          fonte: 'Localiza', titulo: `${v.brandName || marca} ${v.modelName || modelo} ${ano}`,
          marca: v.brandName || marca, modelo: v.modelName || modelo, ano, preco,
          km: v.mileage || v.km || '', cidade: v.city || v.cityName || '', estado: v.state || v.uf || '',
          link: v.url || `https://seminovos.localiza.com/veiculo/${v.id || v.vehicleId}`,
          particular: false, dataAnuncio: '', imagem: v.imageUrl || v.photos?.[0] || '',
          cor: v.color || '', combustivel: v.fuel || '', cambio: v.transmission || '',
        });
      });
      if (veiculos.length > 0) break;
    } catch (err) {
      console.log(`[LOCALIZA] ERRO ${url}: ${err.response?.status || err.message}`);
    }
  }
  console.log(`[LOCALIZA] Total ${marca} ${modelo}: ${resultados.length}`);
  return resultados;
}

module.exports = { buscarLocaliza };
