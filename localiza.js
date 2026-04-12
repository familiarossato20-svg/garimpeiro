const axios = require('axios');
const config = require('./config');

// Localiza Repasse API
// Login: https://seminovos.localiza.com/repasse ou similar
// Precisa de email + senha pra autenticar

let authToken = null;
let tokenExpiry = 0;

async function autenticar() {
  if (authToken && Date.now() < tokenExpiry) return authToken;

  const email = process.env.LOCALIZA_EMAIL;
  const senha = process.env.LOCALIZA_SENHA;

  if (!email || !senha) {
    console.log('[LOCALIZA] Credenciais não configuradas. Pule LOCALIZA_EMAIL e LOCALIZA_SENHA no .env');
    return null;
  }

  try {
    // Endpoint de login da Localiza Repasse
    const { data } = await axios.post('https://api.seminovos.localiza.com/auth/login', {
      email: email,
      password: senha,
    }, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });

    authToken = data.token || data.access_token || data.accessToken;
    tokenExpiry = Date.now() + (3600 * 1000); // 1 hora
    console.log('[LOCALIZA] Autenticado com sucesso');
    return authToken;
  } catch (err) {
    console.log(`[LOCALIZA] Erro autenticação: ${err.message}`);
    
    // Tenta endpoint alternativo
    try {
      const { data } = await axios.post('https://seminovos.localiza.com/api/auth/signin', {
        username: email,
        password: senha,
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });

      authToken = data.token || data.access_token;
      tokenExpiry = Date.now() + (3600 * 1000);
      console.log('[LOCALIZA] Autenticado (endpoint alternativo)');
      return authToken;
    } catch (err2) {
      console.log(`[LOCALIZA] Falha total autenticação: ${err2.message}`);
      return null;
    }
  }
}

async function buscarLocaliza(modelo, marca) {
  const resultados = [];
  const token = await autenticar();
  
  if (!token) return resultados;

  try {
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    };

    // Buscar veículos disponíveis
    const { data } = await axios.get('https://api.seminovos.localiza.com/vehicles', {
      params: {
        brand: marca,
        model: modelo,
        priceMin: config.filtros.precoMin,
        priceMax: config.filtros.precoMax,
        yearMin: config.filtros.anoMinimo,
        states: config.filtros.regioes.join(','),
        page: 1,
        pageSize: 50,
        sort: 'price_asc',
      },
      headers,
      timeout: 15000,
    });

    const veiculos = data.vehicles || data.items || data.data || [];

    veiculos.forEach(v => {
      const preco = v.price || v.valor || v.salePrice || 0;
      const ano = v.year || v.yearModel || v.modelYear || 0;

      if (preco < config.filtros.precoMin || preco > config.filtros.precoMax) return;
      if (ano < config.filtros.anoMinimo) return;

      resultados.push({
        fonte: 'Localiza',
        titulo: `${v.brandName || marca} ${v.modelName || modelo} ${ano}`,
        marca: v.brandName || marca,
        modelo: v.modelName || modelo,
        ano: ano,
        preco: preco,
        km: v.mileage || v.km || v.odometer || '',
        cidade: v.city || v.cityName || '',
        estado: v.state || v.uf || '',
        link: v.url || `https://seminovos.localiza.com/veiculo/${v.id || v.vehicleId}`,
        particular: false, // Localiza é frota, mas preço compensa
        dataAnuncio: v.publishDate || '',
        imagem: v.imageUrl || v.photos?.[0] || '',
        // Dados extras da Localiza
        placa: v.licensePlate || '',
        cor: v.color || v.colorName || '',
        combustivel: v.fuel || v.fuelType || '',
        cambio: v.transmission || v.gearbox || '',
        portas: v.doors || '',
      });
    });

    console.log(`[LOCALIZA] ${marca} ${modelo}: ${resultados.length} veículos`);
  } catch (err) {
    console.log(`[LOCALIZA] Erro busca ${modelo}: ${err.message}`);
    
    // Se token expirou, tenta reautenticar
    if (err.response?.status === 401) {
      authToken = null;
      tokenExpiry = 0;
    }
  }

  await sleep(2000);
  return resultados;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { buscarLocaliza };
