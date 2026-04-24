# Garimpeiro L-Car — Expansão Multi-Fontes

## Contexto
O Garimpeiro atual só busca no Webmotors. Precisa expandir pra 6 fontes pra cobrir todo o mercado de SC/PR/RS. O Manus tem browser automation — use pra acessar todas as fontes direto, sem proxy.

## Fontes a implementar

### 1. WEBMOTORS ✅ (já implementado)
- URL API: `https://www.webmotors.com.br/api/search/car?url={url_encoded}&DisplayPerPage=24&DisplayPage=1`
- Dados em `SearchResults[]` → `Specification.Make.Value`, `Prices.Price`, `Seller.State`
- PerimeterX ativo — usar Apify com proxy RESIDENTIAL se 403

### 2. OLX
- **URL busca:** `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-sc?pe={precoMax}&ps={precoMin}&re=2&rs=30`
- **Estados:** `/estado-sc`, `/estado-pr`, `/estado-rs`
- **Scraping:** OLX renderiza server-side. O JSON dos anúncios fica no `<script>` tag `__NEXT_DATA__` ou na variável `window.__APOLLO_STATE__`
- **Dados extrair:** título, preço, ano, km, cidade, estado, link, fotos
- **Filtros URL:** `pe=100000` (preço até), `ps=5000` (preço desde), `re=2` (particular+profissional), `rs=30` (resultados)
- **Paginação:** `?o=2` pra página 2
- **Anti-bot:** PerimeterX — usar browser automation ou Apify RESIDENTIAL
- **Exemplo URL completa:** `https://www.olx.com.br/autos-e-pecas/carros-vans-e-utilitarios/estado-sc?pe=100000&ps=5000`

### 3. FACEBOOK MARKETPLACE
- **URL busca:** `https://www.facebook.com/marketplace/florianopolis/vehicles?minPrice=5000&maxPrice=100000&sortBy=creation_time_descend`
- **Cidades principais:**
  - SC: florianopolis, joinville, blumenau, chapeco
  - PR: curitiba, londrina, maringa, cascavel
  - RS: porto-alegre, caxias-do-sul, pelotas
- **Scraping:** Facebook é o mais difícil. Opções:
  1. Browser automation logado (precisa conta FB) — acessa Marketplace, scrolla, extrai cards
  2. Graph API (precisa Facebook App Token) — endpoint `/marketplace_search`
  3. Apify Actor `apify/facebook-marketplace-scraper`
- **Dados extrair:** título, preço, localização, link, foto
- **Nota:** Marketplace não tem API pública oficial. Browser automation é a melhor opção.
- **Prioridade:** ALTA — muitos particulares vendem aqui com preço abaixo do mercado

### 4. AUTO AVALIAR (autoavaliar.com.br)
- **O que é:** Plataforma de avaliação e compra de veículos. Concessionárias e lojistas usam pra comprar carros avaliados.
- **URL:** `https://www.autoavaliar.com.br`
- **Scraping:** Precisa login de lojista. Lucas provavelmente tem conta.
- **Dados:** Veículos avaliados com laudo, preço sugerido de compra, fotos, condição
- **Implementação:** Browser automation logado → listar veículos disponíveis na região → extrair dados
- **Valor:** Preços geralmente abaixo do mercado porque o vendedor quer vender rápido

### 5. LOCALIZA REPASSE (Portal do Lojista)
- **O que é:** Localiza vende veículos da frota (ex-aluguel) pra lojistas via portal próprio
- **URL:** `https://seminovos.localiza.com` ou portal específico pra lojistas
- **Scraping:** Precisa login de lojista credenciado
- **Dados:** Veículos de frota com KM alto mas preço competitivo, laudo completo
- **Filtros:** Região Sul, preço até R$100k
- **Valor:** Carros padronizados, revisados, preço fixo — margem previsível
- **Nota:** Já tentamos antes e o portal não tinha API pública. Com browser automation do Manus logado, funciona.

### 6. PASSE CARROS (passecarros.com.br)
- **O que é:** Plataforma de repasse entre lojistas. Lojistas postam carros que querem vender pra outros lojistas.
- **URL:** `https://www.passecarros.com.br`
- **Scraping:** Precisa login de lojista
- **Dados:** Veículos com preço de repasse (geralmente abaixo do varejo), cidade, estado
- **Filtros:** Região, preço, modelo
- **Valor:** Preços de atacado — margem mais alta que varejo

---

## Estrutura de dados unificada

Todas as fontes devem retornar o mesmo formato:

```typescript
interface Anuncio {
  fonte: 'Webmotors' | 'OLX' | 'FacebookMP' | 'AutoAvaliar' | 'LocalizaRepasse' | 'PasseCarros';
  titulo: string;        // "VOLKSWAGEN GOL 1.0 12V MPI"
  marca: string;         // "VOLKSWAGEN"
  modelo: string;        // "GOL"
  ano: number;           // 2019
  preco: number;         // 35000
  km: string;            // "45000 km"
  cidade: string;        // "Florianópolis"
  estado: string;        // "SC"
  link: string;          // URL do anúncio original
  particular: boolean;   // true se vendedor particular
  imagem: string;        // URL da foto principal
  uniqueId: string;      // ID único por fonte (ex: "wm-64445902", "olx-123456")
}
```

## Dedup cross-fonte

Mesmo veículo pode aparecer em múltiplas fontes. Dedup por:
1. UniqueId (dentro da mesma fonte)
2. Cross-fonte: se marca + modelo + ano + cidade são iguais E preço difere < 5%, provavelmente é o mesmo carro → manter o de menor preço

## FIPE — já implementado
Usar API Parallelum: `https://parallelum.com.br/fipe/api/v2/cars/brands`
Cache por marca+modelo+ano. Matching: nome mais curto quando ambíguo.

## Prioridade de implementação

1. **OLX** — maior volume de particulares, preços mais baixos
2. **Facebook Marketplace** — particulares vendendo rápido, preços abaixo do mercado
3. **Passe Carros** — preços de atacado entre lojistas
4. **Localiza Repasse** — carros de frota com preço fixo
5. **Auto Avaliar** — veículos avaliados com laudo
6. **Webmotors** — já implementado ✅

## Credenciais necessárias

Se alguma fonte precisar de login (Auto Avaliar, Localiza, Passe Carros), pergunte ao Lucas as credenciais. Ele tem conta de lojista nessas plataformas.

## Apify como fallback

Se browser automation do Manus tomar 403 em alguma fonte, usar Apify:
- Token: configurado no Railway (env var APIFY_TOKEN)
- Actor: `apify~web-scraper`
- Proxy: `apifyProxyGroups: ['RESIDENTIAL']`
- Custo: ~$0.06/run (free tier $5/mês)

## Dashboard

Atualizar o dashboard existente pra:
- Mostrar fonte de cada oportunidade (badge colorido)
- Filtro por fonte (dropdown com todas as 6 fontes)
- Card "Fontes ativas" mostrando quantas fontes retornaram dados
- Ranking unificado por score (cross-fonte)
