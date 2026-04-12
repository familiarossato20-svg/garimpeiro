const config = require('./config');
const { buscarOLX } = require('./olx');
const { buscarMercadoLivre } = require('./mercadolivre');
const { buscarWebmotors } = require('./webmotors');
const { buscarLocaliza } = require('./localiza');
const { calcularMargem, removerDuplicatas } = require('./margem');
const { formatarRelatorio } = require('./relatorio');
const { limparCache } = require('./fipe');
const axios = require('axios');

/**
 * Executa o garimpo completo
 */
async function executarGarimpo() {
  const inicio = Date.now();
  console.log('\n========================================');
  console.log(`🔍 GARIMPEIRO L-CAR — ${new Date().toLocaleString('pt-BR')}`);
  console.log('========================================\n');

  // Limpar cache FIPE do dia anterior
  limparCache();

  let todosAnuncios = [];
  const fontesUsadas = [];

  // Buscar em cada fonte, modelo por modelo
  for (const modeloConfig of config.modelosPrioritarios) {
    console.log(`\n--- Buscando: ${modeloConfig.marca} ${modeloConfig.modelo} (prioridade ${modeloConfig.prioridade}) ---`);

    // OLX
    if (config.fontes.olx) {
      try {
        const resultados = await buscarOLX(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...resultados);
        if (!fontesUsadas.includes('OLX')) fontesUsadas.push('OLX');
      } catch (err) {
        console.error(`[GARIMPEIRO] Erro OLX ${modeloConfig.modelo}: ${err.message}`);
      }
    }

    // Mercado Livre
    if (config.fontes.mercadolivre) {
      try {
        const resultados = await buscarMercadoLivre(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...resultados);
        if (!fontesUsadas.includes('MercadoLivre')) fontesUsadas.push('MercadoLivre');
      } catch (err) {
        console.error(`[GARIMPEIRO] Erro ML ${modeloConfig.modelo}: ${err.message}`);
      }
    }

    // Webmotors
    if (config.fontes.webmotors) {
      try {
        const resultados = await buscarWebmotors(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...resultados);
        if (!fontesUsadas.includes('Webmotors')) fontesUsadas.push('Webmotors');
      } catch (err) {
        console.error(`[GARIMPEIRO] Erro WM ${modeloConfig.modelo}: ${err.message}`);
      }
    }

    // Localiza Repasse
    if (config.fontes.localiza) {
      try {
        const resultados = await buscarLocaliza(modeloConfig.modelo, modeloConfig.marca);
        todosAnuncios.push(...resultados);
        if (!fontesUsadas.includes('Localiza')) fontesUsadas.push('Localiza');
      } catch (err) {
        console.error(`[GARIMPEIRO] Erro Localiza ${modeloConfig.modelo}: ${err.message}`);
      }
    }

    // Delay entre modelos pra não sobrecarregar
    await sleep(3000);
  }

  const totalAnalisados = todosAnuncios.length;
  console.log(`\n📊 Total de anúncios coletados: ${totalAnalisados}`);

  // Remover duplicatas
  todosAnuncios = removerDuplicatas(todosAnuncios);
  console.log(`📊 Após remover duplicatas: ${todosAnuncios.length}`);

  // Calcular margem e ranquear
  console.log('\n💰 Calculando margens com FIPE...');
  const oportunidades = await calcularMargem(todosAnuncios);
  console.log(`✅ Oportunidades com margem ≥ R$${config.filtros.margemMinima.toLocaleString('pt-BR')}: ${oportunidades.length}`);

  // Gerar relatório
  const stats = {
    totalAnalisados,
    fontes: fontesUsadas,
  };

  const relatorio = formatarRelatorio(oportunidades, stats);

  // Enviar pro WhatsApp
  await enviarWhatsApp(relatorio);

  // Salvar resultado em JSON (pra consulta posterior)
  const fs = require('fs');
  const resultado = {
    data: new Date().toISOString(),
    totalAnalisados,
    oportunidades: oportunidades.slice(0, 20), // top 20
    stats,
  };
  
  fs.writeFileSync(
    `./resultados/garimpo-${new Date().toISOString().split('T')[0]}.json`,
    JSON.stringify(resultado, null, 2)
  );

  const tempoTotal = Math.round((Date.now() - inicio) / 1000);
  console.log(`\n✅ Garimpo concluído em ${tempoTotal} segundos`);
  console.log(`📱 Relatório enviado pro WhatsApp\n`);

  return oportunidades;
}

/**
 * Envia mensagem pro WhatsApp do Lucas
 * Usa a mesma infraestrutura do bot financeiro (Baileys/Evolution API)
 * Ou pode usar a API do BotConversa
 */
async function enviarWhatsApp(mensagem) {
  const numero = config.whatsapp.numeroLucas;
  
  // Opção 1: Via API do BotConversa
  if (process.env.BOTCONVERSA_API_KEY) {
    try {
      await axios.post(
        'https://backend.botconversa.com.br/api/v1/webhook/subscriber/send_message/',
        {
          phone: numero,
          message: mensagem,
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.BOTCONVERSA_API_KEY}`,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('[WHATSAPP] Mensagem enviada via BotConversa');
      return;
    } catch (err) {
      console.log(`[WHATSAPP] BotConversa falhou: ${err.message}`);
    }
  }

  // Opção 2: Via Evolution API (se configurado)
  if (process.env.EVOLUTION_API_URL) {
    try {
      await axios.post(
        `${process.env.EVOLUTION_API_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`,
        {
          number: numero,
          text: mensagem,
        },
        {
          headers: {
            'apikey': process.env.EVOLUTION_API_KEY,
            'Content-Type': 'application/json',
          },
        }
      );
      console.log('[WHATSAPP] Mensagem enviada via Evolution API');
      return;
    } catch (err) {
      console.log(`[WHATSAPP] Evolution API falhou: ${err.message}`);
    }
  }

  // Opção 3: Salvar localmente se nenhuma API estiver configurada
  console.log('[WHATSAPP] Nenhuma API configurada. Relatório salvo localmente.');
  console.log('\n' + mensagem);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { executarGarimpo };
