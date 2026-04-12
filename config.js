require('dotenv').config();

module.exports = {
  filtros: {
    precoMin: 5000,
    precoMax: 100000,
    margemMinima: 8000,
    anoMinimo: 2012,
    custoPreparacao: 1500,
    regioes: ['SC', 'PR', 'RS'],
    apenasParticular: true,
  },

  modelosPrioritarios: [
    { modelo: 'Gol', marca: 'VW', prioridade: 1 },
    { modelo: 'Onix', marca: 'Chevrolet', prioridade: 1 },
    { modelo: 'Palio', marca: 'Fiat', prioridade: 1 },
    { modelo: 'HB20', marca: 'Hyundai', prioridade: 1 },
    { modelo: 'Polo', marca: 'VW', prioridade: 1 },
    { modelo: 'Sandero', marca: 'Renault', prioridade: 1 },
    { modelo: 'Classic', marca: 'Chevrolet', prioridade: 1 },
    { modelo: 'Saveiro', marca: 'VW', prioridade: 1 },
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

  fipeApi: 'https://parallelum.com.br/fipe/api/v2',

  whatsapp: {
    numeroLucas: process.env.WHATSAPP_NUMERO || '5548991458616',
  },

  // OLX e ML bloqueados do Railway (403). Localiza auth nao funciona.
  // Apenas Webmotors funciona de cloud servers.
  fontes: {
    olx: false,
    webmotors: true,
    mercadolivre: false,
    localiza: false,
    facebook: false,
  },

  cronSchedule: '0 7 * * *',
};
