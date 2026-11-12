// 분양시장 레이더 저장소(New-Build_Rader)가 매일 모으는 자료를 받아
// 이 앱이 쓰기 좋은 모양으로 바꿉니다. (API 키 필요 없음)
//  - site/data/near/<시군구코드>.json : 단지별 실거래 요약 (최근 36개월)
//  - site/data/cheongyak/<시도>.json   : 청약 공고·결과 (그대로 복사)
//  - site/data/meta.json               : 기준일, 쓸 수 있는 시군구 코드
// 사용법: SRC=레이더저장소경로 node scripts/build-data.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

const SRC = process.env.SRC || '_src';
const OUT = path.join(process.cwd(), 'site', 'data');
const PY = 3.3058; // ㎡ → 평

const readJSON = async (p, d) => { try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return d; } };
const writeJSON = async (p, o) => { await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(o)); };
const toPyeong = (v) => (v == null ? null : Math.round((v / 10) * PY)); // 레이더 값(만원/㎡×10) → 만원/평

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

  // 청약 자료는 그대로 복사
  const chDir = path.join(SRC, 'public', 'data', 'cheongyak');
  for (const f of await fs.readdir(chDir)) {
    if (f.endsWith('.json')) await fs.copyFile(path.join(chDir, f), path.join(OUT, 'cheongyak', f)).catch(async () => {
      await fs.mkdir(path.join(OUT, 'cheongyak'), { recursive: true });
      await fs.copyFile(path.join(chDir, f), path.join(OUT, 'cheongyak', f));
    });
  }
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
