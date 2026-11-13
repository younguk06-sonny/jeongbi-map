// 분양시장 레이더 저장소(New-Build_Rader)가 매일 모으는 자료를 받아
// 이 앱이 쓰기 좋은 모양으로 바꿉니다. (API 키 필요 없음)
//  - site/data/near/<시군구코드>.json : 단지별 실거래 요약 (최근 36개월)
//  - site/data/cheongyak/<시도>.json   : 청약 공고·결과 (그대로 복사)
//  - site/data/meta.json               : 기준일, 쓸 수 있는 시군구 코드
//  - site/data/study.json              : 부동산 스터디(미분양·공급·입주예정·개발호재·지역 거래)
// 사용법: SRC=레이더저장소경로 node scripts/build-data.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = process.env.SRC || '_src';
const OUT = path.join(process.cwd(), 'site', 'data');
const PY = 3.3058; // ㎡ → 평

const readJSON = async (p, d) => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return d; } };
const writeJSON = async (p, o) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(o)); };
const toPyeong = (v) => (v == null ? null : Math.round((v / 10) * PY)); // 레이더 값(만원/㎡×10) → 만원/평


// ---------- 부동산 스터디용 요약 (study.json) ----------
const ORDER = ['서울', '인천', '경기', '강원', '충남', '세종', '충북', '경북', '대전', '전북', '대구', '울산', '전남광주', '경남', '부산', '제주'];
const LONG = { 서울: '서울특별시', 부산: '부산광역시', 대구: '대구광역시', 인천: '인천광역시', 대전: '대전광역시', 울산: '울산광역시', 세종: '세종특별자치시', 경기: '경기도', 강원: '강원특별자치도', 충북: '충청북도', 충남: '충청남도', 전북: '전북특별자치도', 전남광주: '전남광주통합특별시', 경북: '경상북도', 경남: '경상남도', 제주: '제주특별자치도' };
const GJ = new Set(['서구', '동구', '남구', '북구', '광산구']);

function buildUnsold(tab) {
  const months = tab.months, L = months.length, T = new Map();
  for (const r of tab.rows) T.set(r[0] + '|' + r[1], r.slice(2));
  const get = (a, b) => T.get(a + '|' + b) || null;
  const stitch = (a, b) => (a && b ? a.map((v, i) => v ?? b[i]) : a || b);
  const sumS = (list) => { const ok = list.filter(Boolean); if (!ok.length) return null; return Array.from({ length: L }, (_, i) => { let s = null; for (const x of ok) if (x[i] != null) s = (s || 0) + x[i]; return s; }); };
  const sido = {}, sgg = {};
  for (const sd of ORDER) {
    let tot = get(sd, '계');
    if (sd === '전남광주') tot = stitch(tot, sumS([get('광주', '계'), get('전남', '계')]));
    const kids = {};
    const names = new Set(tab.rows.filter((r) => r[1] !== '계' && (r[0] === sd || (sd === '전남광주' && (r[0] === '광주' || r[0] === '전남')))).map((r) => r[1]));
    for (const n of names) {
      let v = get(sd, n);
      if (sd === '전남광주') v = stitch(v, get(GJ.has(n) ? '광주' : '전남', n));
      if (sd === '대구' && n === '군위군') v = stitch(v, get('경북', '군위군'));
      if (v) kids[n] = v;
    }
    sido[sd] = tot || sumS(Object.values(kids)) || new Array(L).fill(null);
    sgg[sd] = kids;
  }
  let last = L - 1;
  while (last > 0 && ORDER.every((sd) => sido[sd][last] == null)) last--;
  const from = Math.max(0, last - 120);
  const cut = (a) => a.slice(from, last + 1);
  const out = { months: months.slice(from, last + 1), sido: {}, sgg: {} };
  for (const sd of ORDER) { out.sido[sd] = cut(sido[sd]); out.sgg[sd] = {}; for (const k in sgg[sd]) out.sgg[sd][k] = cut(sgg[sd][k]); }
  out.nat = out.months.map((_, i) => { let s = 0, any = false; for (const sd of ORDER) if (out.sido[sd][i] != null) { s += out.sido[sd][i]; any = true; } return any ? s : null; });
  return out;
}

// 레이더 화면과 같은 방식으로 공급 표에서 '합계' 계열 한 줄을 고름
const TOTALS = new Set(['계', '합계', '총계', '소계', '전체', '']);
const ALL_SIDO = new Set([...ORDER.filter((x) => x !== '전남광주'), '광주', '전남', ...Object.values(LONG), '광주광역시', '전라남도', '강원도', '전라북도']);
const AGG = new Set(['전국', '수도권', '지방', '지방소계', '기타광역시', '기타지방']);
function totalScore(c) {
  if (TOTALS.has(c)) return 2; if (/가구수/.test(c)) return 3; if (/동수/.test(c)) return -3;
  if (c === '순계') return 2; if (c === '누계') return -5; if (/^(합|총계|소계|합계)/.test(c)) return 1; return -1;
}
function pickSeries(rows, sido) {
  const OLD = { 강원: ['강원도'], 전북: ['전라북도'], 제주: ['제주도'] };
  const names = (sd) => [sd, LONG[sd], ...(OLD[sd] || [])];
  const has = (r, list) => list.some((n) => r[0] === n || r[1] === n || r[2] === n);
  const isRegion = (c) => ALL_SIDO.has(c) || AGG.has(c) || c === '전남광주';
  let sets;
  if (sido === '전남광주') sets = [rows.filter((r) => has(r, ['전남광주', '전남광주통합특별시'])), rows.filter((r) => has(r, ['광주', '광주광역시', '전남', '전라남도']))];
  else if (sido) sets = [rows.filter((r) => has(r, names(sido)))];
  else { const n = rows.filter((r) => has(r, ['전국'])); sets = [n.length ? n : rows.filter((r) => !r.slice(0, 3).some(isRegion))]; }
  const series = (cand) => {
    if (!cand.length) return null;
    const groups = new Map();
    for (const r of cand) {
      const other = r.slice(0, 3).filter((c) => c && !isRegion(c));
      const key = other.join('|') + '#' + r[3];
      if (!groups.has(key)) groups.set(key, { score: other.reduce((a, c) => a + totalScore(c), 0) + (/(합계|계|전체)/.test(r[3]) ? 1 : 0), rows: [] });
      groups.get(key).rows.push(r);
    }
    const best = [...groups.values()].sort((a, b) => b.score - a.score)[0];
    const byM = new Map();
    for (const r of best.rows) if (r[5] != null) byM.set(r[4], (byM.get(r[4]) || 0) + r[5]);
    return byM;
  };
  const parts = sets.map(series).filter(Boolean);
  if (!parts.length) return null;
  const byM = new Map(parts[parts.length - 1]);
  if (parts.length > 1) for (const [m, v] of parts[0]) byM.set(m, v);
  return byM;
}

async function buildStudy() {
  const D = path.join(SRC, 'public', 'data');
  const study = { builtAt: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), order: ORDER };
  const unsold = (await readJSON(path.join(D, 'unsold.json'), null)) || (await readJSON(path.join(D, 'unsold-fallback.json'), null));
  if (unsold) study.unsold = Object.assign(buildUnsold(unsold), { source: unsold.source });
  // 공급 선행지표: 최근 48개월
  const idx = await readJSON(path.join(D, 'supply-index.json'), { list: [] });
  study.supply = { labels: idx.labels || {}, months: [], series: {} };
  const all = new Set();
  const raw = {};
  for (const name of idx.list || []) {
    const j = await readJSON(path.join(D, `supply-${name}.json`), null); if (!j) continue;
    raw[name] = { nat: pickSeries(j.rows, null) };
    for (const sd of ORDER) raw[name][sd] = pickSeries(j.rows, sd);
    for (const m of raw[name].nat?.keys() || []) all.add(m);
  }
  const months = [...all].sort().slice(-48);
  study.supply.months = months;
  for (const [name, by] of Object.entries(raw)) {
    study.supply.series[name] = {};
    for (const [k, mp] of Object.entries(by)) if (mp) study.supply.series[name][k] = months.map((m) => mp.get(m) ?? null);
  }
  study.moveIn = await readJSON(path.join(D, 'supply.json'), null);
  study.hug = await readJSON(path.join(D, 'hug-zones.json'), null);
  study.projects = await readJSON(path.join(D, 'projects.json'), null);
  study.population = await readJSON(path.join(D, 'population.json'), null);
  // 지역별 월 거래량·중위 평당가
  const t = await readJSON(path.join(D, 'trade.json'), null);
  if (t) {
    const slim = (o) => ({ n: o.n, py: o.py });
    study.trade = { months: t.months, source: t.source, nat: slim(t.nat), sido: {}, sgg: {}, leader: {} };
    for (const [sd, o] of Object.entries(t.sido || {})) study.trade.sido[sd] = slim(o);
    for (const [sd, kids] of Object.entries(t.sgg || {})) { study.trade.sgg[sd] = {}; for (const [n, o] of Object.entries(kids)) study.trade.sgg[sd][n] = slim(o); }
    for (const [sd, kids] of Object.entries(t.leader || {})) { study.trade.leader[sd] = {}; for (const [n, o] of Object.entries(kids)) study.trade.leader[sd][n] = { apt: o.apt, dong: o.dong, by: o.by, py12: o.py12, n12: o.n12 }; }
  }
  await writeJSON(path.join(OUT, 'study.json'), study);
  console.log('스터디 자료: 미분양', study.unsold?.months.at(-1), '· 공급', months.at(-1), '· 거래', study.trade?.months.at(-1));
}

async function main() {
  const codes = await readJSON(path.join(SRC, 'lib', 'lawd-codes.json'), {});
  const rtDir = path.join(SRC, 'cache', 'rt');
  const months = (await fs.readdir(rtDir)).filter((f) => /^\d{6}\.json$/.test(f)).map((f) => f.slice(0, 6)).sort();
  if (!months.length) throw new Error('실거래가 자료가 없습니다: ' + rtDir);
  const last = months[months.length - 1];
  // 분기 축: 최근 12개 분기
  const qOf = (m) => `${m.slice(0, 4)}Q${Math.floor((+m.slice(4) - 1) / 3) + 1}`;
  const quarters = [...new Set(months.map(qOf))].slice(-12);
  const m12 = new Set(months.slice(-12));

  const acc = {}; // code -> key -> 집계
  for (const m of months) {
    const store = await readJSON(path.join(rtDir, `${m}.json`), {});
    for (const [code, rec] of Object.entries(store)) {
      const byCode = (acc[code] ||= {});
      for (const [gu, part] of Object.entries(rec.parts || {})) {
        for (const [k, [by, cnt, mp, ma]] of Object.entries(part.c || {})) {
          const c = (byCode[k] ||= { by, gu, n: 0, sp: 0, n12: 0, sp12: 0, sa12: 0, last: '', q: {}, d: [] });
          if (by && !c.by) c.by = by;
          c.n += cnt; c.sp += mp * cnt;
          if (m12.has(m)) { c.n12 += cnt; c.sp12 += mp * cnt; c.sa12 += ma * cnt; }
          if (m > c.last) c.last = m;
          const q = qOf(m); const qq = (c.q[q] ||= [0, 0]); qq[0] += cnt; qq[1] += mp * cnt;
        }
        for (const x of part.d || []) { // [일, 단지, 동, 전용, 층, 금액, 준공]
          const k = x[1] + '|' + x[2]; const c = byCode[k];
          if (c) c.d.push([m + String(x[0]).padStart(2, '0'), x[3], x[4], x[5]]);
        }
      }
    }
  }

  const index = {};
  for (const [code, cx] of Object.entries(acc)) {
    const info = codes[code] || {};
    const rows = Object.entries(cx).map(([k, c]) => {
      const [apt, dong] = k.split('|');
      const deals = c.d.sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6);
      return [
        apt, dong, c.by || null,
        c.n12, c.n12 ? toPyeong(c.sp12 / c.n12) : null, c.n12 ? Math.round(c.sa12 / c.n12) : null,
        c.n, toPyeong(c.sp / c.n), c.last,
        quarters.map((q) => (c.q[q] ? toPyeong(c.q[q][1] / c.q[q][0]) : null)),
        deals, c.gu
      ];
    }).filter((r) => r[6] > 0).sort((a, b) => (b[4] || b[7]) - (a[4] || a[7]));
    if (!rows.length) continue;
    index[code] = { sd: info.sd || '', n: info.n || '', cx: rows.length };
    await writeJSON(path.join(OUT, 'near', `${code}.json`), {
      code, sd: info.sd, n: info.n, asOf: last, quarters,
      cols: ['단지', '법정동', '준공', '12개월 건수', '12개월 평당(만원)', '12개월 거래가(만원)', '36개월 건수', '36개월 평당(만원)', '마지막 거래월', '분기별 평당', '최근 거래[계약일,전용,층,금액]', '구'],
      cx: rows
    });
  }

  // 오피스텔·도시형 분양 (레이더가 받아 둔 경우만)
  const ofDir = path.join(SRC, 'public', 'data', 'officetel');
  try {
    await fs.mkdir(path.join(OUT, 'officetel'), { recursive: true });
    for (const f of await fs.readdir(ofDir)) if (f.endsWith('.json')) await fs.copyFile(path.join(ofDir, f), path.join(OUT, 'officetel', f));
  } catch { console.log('오피스텔 분양 자료 없음(레이더 수집 전)'); }
  // 청약 자료는 그대로 복사
  const chDir = path.join(SRC, 'public', 'data', 'cheongyak');
  for (const f of await fs.readdir(chDir)) {
    if (f.endsWith('.json')) await fs.copyFile(path.join(chDir, f), path.join(OUT, 'cheongyak', f)).catch(async () => {
      await fs.mkdir(path.join(OUT, 'cheongyak'), { recursive: true });
      await fs.copyFile(path.join(chDir, f), path.join(OUT, 'cheongyak', f));
    });
  }
  await buildStudy();
  const radarMeta = await readJSON(path.join(SRC, 'public', 'data', 'meta.json'), {});
  await writeJSON(path.join(OUT, 'meta.json'), {
    builtAt: new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 16).replace('T', ' '),
    tradeFrom: months[0], tradeTo: last, quarters,
    radarUpdated: radarMeta.updatedAt || radarMeta.generatedAt || null,
    codes: index
  });
  console.log('완료: 시군구', Object.keys(index).length, '개, 실거래', months[0], '~', last);
}

main().catch((e) => { console.error(e); process.exit(1); });
