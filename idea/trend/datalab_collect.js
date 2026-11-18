#!/usr/bin/env node
/*
 * 트렌드 수집 에이전트 · 2단계 스크립트 초안 (MEJ, 2026-11-13)
 *
 * 하는 일: 네이버 데이터랩 검색어 트렌드에서 약재별 검색어 묶음의 주간 흐름을 받아
 *         "최근 4주 평균 ÷ 그 전 12주 평균"으로 상승/보통/하락을 판정하고
 *         idea/trend/trend.json (시안이 읽는 파일)과 트렌드스냅샷_YYYY-MM-DD.md 를 만들어요.
 *
 * 실행:  NAVER_CLIENT_ID=... NAVER_CLIENT_SECRET=... node idea/trend/datalab_collect.js
 *        node idea/trend/datalab_collect.js --dry-run   (키 없이 보낼 요청만 확인)
 *        node idea/trend/datalab_collect.js --self-test (판정 계산만 검사, 가짜 숫자로 파일을 만들지 않음)
 *
 * ⚠️ 확인 필요 (공식 문서를 이 환경에서 열지 못했어요. 첫 실행 전에 developers.naver.com 문서로 확인):
 *   - 요청 주소 https://openapi.naver.com/v1/datalab/search 와 인증 헤더 X-Naver-Client-Id / X-Naver-Client-Secret
 *   - 한 묶음당 검색어 최대 개수 (문서마다 5 / 20으로 다름)
 *   - 하루 호출 한도
 * 확인된 것 (NAVER API HUB 문서): timeUnit은 date/week/month, keywordGroups는 최대 5개,
 *   조회는 2016-01-01부터, 응답은 results[].data[]{period, ratio}이고 ratio는 검색 횟수가 아닌 상대 지수.
 *
 * API 키는 팀이 네이버 개발자센터에서 직접 발급해 환경 변수로만 넣어요. 파일에 적거나 커밋하지 않아요.
 */
const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const CONFIG = JSON.parse(fs.readFileSync(path.join(DIR, "keywords.json"), "utf8"));
const ENDPOINT = "https://openapi.naver.com/v1/datalab/search"; // 확인 필요
const UP = 1.2, DOWN = 0.8; // 판정 기준 (팀이 정할 값)

const iso = d => d.toISOString().slice(0, 10);
function range(weeks) {
  const end = new Date();
  const start = new Date(end.getTime() - weeks * 7 * 864e5);
  return { startDate: iso(start), endDate: iso(end) };
}

/* 판정: ratio는 요청 안에서의 상대값이라 묶음끼리 크기를 비교하지 않고,
   같은 묶음 안의 "최근 ÷ 이전" 비율만 써요. 그래서 5개씩 나눠 보내도 판정이 흔들리지 않아요.
   응답에서 검색량이 없는 주는 빠져 올 수 있어 0으로 채워요. */
function judge(data, weeksAll, recentWeeks) {
  const vals = data.map(d => d.ratio);
  while (vals.length < weeksAll) vals.unshift(0);
  const recent = vals.slice(-recentWeeks), before = vals.slice(-weeksAll, -recentWeeks);
  const avg = a => a.reduce((s, x) => s + x, 0) / (a.length || 1);
  const r = avg(recent), b = avg(before);
  if (b === 0 && r === 0) return { signal: "자료 없음", change: null, score: null };
  if (b === 0) return { signal: "상승", change: null, score: 5 };
  const change = r / b;
  const signal = change >= UP ? "상승" : change <= DOWN ? "하락" : "보통";
  return { signal, change: Math.round(change * 100) / 100, score: signal === "상승" ? 5 : signal === "보통" ? 3 : 1 };
}

async function fetchBatch(groups, dates, id, secret) {
  const body = {
    ...dates, timeUnit: "week",
    keywordGroups: groups.map(g => ({ groupName: g.herb, keywords: g.keywords }))
  };
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`데이터랩 응답 ${res.status}: ${await res.text()}`);
  return res.json();
}

function writeOutputs(rows, dates) {
  const today = iso(new Date());
  const json = {
    collectedAt: today,
    source: "네이버 데이터랩 검색어 트렌드 (주간, 상대 지수)",
    grade: "🟢",
    period: dates,
    rule: `최근 ${CONFIG.recentWeeks}주 평균 ÷ 그 전 ${CONFIG.lookbackWeeks - CONFIG.recentWeeks}주 평균 · ${UP} 이상 상승(5점) · ${DOWN} 이하 하락(1점) · 그 사이 보통(3점)`,
    herbs: Object.fromEntries(rows.map(r => [r.herb, { signal: r.signal, change: r.change, score: r.score, keywords: r.keywords }]))
  };
  fs.writeFileSync(path.join(DIR, "trend.json"), JSON.stringify(json, null, 2) + "\n");

  const md = `---
담당: MEJ (트렌드 수집 에이전트 자동 생성)
영역: 산업·시장
주제: 주간 트렌드 스냅샷
최종수정: ${today}
상태: 검토대기
---

# 주간 트렌드 스냅샷 ${today}

## 📌 한 줄 요약
${rows.filter(r => r.signal === "상승").map(r => r.herb).join(", ") || "상승한 약재 없음"} 검색 흐름이 최근 ${CONFIG.recentWeeks}주 동안 올랐어요.

## 🔑 핵심 내용
| 약재 | 검색어 묶음 | 최근÷이전 | 판정 | 출시 순위 점수 |
|---|---|---|---|---|
${rows.map(r => `| ${r.herb} | ${r.keywords.join(", ")} | ${r.change ?? "–"} | [사실] ${r.signal} [1] | ${r.score ?? "확인 필요"} |`).join("\n")}

- [해석] 검색량은 관심의 신호이고 실제 구매가 아니에요. 출시 순위에서는 '📈 뜨는 원료' 버튼 점수로만 써요.

## ❓ 아직 모르는 것
- 검색어 묶음이 약재 화장품 관심을 잘 대표하는지 (팀 검토 필요)

## 📚 출처
| # | 출처 | 등급 | 확인일 | 위치 |
|---|---|---|---|---|
| 1 | 네이버 데이터랩 검색어 트렌드 API, ${dates.startDate}~${dates.endDate}, 주간 | 🟢 | ${today} | 응답 원본은 trend.json |
`;
  fs.writeFileSync(path.join(DIR, `트렌드스냅샷_${today}.md`), md);
  console.log(`저장: trend.json, 트렌드스냅샷_${today}.md`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) {
    const t = (d, want) => { const g = judge(d.map(x => ({ ratio: x })), 16, 4); console.log(g.signal === want ? "통과" : "실패", want, g); };
    t([...Array(12).fill(10), 15, 15, 15, 15], "상승");
    t([...Array(12).fill(10), 10, 9, 11, 10], "보통");
    t([...Array(12).fill(10), 5, 5, 5, 5], "하락");
    t([], "자료 없음");
    return;
  }
  const dates = range(CONFIG.lookbackWeeks);
  const batches = [];
  for (let i = 0; i < CONFIG.groups.length; i += 5) batches.push(CONFIG.groups.slice(i, i + 5));
  if (args.includes("--dry-run")) {
    batches.forEach((b, i) => console.log(`요청 ${i + 1}:`, JSON.stringify({ ...dates, timeUnit: "week", keywordGroups: b.map(g => ({ groupName: g.herb, keywords: g.keywords })) })));
    return;
  }
  const id = process.env.NAVER_CLIENT_ID, secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) { console.error("NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경 변수가 없어요. --dry-run 으로 요청만 확인할 수 있어요."); process.exit(1); }
  const rows = [];
  for (const b of batches) {
    const out = await fetchBatch(b, dates, id, secret);
    for (const r of out.results) {
      const g = b.find(x => x.herb === r.title);
      rows.push({ herb: r.title, keywords: g ? g.keywords : r.keywords, ...judge(r.data, CONFIG.lookbackWeeks, CONFIG.recentWeeks) });
    }
  }
  writeOutputs(rows, dates);
}
main().catch(e => { console.error(e.message); process.exit(1); });
