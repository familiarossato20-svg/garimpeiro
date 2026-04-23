# Garimpeiro L-Car — Migração pro Manus

## O que é
Sistema que busca veículos seminovos no Webmotors (SC/PR/RS), calcula margem vs FIPE, e mostra oportunidades no dashboard. Roda 1x/dia às 7h.

## Contexto da migração
O Railway + Apify funciona mas tem 3 problemas: PerimeterX bloqueia APIs do Railway, Apify consome créditos ($0.10/run), e a stack tá fragmentada entre 3 serviços. O Manus resolve tudo: browser automation nativo bypassa PerimeterX, zero custo adicional, e consolida tudo num lugar.

## O que precisa fazer

### 1. SCRAPING — Webmotors via browser automation

O Manus acessa diretamente a API do Webmotors usando browser real (sem proxy, sem bloqueio).

**Modelos e URLs:**
```
18 modelos × 3 estados = 54 URLs

Marcas/Modelos (slug pra URL):
volkswagen: gol, polo, saveiro, fox, voyage, t-cross
chevrolet: onix, classic, celta, prisma, corsa, tracker
fiat: palio, argo, cronos, mobi, uno, toro, renegade
hyundai: hb20, tucson, creta
renault: sandero, kwid
toyota: etios, yaris
nissan: versa, kicks
ford: ka, fiesta
honda: hr-v
jeep: compass
kia: sorento

Estados:
SC = santa-catarina
PR = parana
RS = rio-grande-do-sul
```

**URL da API pra cada modelo+estado:**
```
https://www.webmotors.com.br/api/search/car?url=https%3A%2F%2Fwww.webmotors.com.br%2Fcarros%2Festoque%2F{marca}%2F{modelo}%2F{estado}&DisplayPerPage=24&DisplayPage=1
```

**Exemplo real:**
```
https://www.webmotors.com.br/api/search/car?url=https%3A%2F%2Fwww.webmotors.com.br%2Fcarros%2Festoque%2Fvolkswagen%2Fgol%2Fsanta-catarina&DisplayPerPage=24&DisplayPage=1
```

**Resposta JSON — estrutura de cada item em SearchResults[]:**
```json
{
  "UniqueId": 64445902,
  "Specification": {
    "Make": {"Value": "FORD"},
    "Model": {"Value": "RANGER"},
    "Version": {"Value": "2.0 TURBO DIESEL CD BLACK 4X2 AUTOMATICO"},
    "YearFabrication": "2022",
    "YearModel": "2022",
    "Odometer": 85000,
    "Color": {"Primary": "Preto"},
    "Fuel": {"Value": "Diesel"},
    "Transmission": {"Value": "Automática"}
  },
  "Prices": {
    "Price": 295900,
    "SearchPrice": 295900
  },
  "Seller": {
    "City": "Curitiba",
    "State": "Paraná (PR)",
    "SellerType": "PJ"
  },
  "PhotoPath": "url-da-foto.webp"
}
```

**Parsing — extrair de cada item:**
```javascript
const gv = (v) => (!v ? '' : typeof v === 'string' ? v : v.Value || v.Name || '');

// Extrair estado real do vendedor
const sellerState = gv(seller.State); // "Paraná (PR)"
const pIdx = sellerState.indexOf('(');
const cIdx = sellerState.indexOf(')');
const estadoReal = pIdx > -1 ? sellerState.substring(pIdx + 1, cIdx) : '';

// Filtros
if (!['SC', 'PR', 'RS'].includes(estadoReal)) continue; // só sul
if (preco < 5000 || preco > 100000) continue;             // faixa de preço
if (ano < 2012) continue;                                  // ano mínimo
```

**Dedup:** usar UniqueId pra remover duplicatas (mesmo carro aparece em múltiplas buscas).

---

### 2. FIPE — Consulta de preço de referência

Usa API Parallelum (grátis, sem auth):

```
Marcas:   GET https://parallelum.com.br/fipe/api/v2/cars/brands
Modelos:  GET https://parallelum.com.br/fipe/api/v2/cars/brands/{marcaId}/models
Anos:     GET https://parallelum.com.br/fipe/api/v2/cars/brands/{marcaId}/models/{modeloId}/years
Preço:    GET https://parallelum.com.br/fipe/api/v2/cars/brands/{marcaId}/models/{modeloId}/years/{anoId}
```

**Matching de marca:** normalizar nome (ex: "VOLKSWAGEN" → buscar "VW" ou "Volkswagen" na lista de marcas FIPE). Aliases: VW=Volkswagen, GM=Chevrolet.

**Matching de modelo:** quando múltiplos modelos matcham (ex: "Yaris" → "Yaris XL", "Yaris XLS", "Yaris Cross"), pegar o de **nome mais curto** (versão base = mais barata). Isso evita comparar Yaris base com Yaris Cross que custa R$150k.

**Cache:** agrupar anúncios por marca+modelo+ano e consultar FIPE 1x por grupo (não 1x por anúncio). ~1200 anúncios → ~60 grupos únicos.

---

### 3. MARGEM — Cálculo

```javascript
const custoPreparacao = 1500; // revisão, polimento, documentação
const margemBruta = fipePreco - precoAnuncio;
const margemLiquida = margemBruta - custoPreparacao;
const percentualAbaixo = ((fipePreco - precoAnuncio) / fipePreco) * 100;

// Score composto pra ranking
const score = (margemLiquida / 1000) * 3 + percentualAbaixo * 2 + prioridadeBonus;
// prioridadeBonus: p1=30, p2=20, p3=10

// Filtro: só mostrar se margemLiquida >= 8000
```

---

### 4. DASHBOARD — O que mostrar

**Cards no topo:**
- Oportunidades (count)
- Melhor margem (R$)
- Margem média (R$)
- Anúncios analisados
- Fontes ativas
- Última execução (hora)

**Filtros:**
- Fonte (Webmotors/MercadoLivre/Todas)
- Estado (SC/PR/RS/Todos)
- Busca por modelo

**Tabela de oportunidades (top 50 por score):**
| # | Veículo | Preço | FIPE | Margem | % Abaixo | Fonte | Link |
|---|---------|-------|------|--------|----------|-------|------|

**Dados de cada oportunidade:**
```json
{
  "titulo": "RENAULT SANDERO 1.6 16V SCE FLEX STEPWAY EASY-R",
  "marca": "RENAULT", "modelo": "SANDERO", "ano": 2013,
  "preco": 27990, "fipe": 42221, 
  "margemBruta": 14231, "margemLiquida": 12731,
  "percentualAbaixoFipe": 33.7, "score": 120,
  "km": "85000 km", "cidade": "Curitiba", "estado": "PR",
  "link": "https://www.webmotors.com.br/comprar/64445902",
  "fonte": "Webmotors"
}
```

---

### 5. SCHEDULE — Execução automática

Rodar 1x/dia às 7h BRT (10:00 UTC). Fluxo:
1. Scrape 54 URLs do Webmotors (~1200 resultados brutos)
2. Dedup por UniqueId
3. Filtrar SC/PR/RS + R$5k-100k + ano≥2012
4. Consultar FIPE por grupo marca+modelo+ano
5. Calcular margem e score
6. Salvar top 50 oportunidades
7. (Opcional) Enviar resumo via WhatsApp

---

### 6. WHATSAPP — Relatório diário (opcional)

Depois do garimpo, enviar mensagem pro Lucas:
```
🔍 Garimpeiro L-Car — 23/04/2026

✅ 27 anúncios analisados (SC/PR/RS)
🎯 2 oportunidades com margem ≥ R$ 8.000

Top 3:
1. RENAULT SANDERO 2013 — R$ 27.990 (FIPE R$ 42.221) — Margem R$ 12.731 — Curitiba/PR
2. TOYOTA ETIOS 2016 — R$ 52.000 (FIPE R$ 67.988) — Margem R$ 14.488 — Curitiba/PR

📊 Dashboard: https://garimpeiro-production.up.railway.app
```

---

## Código-fonte

Todos os arquivos estão neste repo:
- `config.js` — configurações, modelos, filtros
- `fipe.js` — consulta FIPE multi-API com cache
- `margem.js` — cálculo de margem agrupado
- `dashboard.js` — geração de HTML do dashboard
- `index.js` — servidor HTTP com endpoints
- `apify.js` — integração Apify (pode ser substituída por browser automation do Manus)

## Endpoints atuais (Railway)

```
GET  /              — Dashboard HTML
GET  /health        — Status JSON
GET  /api/resultado — Último resultado JSON
GET  /api/garimpo-status — Status do garimpo em andamento
GET  /api/garimpo-apify — Dispara garimpo via Apify
POST /api/import-raw — Recebe anúncios brutos, calcula FIPE
```

## Dados confirmados (último garimpo funcional)

- 1.224 anúncios brutos da Apify (54 URLs Webmotors)
- 27 únicos de SC/PR/RS após dedup + filtro
- 2 oportunidades com margem ≥ R$8.000
- FIPE Parallelum funcionando
- Dashboard renderizando corretamente
