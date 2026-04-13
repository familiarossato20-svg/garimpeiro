require('dotenv').config();

module.exports = {
  // Filtros de busca
  filtros: {
    precoMin: 5000,
    precoMax: 100000,
    margemMinima: 8000,
    anoMinimo: 2012,
    custoPreparacao: 1500, // custo médio pra preparar o carro (revisão, polimento, etc)
    regioes: ['SC', 'PR', 'RS'],
    apenasParticular: true,
  },

  // Modelos prioritários (baseado nos dados de demanda da L-Car)
  modelosPrioritarios: [
    // Alta demanda (vendem rápido na região)
    { modelo: 'Gol', marca: 'VW', prioridade: 1 },
    { modelo: 'Onix', marca: 'Chevrolet', prioridade: 1 },
    { modelo: 'Palio', marca: 'Fiat', prioridade: 1 },
    { modelo: 'HB20', marca: 'Hyundai', prioridade: 1 },
    { modelo: 'Polo', marca: 'VW', prioridade: 1 },
    { modelo: 'Sandero', marca: 'Renault', prioridade: 1 },
    { modelo: 'Classic', marca: 'Chevrolet', prioridade: 1 },
    { modelo: 'Saveiro', marca: 'VW', prioridade: 1 },
    
    // Média demanda
    { modelo: 'Argo', marca: 'Fiat', prioridade: 2 },
    { modelo: 'Cronos', marca: 'Fiat', prioridade: 2 },
    { modelo: 'Etios', marca: 'Toyota', prioridade: 2 },
    { modelo: 'Yaris', marca: 'Toyota', prioridade: 2 },
    { modelo: 'Versa', marca: 'Nissan', prioridade: 2 },
    { modelo: 'Ka', marca: 'Ford', prioridade: 2 },
    { modelo: 'Mobi', marca: 'Fiat', prioridade: 2 },
    { modelo: 'Kwid', marca: 'Renault', prioridade: 2 },
    { modelo: 'Celta', marca: 'Chevrolet', prioridade: 2 },
    { modelo: 'Prisma', marca: 'Chevrolet', prioridade: 2 },
    { modelo: 'Corsa', marca: 'Chevrolet', prioridade: 2 },
    { modelo: 'Uno', marca: 'Fiat', prioridade: 2 },
    { modelo: 'Fox', marca: 'VW', prioridade: 2 },
    { modelo: 'Voyage', marca: 'VW', prioridade: 2 },
    { modelo: 'Fiesta', marca: 'Ford', prioridade: 2 },
    
    // Alta margem (mais caros, demoram mais mas margem compensa)
    { modelo: 'Toro', marca: 'Fiat', prioridade: 3 },
    { modelo: 'Tucson', marca: 'Hyundai', prioridade: 3 },
    { modelo: 'HR-V', marca: 'Honda', prioridade: 3 },
    { modelo: 'Tracker', marca: 'Chevrolet', prioridade: 3 },
    { modelo: 'Renegade', marca: 'Jeep', prioridade: 3 },
    { modelo: 'T-Cross', marca: 'VW', prioridade: 3 },
    { modelo: 'Compass', marca: 'Jeep', prioridade: 3 },
    { modelo: 'Kicks', marca: 'Nissan', prioridade: 3 },
    { modelo: 'Creta', marca: 'Hyundai', prioridade: 3 },
    { modelo: 'Sorento', marca: 'Kia', prioridade: 3 },
  ],

  // APIs FIPE (ordem de tentativa)
  fipeApis: [
    'https://fipeapi.appspot.com/api/1',      // Google AppEngine - menos chance de bloqueio
    'https://parallelum.com.br/fipe/api/v2',  // fallback (pode estar bloqueado do Railway)
  ],
  
  // WhatsApp
  whatsapp: {
    numeroLucas: process.env.WHATSAPP_NUMERO || '5548991458616',
  },

  // Fontes de busca — APENAS as que funcionam
  fontes: {
    olx: false,          // BLOQUEADO — HTTP 403 do IP Railway
    webmotors: true,     // FUNCIONA — única fonte ativa
    mercadolivre: false,  // BLOQUEADO — HTTP 403
    kavak: false,         // NÃO IMPLEMENTADO
    localiza: false,      // AUTH FALHOU — endpoint não existe
    facebook: false,      // requer token específico
  },

  // Horário de execução (cron)
  cronSchedule: '0 7 * * *', // todo dia às 7h
};
