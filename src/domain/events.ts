// 근처 공공 행사 피드: 형식 정의 + 공공데이터 → 피드 변환 + 관심사 태그 붙이기.
// 이 파일은 다른 모듈을 import 하지 않는다 → 피드 생성 스크립트(events-feed/build.ts)에서도 그대로 쓴다.
//
// 개인정보 원칙
// - 앱은 사용자가 고른 "시·도" 피드 파일 하나만 내려받는다 (관심사·기록·기기 ID는 보내지 않음)
// - 어떤 행사를 보여 줄지는 폰 안에서 기록을 분석해 고른다
// - GPS 위치는 쓰지 않는다 (사용자가 동네를 직접 고름)

/** 기록에서 뽑는 관심사 = 행사에 붙이는 태그 */
export type InterestTag = 'reading' | 'exercise' | 'study' | 'family';
export const INTEREST_TAGS: InterestTag[] = ['reading', 'exercise', 'study', 'family'];

/** 제목·분류·소개에 이 단어가 있으면 해당 태그 */
export const TAG_KEYWORDS: Record<InterestTag, string[]> = {
  reading: ['책', '독서', '북토크', '북콘서트', '작가와', '작가 강연', '도서관', '인문', '낭독', '필사', '문학', '시집', '서점'],
  exercise: ['마라톤', '러닝', '달리기', '걷기', '요가', '필라테스', '운동', '체육', '스포츠', '자전거', '등산', '트레킹', '수영', '댄스', '줌바'],
  study: ['강연', '강좌', '특강', '교육', '세미나', '아카데미', '클래스', '워크숍', '자격', '코딩', '외국어', '영어'],
  family: ['가족', '어린이', '아이와', '부모', '키즈', '유아', '아동'],
};

export function tagText(text: string): InterestTag[] {
  return INTEREST_TAGS.filter((tag) => TAG_KEYWORDS[tag].some((k) => text.includes(k)));
}

/** 시·도 (행정표준 코드 2자리). 피드 파일 이름으로 쓴다: {code}.json */
export const SIDO: { code: string; name: string }[] = [
  { code: '11', name: '서울' },
  { code: '26', name: '부산' },
  { code: '27', name: '대구' },
  { code: '28', name: '인천' },
  { code: '29', name: '광주' },
  { code: '30', name: '대전' },
  { code: '31', name: '울산' },
  { code: '36', name: '세종' },
  { code: '41', name: '경기' },
  { code: '51', name: '강원' },
  { code: '43', name: '충북' },
  { code: '44', name: '충남' },
  { code: '52', name: '전북' },
  { code: '46', name: '전남' },
  { code: '47', name: '경북' },
  { code: '48', name: '경남' },
  { code: '50', name: '제주' },
];

export interface PublicEvent {
  id: string;
  title: string;
  tags: InterestTag[];
  /** 시·군·구 (예: '마포구') */
  sigungu?: string;
  place?: string;
  /** 'YYYY-MM-DD' */
  start: string;
  end: string;
  /** 자세히 보기·신청 링크 */
  url: string;
  free?: boolean;
  /** 출처 표시용 (FeedFile.sources 의 키) */
  source: string;
}

export interface FeedFile {
  version: 1;
  sido: string;
  /** ISO 시각 */
  updatedAt: string;
  /** 출처 표시 문구 (공공누리 등 라이선스상 필요) */
  sources: Record<string, string>;
  events: PublicEvent[];
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** 내려받은 피드 검사. 형식이 틀린 항목은 버린다 */
export function normalizeFeed(raw: unknown): FeedFile | null {
  const r = raw as Partial<FeedFile> | null;
  if (!r || r.version !== 1 || typeof r.sido !== 'string' || !Array.isArray(r.events)) return null;
  const events: PublicEvent[] = [];
  for (const e of r.events as Partial<PublicEvent>[]) {
    if (!e || typeof e.id !== 'string' || typeof e.title !== 'string') continue;
    if (typeof e.start !== 'string' || !DATE.test(e.start) || typeof e.end !== 'string' || !DATE.test(e.end)) continue;
    if (typeof e.url !== 'string' || !/^https:\/\//.test(e.url)) continue; // https 링크만 연다
    const tags = Array.isArray(e.tags) ? e.tags.filter((t): t is InterestTag => INTEREST_TAGS.includes(t as InterestTag)) : [];
    if (!tags.length) continue;
    events.push({
      id: e.id,
      title: e.title,
      tags,
      start: e.start,
      end: e.end,
      url: e.url,
      source: typeof e.source === 'string' ? e.source : '',
      ...(typeof e.sigungu === 'string' && e.sigungu ? { sigungu: e.sigungu } : {}),
      ...(typeof e.place === 'string' && e.place ? { place: e.place } : {}),
      ...(typeof e.free === 'boolean' ? { free: e.free } : {}),
    });
  }
  return {
    version: 1,
    sido: r.sido,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : '',
    sources: r.sources && typeof r.sources === 'object' ? (r.sources as Record<string, string>) : {},
    events,
  };
}

// ───────── 서울 열린데이터광장: 서울시 문화행사 정보 (culturalEventInfo) ─────────

export const SEOUL_SOURCE = { key: 'seoul', label: '서울문화포털 · 서울 열린데이터광장 (공공누리 제1유형)' };

export interface SeoulCultureRow {
  CODENAME?: string;
  GUNAME?: string;
  TITLE?: string;
  PLACE?: string;
  PROGRAM?: string;
  USE_TRGT?: string;
  ORG_LINK?: string;
  HMPG_ADDR?: string;
  STRTDATE?: string;
  END_DATE?: string;
  IS_FREE?: string;
}

/** 서울 문화행사 한 건 → 피드 항목. 관심사 태그가 없거나 이미 끝난 행사는 null */
export function mapSeoulRow(row: SeoulCultureRow, today: string): PublicEvent | null {
  const title = row.TITLE?.trim();
  const start = row.STRTDATE?.slice(0, 10) ?? '';
  const end = row.END_DATE?.slice(0, 10) ?? '';
  if (!title || !DATE.test(start) || !DATE.test(end) || end < today) return null;
  const url = [row.HMPG_ADDR, row.ORG_LINK].map((u) => u?.trim().replace(/^http:\/\//, 'https://')).find((u) => u && /^https:\/\//.test(u));
  if (!url) return null;
  // 분류명(예: '교육/체험')은 너무 넓어서 태그에 쓰지 않는다
  const tags = tagText([title, row.PROGRAM, row.USE_TRGT].filter(Boolean).join(' '));
  if (!tags.length) return null;
  const id = url.match(/cultcode=(\d+)/)?.[1];
  return {
    id: `seoul-${id ?? `${start}-${title}`}`,
    title,
    tags,
    start,
    end,
    url,
    source: SEOUL_SOURCE.key,
    ...(row.GUNAME?.trim() ? { sigungu: row.GUNAME.trim() } : {}),
    ...(row.PLACE?.trim() ? { place: row.PLACE.trim() } : {}),
    ...(row.IS_FREE ? { free: row.IS_FREE.trim() === '무료' } : {}),
  };
}
