'use strict';
// Ofertas: promoções da Steam (featuredcategories + featured, cc=BR) e jogos grátis da Epic.
// Cache de 1 h em memória + library.json; force ignora o cache. Falha de rede -> último cache com stale:true.
const { fetchBuf } = require('./covers');

const TTL_MS = 60 * 60 * 1000;
const MAX_STEAM = 40;
const EPIC_HOSTS = [
  // o host antigo (store-site-backend-static.epicgames.com) não resolve mais no DNS
  'store-site-backend-static-ipv4.ak.epicgames.com',
  'store-site-backend-static.ak.epicgames.com',
  'store-site-backend-static.epicgames.com',
];

let brl;
function money(cents) {
  if (typeof cents !== 'number') return null;
  try {
    if (!brl) brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
    return brl.format(cents / 100).replace(/ /g, ' ');
  } catch {
    return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
  }
}

async function getJson(url) {
  const r = await fetchBuf(url, { timeout: 10000, maxBytes: 10 * 1024 * 1024 });
  if (!r || r.status !== 200) return null;
  try {
    return JSON.parse(r.buf.toString('utf8'));
  } catch {
    return null;
  }
}

async function fetchSteam(ownedSet) {
  const [fc, ft] = await Promise.all([
    getJson('https://store.steampowered.com/api/featuredcategories?cc=BR&l=portuguese'),
    getJson('https://store.steampowered.com/api/featured?cc=BR&l=portuguese'),
  ]);
  if (!fc && !ft) return null;
  const items = [];
  if (fc) {
    for (const k of Object.keys(fc)) {
      const v = fc[k];
      if (v && Array.isArray(v.items)) items.push(...v.items);
    }
  }
  if (ft) {
    for (const k of ['large_capsules', 'featured_win']) if (Array.isArray(ft[k])) items.push(...ft[k]);
  }
  const byId = new Map();
  for (const it of items) {
    if (!it || !it.id || (it.type !== undefined && it.type !== 0)) continue;
    const discount = +it.discount_percent || 0;
    if (discount <= 0 || typeof it.final_price !== 'number') continue;
    if (byId.has(it.id)) continue;
    const appid = it.id;
    byId.set(appid, {
      appid,
      name: it.name,
      image: it.header_image || it.large_capsule_image || `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appid}/header.jpg`,
      discount,
      originalPrice: it.original_price,
      finalPrice: it.final_price,
      priceText: it.final_price === 0 ? 'Grátis' : money(it.final_price),
      originalText: money(it.original_price),
      url: `https://store.steampowered.com/app/${appid}/`,
      owned: ownedSet.has(String(appid)),
      endsAt: it.discount_expiration ? it.discount_expiration * 1000 : null,
    });
  }
  return [...byId.values()].sort((a, b) => b.discount - a.discount).slice(0, MAX_STEAM);
}

function epicSlug(e) {
  const clean = (s) => (s && s !== '[]' ? String(s).replace(/\/home$/, '') : null);
  return (
    clean(e.productSlug) ||
    clean(e.offerMappings && e.offerMappings[0] && e.offerMappings[0].pageSlug) ||
    clean(e.catalogNs && e.catalogNs.mappings && e.catalogNs.mappings[0] && e.catalogNs.mappings[0].pageSlug) ||
    clean(e.urlSlug)
  );
}

function freeWindow(groups) {
  for (const g of groups || []) {
    for (const o of (g && g.promotionalOffers) || []) {
      if (o && o.discountSetting && o.discountSetting.discountPercentage === 0) return o;
    }
  }
  return null;
}

async function fetchEpic() {
  let j = null;
  for (const h of EPIC_HOSTS) {
    j = await getJson(`https://${h}/freeGamesPromotions?locale=pt-BR&country=BR&allowCountries=BR`);
    if (j) break;
  }
  const els = j && j.data && j.data.Catalog && j.data.Catalog.searchStore && j.data.Catalog.searchStore.elements;
  if (!Array.isArray(els)) return null;
  const now = Date.now();
  const out = [];
  for (const e of els) {
    const p = e && e.promotions;
    if (!p) continue;
    const cur = freeWindow(p.promotionalOffers);
    const next = freeWindow(p.upcomingPromotionalOffers);
    const o = cur || next;
    if (!o) continue;
    const start = Date.parse(o.startDate) || null;
    const end = Date.parse(o.endDate) || null;
    const imgs = e.keyImages || [];
    const img = ['OfferImageWide', 'Thumbnail', 'OfferImageTall', 'DieselStoreFrontWide'].map((t) => imgs.find((k) => k.type === t)).find(Boolean);
    const slug = epicSlug(e);
    out.push({
      title: e.title,
      image: img ? img.url : null,
      url: slug ? `https://store.epicgames.com/pt-BR/p/${slug}` : 'https://store.epicgames.com/pt-BR/free-games',
      startDate: start,
      endDate: end,
      current: !!cur && (!start || start <= now) && (!end || end > now),
    });
  }
  return out.sort((a, b) => (b.current - a.current) || (a.startDate || 0) - (b.startDate || 0));
}

class Offers {
  constructor(store, getOwnedSet) {
    this.store = store;
    this.getOwnedSet = getOwnedSet;
    this.inflight = null;
  }

  async get({ force = false } = {}) {
    const cached = this.store.data.offers;
    if (!force && cached && Date.now() - cached.fetchedAt < TTL_MS) return this._withOwned(cached);
    if (!this.inflight) this.inflight = this._fetch().finally(() => (this.inflight = null));
    return this.inflight;
  }

  _withOwned(o) {
    // "owned" pode mudar depois do cache (instalou algo); recalcula barato
    let owned;
    try {
      owned = this.getOwnedSet();
    } catch {
      owned = new Set();
    }
    return { ...o, steam: (o.steam || []).map((s) => ({ ...s, owned: owned.has(String(s.appid)) })) };
  }

  async _fetch() {
    const prev = this.store.data.offers;
    let owned;
    try {
      owned = this.getOwnedSet();
    } catch {
      owned = new Set();
    }
    const [steam, epicFree] = await Promise.all([fetchSteam(owned).catch(() => null), fetchEpic().catch(() => null)]);
    if (!steam && !epicFree) {
      if (prev) return { ...this._withOwned(prev), stale: true };
      return { fetchedAt: null, currency: 'BRL', steam: [], epicFree: [], stale: true };
    }
    const res = {
      fetchedAt: Date.now(),
      currency: 'BRL',
      steam: steam || (prev && prev.steam) || [],
      epicFree: epicFree || (prev && prev.epicFree) || [],
    };
    const partial = !steam || !epicFree; // uma das fontes falhou: parte veio do cache
    // resultado parcial fica em cache só 5 min
    this.store.data.offers = { ...res, fetchedAt: partial ? res.fetchedAt - TTL_MS + 5 * 60 * 1000 : res.fetchedAt };
    this.store.saveSoon();
    return partial ? { ...res, stale: true } : res;
  }
}

module.exports = { Offers, money };
