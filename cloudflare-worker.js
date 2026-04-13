/**
 * Garimpeiro Proxy Worker — Cloudflare Workers
 * Proxies requests to Webmotors and Mercado Livre
 * bypassing PerimeterX datacenter IP blocks
 */

const API_KEY = 'garimpeiro-lcar-2026';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Auth check
    const key = url.searchParams.get('key') || request.headers.get('X-API-Key');
    if (key !== API_KEY) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Routes
    if (url.pathname === '/health') {
      return jsonResponse({ status: 'ok', service: 'garimpeiro-proxy' });
    }

    if (url.pathname === '/webmotors/api') {
      return handleWebmotorsAPI(url);
    }

    if (url.pathname === '/webmotors/html') {
      return handleWebmotorsHTML(url);
    }

    if (url.pathname === '/mercadolivre') {
      return handleMercadoLivre(url);
    }

    if (url.pathname === '/fipe') {
      return handleFipe(url);
    }

    return jsonResponse({ error: 'Not found', routes: ['/webmotors/api', '/webmotors/html', '/mercadolivre', '/fipe'] }, 404);
  }
};

async function handleWebmotorsAPI(url) {
  const targetUrl = url.searchParams.get('url');
  const perPage = url.searchParams.get('perPage') || '50';
  const page = url.searchParams.get('page') || '1';

  if (!targetUrl) {
    return jsonResponse({ error: 'Missing url param' }, 400);
  }

  try {
    const apiUrl = new URL('https://www.webmotors.com.br/api/search/car');
    apiUrl.searchParams.set('url', targetUrl);
    apiUrl.searchParams.set('DisplayPerPage', perPage);
    apiUrl.searchParams.set('DisplayPage', page);

    const resp = await fetch(apiUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.webmotors.com.br/',
        'Origin': 'https://www.webmotors.com.br',
      },
    });

    const data = await resp.json();
    return jsonResponse(data);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function handleWebmotorsHTML(url) {
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return jsonResponse({ error: 'Missing url param' }, 400);
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9',
        'Referer': 'https://www.webmotors.com.br/',
      },
    });

    const html = await resp.text();
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8', ...CORS_HEADERS },
    });
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function handleMercadoLivre(url) {
  const query = url.searchParams.get('q') || '';
  const state = url.searchParams.get('state') || '';
  const limit = url.searchParams.get('limit') || '50';
  const priceMin = url.searchParams.get('price_min') || '';
  const priceMax = url.searchParams.get('price_max') || '';

  try {
    const apiUrl = new URL('https://api.mercadolibre.com/sites/MLB/search');
    if (query) apiUrl.searchParams.set('q', query);
    apiUrl.searchParams.set('category', 'MLB1744');
    if (state) apiUrl.searchParams.set('state', state);
    if (priceMin && priceMax) apiUrl.searchParams.set('price', `${priceMin}-${priceMax}`);
    apiUrl.searchParams.set('ITEM_CONDITION', '2230581');
    apiUrl.searchParams.set('sort', 'price_asc');
    apiUrl.searchParams.set('limit', limit);

    const resp = await fetch(apiUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });

    const data = await resp.json();
    return jsonResponse(data);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

async function handleFipe(url) {
  const targetUrl = url.searchParams.get('url');

  if (!targetUrl) {
    return jsonResponse({ error: 'Missing url param' }, 400);
  }

  try {
    const resp = await fetch(targetUrl, {
      headers: { 'Accept': 'application/json' },
    });

    const data = await resp.json();
    return jsonResponse(data);
  } catch (e) {
    return jsonResponse({ error: e.message }, 500);
  }
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
