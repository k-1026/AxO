/* 기획 규칙: 라인 구성, 문구, 페르소나, 추천 조합 등. 화면 로직과 함께 바뀌는 값이라 코드에 둬요. */
export const FINISH = Object.fromEntries(["진정", "쿨링", "모공·피지", "보습", "민감·장벽", "미백(톤)", "영양", "탄력"].map(p => [p, { mat: "청향 샘플의 제품별 재질·투명도·광택 유지" }]));
export const PURPOSE_LABEL = { "보습": "수분 보습", "민감·장벽": "장벽 보습", "진정": "진정", "미백(톤)": "톤", "쿨링": "쿨링", "모공·피지": "모공 피지", "영양": "영양", "탄력": "탄력" };
/* 중저가 단위당 정가 범위 (가격 기준표) · 용량·정가는 범위 안의 예시값
   토너~미스트: research/HSJ_가격기준_K5.md · 클렌저·마스크·패드·아이크림: research/MEJ_가격기준_추가제품.md (2026-11-24 올리브영 판매순)
   마스크·패드는 ml 대신 매(장)당 정가예요 (UNIT 참고) */
export const PRICE_RANGE = { toner: [36, 90], serum: [148, 430], cream: [280, 410], lotion: [98, 193], mist: [88, 192],
  cleanser: [53, 136], mask: [2500, 3600], pad: [238, 263], eye: [483, 1033] };

/* 제품 유형별 용량 단위. 없으면 ml. 용량 숫자는 어느 단위든 같은 칸(ml)에 담아요 */
export const UNIT = { mask: "매", pad: "매" };
export const unitOf = type => UNIT[type] || "ml";
/** 용량 글자: qty("pad", 70) → "70매", qty("toner", 200) → "200ml" */
export const qty = (type, n) => `${n}${unitOf(type)}`;

export const ITEM = {
  toner: ["toner", "토너", 200, 15000], serum: ["serum", "세럼", 50, 19000], cream: ["cream", "크림", 50, 19000],
  gel: ["cream", "젤 크림", 50, 19000], rich: ["cream", "리치 크림", 50, 20000],
  lotion: ["lotion", "로션", 200, 30000], mist: ["mist", "미스트", 100, 15000],
  cleanser: ["cleanser", "클렌저", 150, 15000], mask: ["mask", "마스크", 5, 15000],
  pad: ["pad", "패드", 70, 18000], padpack: ["pad", "패드·팩", 70, 18000], eye: ["eye", "아이크림", 30, 22000]
};
export const LINE_RULE = {
  "진정":     { first: ["toner", "gel"], next: ["세럼", "미스트", "패드"] },
  "민감·장벽": { first: ["toner", "cream"], next: ["세럼", "로션", "미스트"], extra: "클렌저" },
  "보습":     { first: ["toner", "serum", "cream"], next: ["클렌저", "미스트", "마스크"] },
  "영양":     { first: ["toner", "rich"], next: ["세럼", "로션", "마스크"] },
  "쿨링":     { first: ["toner", "gel", "mist"], next: [] },
  "모공·피지": { first: ["toner"], next: ["세럼", "젤 크림", "패드·팩"], extra: "클렌저" },
  "미백(톤)":  { first: ["toner", "serum", "cream"], next: ["마스크"] },
  "탄력":     { first: ["serum", "cream"], next: ["토너", "아이크림"] }
};
export const lineupFor = p => (LINE_RULE[p] || LINE_RULE["보습"]).first.map(k => ITEM[k]);

/* 제품 이름 → 기준 용량·정가. 다른 라인에서 같은 제품을 쓸 때의 값을 그대로 써요 (예: 탄력 라인의 토너 = 다른 라인의 토너 200ml 15,000원). */
const ITEM_BY_NAME = Object.fromEntries(Object.values(ITEM).map(x => [x[1], x]));

/* 후보 라인에서 고를 수 있는 제품 전체 (추천 구성 → 함께 낼 수 있는 제품 순서).
   기준값이 없는 제품은 ml·price 가 null 이에요(가격 준비 중). base = 처음부터 골라 둘 추천 구성 */
export function productOptions(l) {
  const out = [], seen = new Set();
  const add = ([type, name, ml, price], base) => {
    if (!name || seen.has(name)) return;
    seen.add(name);
    out.push({ type, name, ml: ml ?? null, price: price ?? null, base });
  };
  for (const row of l?.lineup || []) add(row, true);
  const more = name => ITEM_BY_NAME[name] || [name === "클렌저" ? "cleanser" : "etc", name, null, null];
  if (l?.extra) add(more(l.extra), true);
  for (const name of l?.next || []) add(more(name), false);
  return out;
}

/* 고른 제품 이름으로 라인을 다시 짜요 → { line } 또는 { error }.
   기준값이 있는 제품은 lineup, 없는 제품은 extras(가격 준비 중)로 가요. names 가 없으면 추천 구성을 써요. */
export function selectLine(l, names) {
  const opts = productOptions(l);
  const picked = Array.isArray(names) ? names : opts.filter(o => o.base).map(o => o.name);
  if (!picked.length) return { error: "제품을 1개 이상 골라 주세요." };
  if (picked.some(n => typeof n !== "string" || !opts.some(o => o.name === n))) return { error: "이 후보에 없는 제품이 있어요. 다시 골라 주세요." };
  const chosen = opts.filter(o => picked.includes(o.name));
  const lineup = chosen.filter(o => o.price != null).map(o => [o.type, o.name, o.ml, o.price]);
  if (!lineup.length) return { error: "용량·정가가 있는 제품을 1개 이상 골라 주세요." };
  const extras = chosen.filter(o => o.price == null).map(o => ({ type: o.type, name: o.name }));
  return { line: { ...l, lineup, extra: undefined, extras, selected: chosen.map(o => o.name) } };
}

/* 가격 준비 중 제품 목록: 선택을 거친 라인은 extras, 예전 라인은 extra(문자열) */
export const extrasOf = l => (Array.isArray(l?.extras) ? l.extras : l?.extra ? [{ type: "cleanser", name: l.extra }] : []);

export const ROLE = { "토너": "결 정돈", "세럼": "원료를 진하게 담는 대표 단계", "크림": "보습 마무리", "젤 크림": "산뜻한 마무리",
  "리치 크림": "영양감 마무리", "미스트": "수시로 뿌리는 쿨링", "로션": "가벼운 보습",
  "클렌저": "부드러운 세안", "마스크": "집중 보습 케어", "패드": "닦아 내는 결 정돈", "패드·팩": "닦아 내는 결 정돈", "아이크림": "눈가 보습" };

export const COMBO_WHY = {
  "진정": "예민한 시기엔 단계를 줄여야 부담이 적어서, 토너로 정돈하고 젤 크림으로 가볍게 끝나는 2단계로 묶었어요.",
  "쿨링": "더운 날 바로 쓰도록 미스트를 1차에 넣고, 토너와 젤 크림으로 산뜻한 사용감을 맞췄어요.",
  "민감·장벽": "자극을 줄이려 토너와 크림 2단계로 장벽 보습에 집중했어요. 클렌저도 추천 구성이지만 용기 샘플이 아직 없어요.",
  "보습": "수분은 토너 → 세럼 → 크림으로 겹쳐 채울수록 촉촉함이 이어져서 3단계로 묶었어요. 세럼이 대표 제품이에요.",
  "영양": "푸석함엔 진한 크림이 중심이라, 토너로 결을 정돈하고 리치 크림으로 영양감을 채우는 2단계로 묶었어요.",
  "미백(톤)": "톤 라인은 원료를 진하게 담는 세럼이 대표 제품이라, 토너 → 세럼 → 크림 루틴으로 묶었어요.",
  "탄력": "탄력 라인은 세럼과 크림에 집중했어요. 토너·아이크림은 원하면 함께 골라 넣을 수 있어요.",
  "모공·피지": "번들거릴 땐 가벼운 토너 하나로 시작하고, 세럼·젤 크림은 원하면 함께 골라 넣어요. 클렌저도 추천 구성이지만 용기 샘플이 아직 없어요."
};

export const TALK = {
  "진정": (h, s) => `${s} 들어 피부가 예민해졌다고 느끼시죠? ${h} 진정 라인은 토너로 정돈하고 젤 크림으로 산뜻하게 끝나는 두 단계라, 예민한 날에도 부담 없이 쓰기 좋아요.`,
  "쿨링": (h, s) => `더운 날 열감이 올라오면 ${h} 미스트를 가볍게 뿌려 보세요. 쿨링감이 산뜻하고, 아침엔 토너와 젤 크림으로 가볍게 마무리하시면 돼요.`,
  "민감·장벽": (h, s) => `${s}엔 피부가 쉽게 건조하고 예민해져서 단계를 줄이는 게 좋아요. ${h} 라인은 토너와 크림 두 가지로 장벽 보습에 집중했어요.`,
  "보습": (h, s) => `${s}엔 피부가 쉽게 당기니까 토너, 세럼, 크림을 차례로 겹쳐 발라 보세요. ${h} 수분 라인이 촉촉하게 채워 줘요.`,
  "영양": (h, s) => `피부가 푸석해 보이는 날엔 리치 크림을 넉넉히 발라 보세요. ${h} 영양 라인은 토너로 결을 정돈하고 크림으로 윤기를 채워 줘요.`,
  "미백(톤)": (h, s) => `피부톤이 칙칙해 보일 때는 세럼을 먼저 챙겨 보세요. ${h} 톤 라인은 맑아 보이는 피부톤을 위한 토너·세럼·크림 루틴이에요.`,
  "탄력": (h, s) => `탄력 있어 보이는 피부를 원하시면 세럼과 크림 두 가지로 시작해 보세요. ${h} 라인은 쫀쫀한 마무리가 좋아요.`,
  "모공·피지": (h, s) => `번들거림이 고민이시면 산뜻한 ${h} 토너 하나로 피지 관리를 시작해 보세요. 보송한 마무리가 좋아요.`
};

export const PERSONAS = [
  { k: "scent", icon: "👃", type: "향 거부형", who: "이하은 · 24세 · 민감성", pain: "한약 냄새가 세고 오래 남아요" },
  { k: "weight", icon: "🧴", type: "무게감 거부형", who: "최유진 · 28세 · 지성", pain: "한방 크림은 무겁고 번들거려요" },
  { k: "image", icon: "👵", type: "이미지 거부형", who: "정다은 · 25세 · 복합성", pain: "엄마 화장품 같아서 내 것 같지 않아요" },
  { k: "trust", icon: "❓", type: "불신형", who: "강수빈 · 29세 · 건성", pain: "무슨 약재가 어디서 왔는지 몰라 못 믿겠어요" }
];

export const LIGHT = { "쿨링": 5, "모공·피지": 5, "진정": 5, "민감·장벽": 3, "보습": 3, "미백(톤)": 3, "탄력": 2, "영양": 1 };

export const COMBO_KW = { "진정": "단계 줄이기 · 젤 크림으로 가볍게", "쿨링": "미스트로 바로 쿨링 · 젤 크림 마무리", "민감·장벽": "2단계 · 장벽 보습 집중",
  "보습": "겹쳐 바르기 · 세럼이 대표", "영양": "리치 크림 중심", "미백(톤)": "세럼이 대표 · 톤 루틴", "탄력": "세럼 + 크림 집중", "모공·피지": "토너 하나로 가볍게" };
export const PAIN_KW = { scent: "한약 냄새", weight: "무거운 크림", image: "엄마 화장품 느낌", trust: "원료 출처를 몰라요" };

export const PRESETS = [
  { nm: "📋 체크리스트 기본", w: { demand: 2, edge: 2, feel: 2, price: 2, ready: 1, brand: 1 } },
  { nm: "⚡ 이번 시즌 바로", w: { ready: 2, fresh: 2, edge: 1 } },
  { nm: "🏮 우리다움 먼저", w: { brand: 2, fresh: 1 } },
  { nm: "🎯 빈자리 공략", w: { edge: 2, price: 1 } },
  { nm: "🛒 고민 해결 먼저", w: { demand: 2, feel: 1 } }
];

export const SEASON_TREND_NOTES = {
  "봄": { line: "환절기에는 ‘순한 진정·장벽 보습’을 소비자 관심 가설로 살펴볼 만해요.", tip: "감초 등 진정·보습 후보의 순한 사용감과 보습 메시지를 비교해 보세요." },
  "여름": { line: "폭염·고습에는 ‘속은 촉촉하게, 겉은 산뜻하게’를 소비자 관심 가설로 볼 수 있어요.", tip: "쿨링감·피지 케어·가벼운 젤 제형을 우선 비교해 보세요." },
  "가을": { line: "건조함이 시작되면 ‘수분 레이어링·부담 없는 보습’을 소비자 관심 가설로 살펴볼 만해요.", tip: "토너·세럼의 겹쳐 바르기와 크림의 마무리감을 함께 비교해 보세요." },
  "겨울": { line: "한파·난방 환경에서는 ‘오래가는 보습·편안한 장벽 케어’를 소비자 관심 가설로 볼 수 있어요.", tip: "보습 지속감과 끈적임의 균형을 크림 기획의 비교 기준으로 잡아보세요." }
};

export const PRODUCT_BOX = { toner: [245, 75, 675, 965], serum: [245, 40, 690, 950], cream: [195, 275, 820, 830], lotion: [240, 260, 655, 935], mist: [250, 25, 590, 935] };

/* 용기 샘플 파일 이름 (public/IMAGE/LOGO/cheonghyang-logo-02/application-examples) · 주소 앞부분은 config/assets.js */
export const SAMPLE = { toner: "toner.png", serum: "serum.png", cream: "cream.png", lotion: "lotion-pump.png", mist: "mist.png" };

/* 의약품식 효능 표현 금지어 · 화장품 광고에 쓰지 않아요 */
export const BANNED_PHRASES = ["여드름 치료", "치료", "완치", "염증", "항염", "소염", "재생", "혈액순환", "아토피", "처방"];
/* 금지어처럼 보이지만 쓸 수 있는 말(용기·종이 이야기 등) */
export const BANNED_EXCEPTIONS = ["재생 용기", "재생 플라스틱", "재생지", "재생 종이", "재생용지"];
/* 영어 이미지 문구용 금지어 · 대소문자 구분 없이 낱말 경계에서 잡아요 */
export const BANNED_ENGLISH = [
  /\btreat(?:s|ed|ing|ment|ments)?\b/i, /\bcur(?:e|es|ed|ing)\b/i, /\bheal(?:s|ed|ing)?\b/i,
  /\banti-?inflammatory\b/i, /\binflammation\b/i, /\bblood\s+circulation\b/i, /\beczema\b/i,
  /\batopic\b/i, /\bprescription\b/i, /\bregenerat\w*/i
];
