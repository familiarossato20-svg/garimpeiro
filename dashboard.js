function gerarDashboardHTML(oportunidades, stats, historico) {
  const hoje = new Date().toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const temFipe = oportunidades.some(o => !o.semFipe);
  const modoFallback = oportunidades.length > 0 && !temFipe;

  const topMargem = !modoFallback && oportunidades.length > 0
    ? `R$ ${oportunidades[0].margemLiquida.toLocaleString('pt-BR')}`
    : 'N/A';

  const mediaMargens = !modoFallback && oportunidades.length > 0
    ? `R$ ${Math.round(oportunidades.reduce((s, o) => s + o.margemLiquida, 0) / oportunidades.length).toLocaleString('pt-BR')}`
    : 'N/A';

  const porFonte = {};
  oportunidades.forEach(o => {
    porFonte[o.fonte] = (porFonte[o.fonte] || 0) + 1;
  });

  const subtitulo = modoFallback
    ? `${hoje} — ${oportunidades.length} anúncios encontrados (FIPE indisponível — sem cálculo de margem)`
    : `${hoje} — ${oportunidades.length} oportunidades com margem ≥ R$ 8.000`;

  const rows = oportunidades.map((op, i) => {
    const badge = op.fonte === 'OLX' ? '#7B1FA2'
      : op.fonte === 'MercadoLivre' ? '#FFE600'
      : op.fonte === 'Webmotors' ? '#E53935'
      : op.fonte === 'Localiza' ? '#00C853'
      : '#666';
    const badgeText = op.fonte === 'MercadoLivre' ? '#000' : '#fff';

    const fipeCol = op.semFipe ? '<td class="fipe" style="color:#555">—</td>' : `<td class="fipe">R$ ${op.fipe.toLocaleString('pt-BR')}</td>`;
    const margemCol = op.semFipe ? '<td class="margem" style="color:#FFB300">Sem FIPE</td>' : `<td class="margem">R$ ${op.margemLiquida.toLocaleString('pt-BR')}</td>`;
    const percentCol = op.semFipe ? '<td class="percent" style="color:#555">—</td>' : `<td class="percent">${op.percentualAbaixoFipe}%</td>`;

    return `
      <tr class="row" onclick="toggleDetalhes(${i})">
        <td class="rank">${i + 1}</td>
        <td>
          <div class="veiculo-nome">${op.marca} ${op.modelo} ${op.ano || ''}</div>
          <div class="veiculo-local">📍 ${op.cidade || '?'} - ${op.estado || '?'}</div>
        </td>
        <td class="preco">R$ ${op.preco.toLocaleString('pt-BR')}</td>
        ${fipeCol}
        ${margemCol}
        ${percentCol}
        <td><span class="badge" style="background:${badge};color:${badgeText}">${op.fonte}</span></td>
        <td class="actions">
          ${op.link ? `<a href="${op.link}" target="_blank" class="btn-link">Ver anúncio</a>` : ''}
        </td>
      </tr>
      <tr class="detalhes" id="det-${i}" style="display:none">
        <td colspan="8">
          <div class="detalhes-content">
            ${op.km ? `<span>🛣️ KM: ${op.km}</span>` : ''}
            ${op.cor ? `<span>🎨 Cor: ${op.cor}</span>` : ''}
            ${op.combustivel ? `<span>⛽ ${op.combustivel}</span>` : ''}
            ${op.cambio ? `<span>⚙️ ${op.cambio}</span>` : ''}
            ${!op.semFipe ? `<span>📊 FIPE: ${op.codigoFipe || 'N/A'}</span>` : '<span>📊 FIPE: indisponível</span>'}
            ${!op.semFipe ? `<span>🏆 Score: ${op.score}</span>` : ''}
            ${!op.semFipe ? `<span>💰 Margem bruta: R$ ${op.margemBruta.toLocaleString('pt-BR')}</span>` : ''}
            ${!op.semFipe ? `<span>🔧 Custo prep.: R$ 1.500</span>` : ''}
            ${op.prioridadeModelo ? `<span>⭐ Prioridade: ${op.prioridadeModelo}</span>` : ''}
          </div>
        </td>
      </tr>`;
  }).join('');

  const historicoOptions = (historico || []).map(h =>
    `<option value="${h}">${h}</option>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Garimpeiro L-Car</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0a0a0a; color: #e0e0e0; }

    .header { background: #111; padding: 20px 24px; border-bottom: 1px solid #222; }
    .header h1 { font-size: 22px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
    .header h1 span { color: #00C853; }
    .header .subtitle { color: #888; font-size: 14px; margin-top: 4px; }
    .header .subtitle.warning { color: #FFB300; }

    .controls { display: flex; gap: 12px; align-items: center; margin-top: 12px; flex-wrap: wrap; }
    .controls select, .controls input { background: #1a1a1a; border: 1px solid #333; color: #e0e0e0; padding: 8px 12px; border-radius: 6px; font-size: 13px; }
    .controls button { background: #00C853; color: #000; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; font-size: 13px; }
    .controls button:hover { background: #00E676; }
    .controls .btn-refresh { background: #333; color: #fff; }
    .controls .btn-refresh:hover { background: #444; }

    .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; padding: 20px 24px; }
    .kpi { background: #111; border: 1px solid #222; border-radius: 10px; padding: 16px; }
    .kpi-label { font-size: 12px; color: #888; margin-bottom: 4px; }
    .kpi-value { font-size: 24px; font-weight: 600; }
    .kpi-value.green { color: #00C853; }
    .kpi-value.blue { color: #448AFF; }
    .kpi-value.amber { color: #FFB300; }

    .table-wrap { padding: 0 24px 24px; overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #111; padding: 12px 16px; text-align: left; font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.5px; border-bottom: 1px solid #222; position: sticky; top: 0; }
    td { padding: 12px 16px; border-bottom: 1px solid #1a1a1a; font-size: 14px; }
    .row { cursor: pointer; transition: background 0.15s; }
    .row:hover { background: #1a1a1a; }
    .rank { font-weight: 600; color: #888; width: 40px; }
    .veiculo-nome { font-weight: 600; }
    .veiculo-local { font-size: 12px; color: #888; margin-top: 2px; }
    .preco { color: #FFB300; font-weight: 600; }
    .fipe { color: #888; }
    .margem { color: #00C853; font-weight: 700; font-size: 15px; }
    .percent { color: #448AFF; font-weight: 600; }
    .badge { padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
    .btn-link { background: #222; color: #fff; text-decoration: none; padding: 6px 12px; border-radius: 5px; font-size: 12px; white-space: nowrap; }
    .btn-link:hover { background: #333; }

    .detalhes-content { display: flex; gap: 16px; flex-wrap: wrap; padding: 8px 0; }
    .detalhes-content span { background: #1a1a1a; padding: 4px 10px; border-radius: 4px; font-size: 12px; }

    .empty { text-align: center; padding: 60px 24px; color: #666; }
    .empty h2 { font-size: 18px; margin-bottom: 8px; color: #888; }

    .filtros-ativos { padding: 0 24px; margin-bottom: 12px; display: flex; gap: 8px; flex-wrap: wrap; }
    .filtro-tag { background: #1a1a1a; border: 1px solid #333; padding: 4px 10px; border-radius: 20px; font-size: 11px; color: #aaa; }
    .filtro-tag.warning { border-color: #FFB300; color: #FFB300; }

    .alert-bar { background: #332200; border: 1px solid #FFB300; color: #FFB300; padding: 12px 24px; margin: 0 24px 12px; border-radius: 8px; font-size: 13px; }

    .spinner { display: inline-block; width: 14px; height: 14px; border: 2px solid #666; border-top-color: #00C853; border-radius: 50%; animation: spin 0.8s linear infinite; vertical-align: middle; margin-right: 6px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn-loading { opacity: 0.7; pointer-events: none; }
    .status-msg { display: inline-block; margin-left: 8px; font-size: 12px; color: #00C853; vertical-align: middle; }
    .status-msg.error { color: #E53935; }

    @media (max-width: 768px) {
      .kpis { grid-template-columns: repeat(2, 1fr); }
      th:nth-child(4), td:nth-child(4),
      th:nth-child(6), td:nth-child(6) { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>🔍 Garimpeiro <span>L-Car</span></h1>
    <div class="subtitle ${modoFallback ? 'warning' : ''}">${subtitulo}</div>
    <div class="controls">
      <select onchange="if(this.value){setStatus('Carregando...',false);window.location.search='?data='+this.value}">
        <option value="">📅 Histórico</option>
        ${historicoOptions}
      </select>
      <select id="filtroFonte" onchange="filtrar()">
        <option value="">Todas as fontes</option>
        <option value="OLX">OLX</option>
        <option value="MercadoLivre">Mercado Livre</option>
        <option value="Webmotors">Webmotors</option>
        <option value="Localiza">Localiza</option>
      </select>
      <select id="filtroEstado" onchange="filtrar()">
        <option value="">Todos os estados</option>
        <option value="SC">SC</option>
        <option value="PR">PR</option>
        <option value="RS">RS</option>
      </select>
      <input type="text" id="busca" placeholder="🔎 Buscar modelo..." oninput="filtrar()">
      <button id="btnGarimpar" onclick="garimparAgora()" class="btn-refresh">🔄 Garimpar agora</button>
      <button id="btnAtualizar" onclick="atualizarDados()">📊 Atualizar</button>
      <span id="statusMsg" class="status-msg"></span>
    </div>
  </div>

  ${modoFallback ? `<div class="alert-bar">⚠️ API FIPE indisponível — mostrando anúncios sem cálculo de margem. Os preços são reais mas a comparação com FIPE não foi possível.</div>` : ''}

  <div class="kpis">
    <div class="kpi">
      <div class="kpi-label">${modoFallback ? 'Anúncios' : 'Oportunidades'}</div>
      <div class="kpi-value green">${oportunidades.length}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Melhor margem</div>
      <div class="kpi-value green">${topMargem}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Margem média</div>
      <div class="kpi-value blue">${mediaMargens}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Anúncios analisados</div>
      <div class="kpi-value amber">${stats.totalAnalisados || 0}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Fontes ativas</div>
      <div class="kpi-value">${(stats.fontes || []).length}</div>
    </div>
    <div class="kpi">
      <div class="kpi-label">Última execução</div>
      <div class="kpi-value" style="font-size:14px">${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'})}</div>
    </div>
  </div>

  <div class="filtros-ativos">
    <span class="filtro-tag">Ano ≥ 2012</span>
    <span class="filtro-tag">R$ 5k - R$ 100k</span>
    ${modoFallback ? '<span class="filtro-tag warning">⚠️ FIPE indisponível</span>' : '<span class="filtro-tag">Margem ≥ R$ 8.000</span>'}
    <span class="filtro-tag">SC + PR + RS</span>
    <span class="filtro-tag">Particular</span>
  </div>

  ${oportunidades.length > 0 ? `
  <div class="table-wrap">
    <table id="tabela">
      <thead>
        <tr>
          <th>#</th>
          <th>Veículo</th>
          <th>Preço</th>
          <th>FIPE</th>
          <th>Margem</th>
          <th>% Abaixo</th>
          <th>Fonte</th>
          <th></th>
        </tr>
      </thead>
      <tbody id="corpo">
        ${rows}
      </tbody>
    </table>
  </div>` : `
  <div class="empty">
    <h2>Nenhuma oportunidade encontrada</h2>
    <p>Clique em "Garimpar agora" para iniciar uma busca</p>
  </div>`}

  <script>
    // ============================================================
    // CONFIGURAÇÃO DO SCRAPER CLIENT-SIDE
    // ============================================================
    const MODELOS = [
      {m:'Gol',mk:'VW',s:'volkswagen',p:1},{m:'Onix',mk:'Chevrolet',s:'chevrolet',p:1},
      {m:'Palio',mk:'Fiat',s:'fiat',p:1},{m:'HB20',mk:'Hyundai',s:'hyundai',p:1},
      {m:'Polo',mk:'VW',s:'volkswagen',p:1},{m:'Sandero',mk:'Renault',s:'renault',p:1},
      {m:'Classic',mk:'Chevrolet',s:'chevrolet',p:1},{m:'Saveiro',mk:'VW',s:'volkswagen',p:1},
      {m:'Argo',mk:'Fiat',s:'fiat',p:2},{m:'Cronos',mk:'Fiat',s:'fiat',p:2},
      {m:'Etios',mk:'Toyota',s:'toyota',p:2},{m:'Yaris',mk:'Toyota',s:'toyota',p:2},
      {m:'Versa',mk:'Nissan',s:'nissan',p:2},{m:'Ka',mk:'Ford',s:'ford',p:2},
      {m:'Mobi',mk:'Fiat',s:'fiat',p:2},{m:'Kwid',mk:'Renault',s:'renault',p:2},
      {m:'Celta',mk:'Chevrolet',s:'chevrolet',p:2},{m:'Prisma',mk:'Chevrolet',s:'chevrolet',p:2},
      {m:'Corsa',mk:'Chevrolet',s:'chevrolet',p:2},{m:'Uno',mk:'Fiat',s:'fiat',p:2},
      {m:'Fox',mk:'VW',s:'volkswagen',p:2},{m:'Voyage',mk:'VW',s:'volkswagen',p:2},
      {m:'Fiesta',mk:'Ford',s:'ford',p:2},
      {m:'Toro',mk:'Fiat',s:'fiat',p:3},{m:'Tucson',mk:'Hyundai',s:'hyundai',p:3},
      {m:'HR-V',mk:'Honda',s:'honda',p:3},{m:'Tracker',mk:'Chevrolet',s:'chevrolet',p:3},
      {m:'Renegade',mk:'Jeep',s:'jeep',p:3},{m:'T-Cross',mk:'VW',s:'volkswagen',p:3},
      {m:'Compass',mk:'Jeep',s:'jeep',p:3},{m:'Kicks',mk:'Nissan',s:'nissan',p:3},
      {m:'Creta',mk:'Hyundai',s:'hyundai',p:3},{m:'Sorento',mk:'Kia',s:'kia',p:3},
    ];
    const ESTADOS_WM = {SC:'santa-catarina',PR:'parana',RS:'rio-grande-do-sul'};
    const ESTADOS_ML = {SC:'TUxCUFNBTk8',PR:'TUxCUFBBUk4',RS:'TUxCUFJJT0c'};
    const REGIOES = ['SC','PR','RS'];
    const PRECO_MIN = 5000, PRECO_MAX = 100000, ANO_MIN = 2012;

    let _garimpoAbortado = false;

    // ============================================================
    // UTILITÁRIOS
    // ============================================================
    function toggleDetalhes(i) {
      const el = document.getElementById('det-' + i);
      el.style.display = el.style.display === 'none' ? '' : 'none';
    }

    function filtrar() {
      const fonte = document.getElementById('filtroFonte').value.toLowerCase();
      const estado = document.getElementById('filtroEstado').value.toLowerCase();
      const busca = document.getElementById('busca').value.toLowerCase();
      document.querySelectorAll('.row').forEach((row, i) => {
        const texto = row.innerText.toLowerCase();
        const detRow = document.getElementById('det-' + i);
        let show = true;
        if (fonte && !texto.includes(fonte)) show = false;
        if (estado && !texto.includes(estado)) show = false;
        if (busca && !texto.includes(busca)) show = false;
        row.style.display = show ? '' : 'none';
        if (detRow) detRow.style.display = 'none';
      });
    }

    function setStatus(msg, isError) {
      const el = document.getElementById('statusMsg');
      el.textContent = msg;
      el.className = 'status-msg' + (isError ? ' error' : '');
    }

    function setBtnLoading(btnId, loading, text) {
      const btn = document.getElementById(btnId);
      if (loading) {
        btn._origText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner"></span>' + (text || 'Aguarde...');
        btn.classList.add('btn-loading');
      } else {
        btn.innerHTML = btn._origText || text;
        btn.classList.remove('btn-loading');
      }
    }

    function str(campo) {
      if (!campo) return '';
      if (typeof campo === 'string') return campo;
      if (typeof campo === 'object') return campo.Name || campo.Value || campo.name || campo.value || String(campo);
      return String(campo);
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    // ============================================================
    // FETCH COM CORS PROXY FALLBACK
    // ============================================================
    async function fetchJSON(url) {
      // Tenta direto primeiro (funciona se API tem CORS headers)
      try {
        const r = await fetch(url, {headers:{'Accept':'application/json'}, signal: AbortSignal.timeout(12000)});
        if (r.ok) return await r.json();
      } catch(e) {}

      // Fallback: CORS proxy
      const proxies = [
        'https://corsproxy.io/?url=',
        'https://api.allorigins.win/raw?url=',
      ];
      for (const proxy of proxies) {
        try {
          const r = await fetch(proxy + encodeURIComponent(url), {signal: AbortSignal.timeout(15000)});
          if (r.ok) {
            const text = await r.text();
            return JSON.parse(text);
          }
        } catch(e) {}
      }
      return null;
    }

    // ============================================================
    // WEBMOTORS SCRAPER
    // ============================================================
    async function buscarWM(modelo, marcaSlug, estado) {
      const estadoSlug = ESTADOS_WM[estado];
      const modeloSlug = modelo.toLowerCase().replace(/[-\\s]+/g, '-');
      const wmUrl = 'https://www.webmotors.com.br/api/search/car?url=' +
        encodeURIComponent('https://www.webmotors.com.br/carros/estoque/' + marcaSlug + '/' + modeloSlug + '/' + estadoSlug) +
        '&DisplayPerPage=50&DisplayPage=1';

      const data = await fetchJSON(wmUrl);
      if (!data || !data.SearchResults) return [];

      return data.SearchResults
        .filter(item => {
          const spec = item.Specification || item;
          const mr = str(spec.Model).toLowerCase();
          return mr.includes(modeloSlug.replace(/-/g,' ')) || modeloSlug.replace(/-/g,' ').includes(mr);
        })
        .map(item => {
          const spec = item.Specification || item;
          const seller = item.Seller || {};
          const prices = item.Prices || {};
          const preco = prices.Price || prices.SearchPrice || 0;
          const ano = parseInt(spec.YearFabrication || spec.YearModel) || 0;
          if (!preco || preco < PRECO_MIN || preco > PRECO_MAX) return null;
          if (ano && ano < ANO_MIN) return null;

          // Extrair estado REAL do vendedor (ex: "Santa Catarina (SC)" → "SC")
          const sellerState = str(seller.State);
          const stateMatch = sellerState.match(/\(([A-Z]{2})\)/);
          const estadoReal = stateMatch ? stateMatch[1] : estado;

          // Filtrar só SC/PR/RS
          if (!REGIOES.includes(estadoReal)) return null;

          return {
            fonte:'Webmotors', titulo:(str(spec.Make)+' '+str(spec.Model)+' '+str(spec.Version)).trim(),
            marca:str(spec.Make), modelo:str(spec.Model), ano, preco,
            km:spec.Odometer ? Math.round(spec.Odometer)+' km' : '',
            cidade:str(seller.City), estado:estadoReal,
            link:item.UniqueId ? 'https://www.webmotors.com.br/comprar/'+item.UniqueId : '',
            particular:seller.SellerType==='PF', dataAnuncio:'', imagem:item.PhotoPath||'',
            cor:str(spec.Color&&spec.Color.Primary?spec.Color.Primary:spec.Color),
            combustivel:str(spec.Fuel), cambio:str(spec.Transmission),
          };
        })
        .filter(Boolean);
    }

    // ============================================================
    // MERCADO LIVRE SCRAPER
    // ============================================================
    async function buscarML(modelo, marca, estado) {
      const estadoId = ESTADOS_ML[estado];
      const query = marca + ' ' + modelo;
      const mlUrl = 'https://api.mercadolibre.com/sites/MLB/search?q=' + encodeURIComponent(query) +
        '&category=MLB1744&state=' + estadoId +
        '&price=' + PRECO_MIN + '-' + PRECO_MAX +
        '&ITEM_CONDITION=2230581&sort=price_asc&limit=50';

      const data = await fetchJSON(mlUrl);
      if (!data || !data.results) return [];

      return data.results
        .filter(item => {
          const ya = item.attributes?.find(a => a.id === 'VEHICLE_YEAR');
          const ano = parseInt(ya?.value_name);
          return !ano || ano >= ANO_MIN;
        })
        .map(item => {
          const ya = item.attributes?.find(a => a.id === 'VEHICLE_YEAR');
          const ka = item.attributes?.find(a => a.id === 'KILOMETERS');
          return {
            fonte:'MercadoLivre', titulo:item.title||'',
            marca, modelo,
            ano:parseInt(ya?.value_name)||0, preco:item.price||0,
            km:ka?.value_name||'',
            cidade:item.seller_address?.city?.name||'',
            estado:item.seller_address?.state?.id?.slice(-2)||estado,
            link:item.permalink||'', particular:true,
            dataAnuncio:'', imagem:item.thumbnail||'',
            cor:'', combustivel:'', cambio:'',
          };
        })
        .filter(a => a.preco >= PRECO_MIN && a.preco <= PRECO_MAX);
    }

    // ============================================================
    // GARIMPO PRINCIPAL (RODA NO BROWSER)
    // ============================================================
    async function garimparAgora() {
      _garimpoAbortado = false;
      setBtnLoading('btnGarimpar', true, 'Garimpando...');
      setStatus('Iniciando garimpo no browser...', false);

      const todosAnuncios = [];
      const fontesUsadas = new Set();
      let processados = 0;
      const total = MODELOS.length;
      const inicio = Date.now();

      try {
        // Processar 3 modelos em paralelo
        for (let i = 0; i < MODELOS.length; i += 3) {
          if (_garimpoAbortado) break;

          const batch = MODELOS.slice(i, i + 3);
          const promises = batch.map(async (mod) => {
            for (const estado of REGIOES) {
              if (_garimpoAbortado) return;

              // Webmotors
              try {
                const wm = await buscarWM(mod.m, mod.s, estado);
                if (wm.length > 0) { todosAnuncios.push(...wm); fontesUsadas.add('Webmotors'); }
              } catch(e) {}

              // Mercado Livre
              try {
                const ml = await buscarML(mod.m, mod.mk, estado);
                if (ml.length > 0) { todosAnuncios.push(...ml); fontesUsadas.add('MercadoLivre'); }
              } catch(e) {}

              await sleep(500);
            }
            processados++;
          });

          await Promise.all(promises);

          const elapsed = Math.round((Date.now() - inicio) / 1000);
          const done = Math.min(i + 3, total);
          setStatus('Garimpando... ' + done + '/' + total + ' modelos | ' + todosAnuncios.length + ' anúncios (' + elapsed + 's)', false);
        }

        if (todosAnuncios.length === 0) {
          setStatus('Nenhum anúncio coletado. APIs podem estar bloqueadas.', true);
          setBtnLoading('btnGarimpar', false, '🔄 Garimpar agora');
          return;
        }

        // Enviar pro servidor pra calcular margem FIPE
        setStatus('Calculando margens no servidor (' + todosAnuncios.length + ' anúncios)...', false);

        const resp = await fetch('/api/import-raw', {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            anuncios: todosAnuncios,
            fontes: [...fontesUsadas],
          }),
        });

        const result = await resp.json();

        if (result.ok) {
          const elapsed = Math.round((Date.now() - inicio) / 1000);
          setStatus('Pronto! ' + result.totalAnalisados + ' analisados, ' + result.oportunidades + ' oportunidades (' + elapsed + 's)', false);
          setTimeout(() => { window.location.reload(); }, 2000);
        } else {
          setStatus('Erro no servidor: ' + (result.error || 'desconhecido'), true);
          setBtnLoading('btnGarimpar', false, '🔄 Garimpar agora');
        }

      } catch (err) {
        setStatus('Erro: ' + err.message, true);
        setBtnLoading('btnGarimpar', false, '🔄 Garimpar agora');
      }
    }

    // ============================================================
    // ATUALIZAR (recarrega dados do servidor sem garimpar)
    // ============================================================
    async function atualizarDados() {
      setBtnLoading('btnAtualizar', true, 'Atualizando...');
      setStatus('Carregando dados...', false);
      try {
        const resp = await fetch('/api/resultado');
        const data = await resp.json();
        if (data.error) {
          setStatus('Nenhum resultado para hoje.', true);
        } else {
          setStatus('Atualizado! ' + (data.oportunidades?.length || 0) + ' oportunidades.', false);
          setTimeout(() => { window.location.reload(); }, 500);
        }
      } catch (err) {
        setStatus('Erro: ' + err.message, true);
      }
      setBtnLoading('btnAtualizar', false, '📊 Atualizar');
    }
  </script>
</body>
</html>`;
}

module.exports = { gerarDashboardHTML };
