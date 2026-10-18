// 근처 행사 피드 만들기: 공공데이터를 받아 시·도별 정적 JSON 파일로 저장한다.
// 실행: SEOUL_API_KEY=발급키 node events-feed/build.ts   (키가 없으면 'sample' 로 5건만 받아 시험)
// 결과: events-feed/out/v1/index.json, events-feed/out/v1/{시도코드}.json
//
// 서버 없이 운영: GitHub Actions 가 하루 한 번 이 스크립트를 돌려 GitHub Pages 에 올린다 (무료).
// 앱은 고른 시·도 파일 하나만 내려받고, 추천은 폰 안에서 한다.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mapSeoulRow, SEOUL_SOURCE, type FeedFile, type PublicEvent, type SeoulCultureRow } from '../src/domain/events.ts';

const OUT = join(dirname(fileURLToPath(import.meta.url)), 'out', 'v1');
const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10); // 한국 날짜

/** 서울시 문화행사: 최근 등록순으로 최대 maxRows 건 (지난 행사는 변환 단계에서 버림) */
async function fetchSeoul(key: string, maxRows: number): Promise<PublicEvent[]> {
  const page = key === 'sample' ? 5 : 1000; // sample 키는 5건까지만 허용
  const out = new Map<string, PublicEvent>();
  for (let start = 1; start <= maxRows; start += page) {
    const url = `http://openapi.seoul.go.kr:8088/${encodeURIComponent(key)}/json/culturalEventInfo/${start}/${start + page - 1}/`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`서울 API 오류 ${res.status}`);
    const body = (await res.json()) as { culturalEventInfo?: { RESULT?: { CODE?: string; MESSAGE?: string }; row?: SeoulCultureRow[] } };
    const info = body.culturalEventInfo;
    if (!info?.row?.length) {
      if (start === 1) throw new Error(`서울 API 응답 없음: ${JSON.stringify(body).slice(0, 200)}`);
      break;
    }
    for (const row of info.row) {
      const e = mapSeoulRow(row, today);
      if (e) out.set(e.id, e);
    }
    if (key === 'sample') break;
  }
  return [...out.values()].sort((a, b) => a.start.localeCompare(b.start));
}

async function main() {
  const key = process.env.SEOUL_API_KEY || 'sample';
  const maxRows = Number(process.env.SEOUL_MAX_ROWS) || 5000;
  mkdirSync(OUT, { recursive: true });
  const updatedAt = new Date().toISOString();

  const seoul: FeedFile = {
    version: 1,
    sido: '11',
    updatedAt,
    sources: { [SEOUL_SOURCE.key]: SEOUL_SOURCE.label },
    events: await fetchSeoul(key, maxRows),
  };
  writeFileSync(join(OUT, '11.json'), JSON.stringify(seoul));

  // 피드가 있는 시·도 목록 (앱이 "아직 준비 중인 지역"을 안내할 때 사용)
  writeFileSync(join(OUT, 'index.json'), JSON.stringify({ version: 1, updatedAt, sidos: ['11'] }));
  console.log(`서울 ${seoul.events.length}건 → ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
