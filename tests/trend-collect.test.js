import { describe, it, expect, vi } from "vitest";
import { parseRss, isSkincareTrend, articleId, cleanPicks, mergeSnapshot, collectTrends, cleanInsights, FEEDS } from "../server/trends/collect.js";
import { authorized } from "../api/trend-collect.js";

const NOW = Date.parse("2026-11-27T09:00:00+09:00");
const RSS = `<?xml version="1.0"?><rss><channel>
<item><title><![CDATA[환절기 보습 크림 수요 늘어]]></title><link>https://www.jangup.com/news/articleView.html?idxno=101</link>
<pubDate>2026-11-26 10:00:00</pubDate><description><![CDATA[<p>건조한 날씨에 장벽 보습 크림이 소개됐다 &amp; 주목</p>]]></description></item>
<item><title>토니모리, 일·생활 균형 우수기업 선정</title><link>https://www.jangup.com/news/articleView.html?idxno=102</link>
<pubDate>2026-11-26 09:00:00</pubDate><description>피부 이야기는 아님</description></item>
<item><title>오래된 토너 기사</title><link>https://www.jangup.com/news/articleView.html?idxno=50</link>
<pubDate>2026-09-01 09:00:00</pubDate><description>토너</description></item>
</channel></rss>`;

describe("RSS 읽기·거르기", () => {
  it("CDATA·태그·&amp; 를 풀고 한국 시각 날짜로 읽어요", () => {
    const [a] = parseRss(RSS);
    expect(a).toMatchObject({ title: "환절기 보습 크림 수요 늘어", publishedAt: "2026-11-26", link: "https://www.jangup.com/news/articleView.html?idxno=101" });
    expect(a.summary).toBe("건조한 날씨에 장벽 보습 크림이 소개됐다 & 주목");
  });
  it("스킨케어 기사만 남기고, 회사 소식·30일 넘은 기사는 빼요", () => {
    const kept = parseRss(RSS).filter(a => isSkincareTrend(a, NOW)).map(a => a.title);
    expect(kept).toEqual(["환절기 보습 크림 수요 늘어"]);
  });
  it("기사 번호로 같은 기사는 매일 같은 id", () => {
    expect(articleId("jangup", "https://www.jangup.com/news/articleView.html?idxno=101")).toBe("jangup-101");
  });
});

describe("AI 답 검증", () => {
  const cands = [{ id: "jangup-101", title: "t", link: "https://x", publishedAt: "2026-11-26", summary: "s", source: "장업신문", kind: "업계 기사" }];
  it("없는 id·빈 설명·금지 표현은 버리고, 계절은 봄·여름·가을·겨울만", () => {
    const out = cleanPicks({ picks: [
      { id: "없는id", easy: "x", tags: [], seasons: [] },
      { id: "jangup-101", easy: "여드름 치료에 좋아요", tags: [], seasons: [] },
      { id: "jangup-101", easy: "환절기 보습 크림이 소개됐어요.", tags: ["보습", 3], seasons: ["가을", "장마"] }
    ] }, cands);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ easy: "환절기 보습 크림이 소개됐어요.", tags: ["보습"], seasons: ["가을"] });
  });
});

describe("새 묶음 합치기", () => {
  const prev = {
    insights: { "봄": { line: "l", tip: "t", evidenceIds: ["old-1"] } },
    items: [{ id: "old-1", title: "봄 환절기 보습", publishedAt: "2026-10-01" }, { id: "old-2", publishedAt: "2026-09-01" }],
    sourceChecks: [{ id: "jangup", status: "checked" }]
  };
  it("새 트렌드를 앞에 두고, 계절 인사이트와 그 근거 기사는 이어 가요", () => {
    const p = mergeSnapshot(prev, [{ id: "jangup-101", source: "장업신문", kind: "업계 기사", title: "t", link: "https://x", publishedAt: "2026-11-26", summary: "s", tags: ["보습"], easy: "e", seasons: [] }], [{ id: "rss-jangup", status: "checked" }], NOW);
    expect(p.items.map(i => i.id)).toEqual(["jangup-101", "old-1"]);
    expect(p.items[0]).toMatchObject({ url: "https://x", easy: "e", seasons: [] });
    expect(p.insights).toEqual(prev.insights);
    expect(p.sourceChecks.map(c => c.id)).toEqual(["jangup", "rss-jangup"]);
    expect(p).toHaveProperty("version", 1);
  });
  it("계절 인사이트의 근거가 그 계절 자료가 아니면 버려요 (예: 겨울 포인트를 계절 없는 10월 기사로)", () => {
    const winter = { insights: { "겨울": { line: "l", tip: "t", evidenceIds: ["oy"] } }, items: [{ id: "oy", title: "앵커로 변신한 코르티스", publishedAt: "2026-10-26" }] };
    expect(mergeSnapshot(winter, [], [], NOW).insights).toEqual({});
  });
});

describe("계절 인사이트 검증", () => {
  const pools = { "가을": [{ id: "a1" }] };
  it("그 계절 기사 id 만 근거로 인정하고, 없는 계절·금지 표현은 버려요", () => {
    const out = cleanInsights({ insights: [
      { season: "겨울", line: "x", tip: "y", evidenceIds: ["a1"] },
      { season: "가을", line: "치료 효과", tip: "y", evidenceIds: ["a1"] },
      { season: "가을", line: "보습 레이어링", tip: "마무리감 비교", evidenceIds: ["a1", "없음"] }
    ] }, pools);
    expect(out).toEqual({ "가을": { line: "보습 레이어링", tip: "마무리감 비교", evidenceIds: ["a1"] } });
  });
});

describe("수집 한 번", () => {
  it("RSS → AI(기사 고르기 + 그 계절 인사이트) → 저장", async () => {
    const save = vi.fn();
    const generate = vi.fn(async (_p, schema) => schema.properties.picks
      ? { picks: [{ id: "jangup-101", easy: "환절기 보습 크림이 소개됐어요.", tags: ["보습"], seasons: ["가을"] }] }
      : { insights: [{ season: "가을", line: "가을엔 장벽 보습 중심으로 잡아 보세요.", tip: "보습 크림 사용감을 비교해 보세요.", evidenceIds: ["jangup-101"] }] });
    const r = await collectTrends({ now: () => NOW, fetchText: async u => ({ status: 200, text: u === FEEDS[0].url ? RSS : "<rss></rss>" }), generate, loadLatest: async () => null, save });
    expect(r).toMatchObject({ saved: true, picked: 1, candidates: 1 });
    expect(generate).toHaveBeenCalledTimes(2);
    const saved = save.mock.calls[0][0];
    expect(saved.items[0]).toMatchObject({ id: "jangup-101", seasons: ["가을"] });
    expect(saved.insights).toEqual({ "가을": { line: "가을엔 장벽 보습 중심으로 잡아 보세요.", tip: "보습 크림 사용감을 비교해 보세요.", evidenceIds: ["jangup-101"] } });
  });
  it("RSS가 막히면 AI를 부르지 않고 저장도 안 해요 (이전 자료 유지)", async () => {
    const generate = vi.fn(), save = vi.fn();
    const r = await collectTrends({ now: () => NOW, fetchText: async () => ({ status: 403, text: "" }), generate, loadLatest: async () => null, save });
    expect(r.saved).toBe(false);
    expect(r.checks.every(c => c.status === "unavailable")).toBe(true);
    expect(generate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});

describe("예약 실행 보호", () => {
  it("CRON_SECRET 이 맞을 때만 실행", () => {
    const secret = "a".repeat(32);
    expect(authorized({ headers: { authorization: `Bearer ${secret}` } }, secret)).toBe(true);
    expect(authorized({ headers: { authorization: "Bearer wrong" } }, secret)).toBe(false);
    expect(authorized({ headers: {} }, secret)).toBe(false);
    expect(authorized({ headers: { authorization: "Bearer short" } }, "short")).toBe(false);
  });
});
