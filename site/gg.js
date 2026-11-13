/* 정비맵 — 경기도 정비사업 추진현황 덧입히기
   data/zones/gg.json (scripts/build_gg.py): 국토부 경계에 진행단계·인가일을 덧입히고(over),
   경계가 없는 구역(대부분 정비예정구역)은 주소 위치에 면적만큼의 원으로 대략 표시(pts). */
'use strict';

const GG = { data: null, zones: {}, pending: new Set() };

async function ggInit() {
  try { GG.data = await getJSON('data/zones/gg.json'); } catch (e) { return; }
  Z.meta.src.G = GG.data.src;
}
function ggApply(z) { // loadZoneFile에서 각 구역에 적용
  const o = GG.data?.over[z.id]; if (!o) return z;
  z.gg = o; z.s = o.st; if (!z.n) z.n = o.n;
  return z;
}

const ggKey = (p) => 'gg|' + p.city + '|' + p.n + '|' + p.addr;
async function ggLocate(p) {
  const k = ggKey(p);
  if (Geo.get(k) !== undefined) return pt(Geo.get(k));
  const a = p.addr.replace(/\(.*?\)/g, ' ').replace(/번지|일원|일대|외\s*\d+\s*필지|주변|\s+외$/g, ' ').replace(/\s+/g, ' ').trim();
  let res = a ? await Kakao.addressSearch(a) : [];
  if (!res.length && a) res = await Kakao.addressSearch(a.split(' ').slice(0, -1).join(' '));
  if (!res.length) res = await Kakao.keyword(`${p.city} ${p.n}`);
  Geo.put(k, res.length ? [+res[0].y, +res[0].x] : 0);
  return pt(Geo.get(k));
}

function ggZoneOf(p, i) {
  const g = pt(Geo.get(ggKey(p))); if (!g) return null;
  const id = 'G:' + i;
  if (GG.zones[id]) return GG.zones[id];
  const a = p.a || 15000, R = Math.max(60, Math.sqrt(a / Math.PI));
  const kLat = R / 111320, kLng = R / (111320 * Math.cos(g.lat * Math.PI / 180));
  const ring = []; for (let t = 0; t < 28; t++) { const q = t / 28 * Math.PI * 2; ring.push(new kakao.maps.LatLng(g.lat + Math.sin(q) * kLat, g.lng + Math.cos(q) * kLng)); }
  const pre = p.st === '정비예정구역';
  return (GG.zones[id] = {
    id, n: p.n, t: pre ? '예정' : (p.ty || '정비구역'), k: p.ty === '재건축' ? 'rc' : 'rd', s: p.st, d: '', a, c: g,
    bb: [g.lat - kLat, g.lng - kLng, g.lat + kLat, g.lng + kLng], rings: ring, code: p.codes[0], gg: p, approx: true,
  });
}

// zonesRefresh에서 호출: 보이는 시군 파일 코드에 속한 경기도 자료 구역
function ggZonesIn(codes) {
  if (!GG.data) return [];
  const set = new Set(codes), out = [], need = [];
  GG.data.pts.forEach((p, i) => {
    if (!p.codes.some((c) => set.has(c))) return;
    const k = ggKey(p);
    if (Geo.get(k) === undefined) need.push(p);
    else { const z = ggZoneOf(p, i); if (z) out.push(z); }
  });
  const todo = need.filter((p) => !GG.pending.has(ggKey(p)));
  if (todo.length) {
    todo.forEach((p) => GG.pending.add(ggKey(p)));
    pool(todo, 4, ggLocate).then(() => { Geo.flush(); todo.forEach((p) => GG.pending.delete(ggKey(p))); zonesRefresh(); });
  }
  return out;
}

function ggInfoHTML(z) {
  const o = z.gg; if (!o) return '';
  const fd = (d) => `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6, 8)}`;
  const facts = [
    o.hh && ['계획 세대수', `${fmtN(+o.hh)}세대${o.gen ? ` (일반분양 ${fmtN(+o.gen)})` : ''}`],
    o.own && ['토지등소유자', `${fmtN(+o.own)}명`], o.by && ['사업시행자', o.by], o.far && ['계획 용적률', o.far], o.old && ['기존 주택 준공', o.old],
  ].filter(Boolean);
  return `<div class="gg">
    <div class="gg-h">경기도 추진현황 <small>2025.10 기준</small></div>
    ${o.dt?.length ? `<ol class="gg-tl">${o.dt.map(([l, d]) => `<li class="${(o.st || '').startsWith(l) ? 'now' : ''}"><i></i><b>${esc(l)}</b><span class="num">${fd(d)}</span></li>`).join('')}</ol>` : ''}
    ${facts.length ? `<dl class="dl">${facts.map(([a, b]) => `<dt>${esc(a)}</dt><dd>${esc(b)}</dd>`).join('')}</dl>` : ''}
    ${z.approx ? `<div class="meta">📍 ${esc(o.addr || '')} — 경계 도면이 없어 주소 위치에 구역 면적만큼의 원으로 대략 표시했어요.</div>` : ''}
  </div>`;
}
