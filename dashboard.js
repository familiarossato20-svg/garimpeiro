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
      <select onchange="if(this.value) window.location='/resultado?data='+this.value">
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
      <button onclick="window.location='/garimpar'" class="btn-refresh">🔄 Garimpar agora</button>
      <button onclick="window.location='/resultado'">📊 Atualizar</button>
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
  </script>
</body>
</html>`;
}

module.exports = { gerarDashboardHTML };
