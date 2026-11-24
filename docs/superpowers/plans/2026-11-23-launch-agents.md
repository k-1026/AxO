# 출시 기획 에이전트 Implementation Plan

> **2026-11-24 변경:** 이미지 생성도 OpenAI 대신 **Gemini 이미지 모델**로 바꿨어요(글·이미지 모두 `GEMINI_API_KEY` 하나). `server/llm/openai.js`는 지웠고 `editImage`는 `server/llm/gemini.js`에 있어요. Gemini 이미지 모델은 무료 플랜 한도가 0이라, Google AI Studio에서 결제(Billing)를 켜야 이미지가 만들어져요.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 후보 하나로 기획안 + 광고·마케팅 시나리오 3개(대표 이미지 포함)를 만들어 버전으로 저장하고, 마이 기획실에서 챗봇 미리보기 → 적용으로 새 버전을 만든다.

**Architecture:** 지금 Vite+JS 사이트에 서버 모듈(`server/agents/*`, `server/orchestrator.js`)과 Vercel 함수(`api/*`)를 더한다. 에이전트마다 코드 확인과 AI 일을 나누고, 총괄이 차례로 부른다. AI 호출은 `server/llm/`에만 두고 테스트에서는 가짜 함수로 바꿔 끼운다.

**Tech Stack:** Vite 5, 순수 JavaScript(ESM), Vercel 서버 함수(Node), Supabase(Postgres·Auth·Storage, `@supabase/supabase-js` v2), Gemini REST(글·이미지), Vitest(테스트).

**Spec:** `docs/superpowers/specs/2026-11-23-launch-agents-design.md`

## Global Constraints

- 브랜치 `HSJ-agents`에서만 커밋. 커밋 메시지 `[HSJ] 한 일`, 끝에 `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 화면 문구·코드 주석은 한국어 존댓말(지금 코드 말투).
- 의약품식 효능 표현 금지: 치료, 완치, 염증, 재생, 혈액순환, 아토피, 처방, 여드름 치료.
- 점수·가격·용량·라인 구성 숫자는 코드 값만 쓴다. AI 결과에는 코드가 숫자를 붙인다.
- API 키(`GEMINI_API_KEY`)는 서버에서만 읽는다. `VITE_` 접두어 금지.
- 서비스 키 쓰지 않음. 서버는 사용자 토큰으로 Supabase를 불러 RLS가 그대로 적용되게 한다.
- 모델 ID는 `server/llm/gemini.js`에만. 환경변수 `GEMINI_MODEL`, `GEMINI_IMAGE_MODEL`로 바꿀 수 있다.
- 요금제 횟수는 `server/limits.js`에만: 무료 평생 1건, 건당 이용권 1장당 1건, 월 구독 달마다 20건, 기획안 1건당 수정 5회, 이미지 다시 만들기 1건당 6회.
- 용기 샘플: `public/IMAGE/LOGO/cheonghyang-logo-02/application-examples/{toner,serum,cream,lotion-pump,mist}.png`. 이미지에는 로고·글자를 넣지 않는다.
- `vercel.json` `maxDuration` 300. Gemini 한 번 호출 제한 60초.

## Review Focus

- 이미지 3장이 동시에 끝날 때 서로의 결과를 덮어쓰지 않아야 한다 → 이미지 경로를 버전 JSON이 아니라 행 단위 표 `plan_images`에 저장한다(설계 9절에서 바꾼 점). Task 7 테스트로 고정.
- [기획안 만들기]를 두 번 누르거나 두 탭에서 동시에 눌러도 횟수가 한도를 넘지 않아야 한다 → 버튼 잠금 + 서버의 횟수 확인. Task 8 테스트.
- AI가 형식이 틀린 JSON을 주거나 시간이 넘으면 아무것도 저장하지 않고 502/504로 끝나야 한다. Task 6·8 테스트.
- 로그인 토큰이 만료된 상태로 누르면 401과 로그인 창이 떠야 한다. Task 8 테스트, Task 9 화면 확인.
- 금지어가 정상 단어 안에 들어 있는 경우(예: "재생 용기", "리필")를 잘못 거르지 않아야 한다 → 금지어는 구(phrase) 목록 + 예외 목록. Task 4 테스트.

---

## 1부: 기획안 만들기 + 저장

### Task 1: 후보 계산을 공용 모듈로 옮기기 + 테스트 환경

**Files:**
- Create: `src/core/candidates.js`, `src/config/assets.js`, `tests/candidates.test.js`, `vitest.config.js`
- Modify: `src/app.js` (21~135행의 계산 함수들을 core 호출로), `src/config/rules.js` (`SAMPLE_BASE`·`SAMPLE` 를 assets.js로 이동), `package.json` (`"test": "vitest run"`, devDependency `vitest`)

**Interfaces:**
- Produces:
  - `lineKey(l) => "원료|목적"`
  - `buildCandidates(data, season) => Line[]` — 지금 `candidates()`와 같은 결과(why·talk·persona 포함). `data`는 `{SEASONS, HERBS, DESIGN, HERB_TREND}`.
  - `evaluate(line, {season, trend, now}) => {l, parts, lo, hi, mid, evid}` — 지금 `evaluate()`와 같다. `now`는 숫자(ms)로 받아 `Date.now()`를 직접 쓰지 않는다.
  - `rankLines(data, season, now) => Evaluated[]` — mid 내림차순, 같으면 evid 내림차순.
  - `findLine(data, season, herb, purpose, now) => Evaluated | null` — 원료가 그 목적을 갖지 않으면 null.
  - `personaKw(k, l, a)`도 export(화면이 씀).
  - `Line.lineup`은 지금처럼 `[type, 이름, ml, 정가][]`.

- [ ] **Step 1:** `npm i -D vitest`, `vitest.config.js`(environment `node`, include `tests/**/*.test.js`), package.json `test` 스크립트 추가.
- [ ] **Step 2: 실패하는 테스트** `tests/candidates.test.js` (데이터는 `src/data/fallback.js`):
  - `buildCandidates(fallback, "봄").length === HERBS의 purposes 수 합`
  - `findLine(fallback, "여름", "어성초", "모공·피지", NOW).l.lineup.map(x => x[1])` 가 `["토너"]`
  - `findLine(fallback, "봄", "쑥", "탄력", NOW) === null`
  - `rankLines` 두 번 부르면 같은 순서(`lineKey` 목록 동일)
- [ ] **Step 3:** `npm test` → FAIL(모듈 없음).
- [ ] **Step 4:** 함수들을 `src/core/candidates.js`로 옮긴다. 이 파일은 `rules.js`, `utils/text.js`만 불러온다(`import.meta.env` 금지). `rules.js`의 `SAMPLE_BASE`·`SAMPLE`은 `src/config/assets.js`로 옮기고 app.js import를 고친다.
- [ ] **Step 5:** `npm test` PASS, `npm run build` 성공, `npm run dev`로 계절 선택 → 추천 3개·상세 창이 전과 같게 나오는지 브라우저로 확인.
- [ ] **Step 6:** 커밋 `[HSJ] 후보 계산을 src/core/candidates.js로 분리, vitest 추가`

### Task 2: 서버용 데이터 읽기

**Files:**
- Create: `src/data/shape.js`, `server/data.js`, `tests/data.test.js`
- Modify: `src/data/repository.js` (변환 함수를 shape.js에서 가져다 씀)

**Interfaces:**
- Produces:
  - `shape.js`: `toSeasons(seasons, issues)`, `toHerb(row)`, `toDesign(herbRows)` — 지금 repository.js 안의 것과 같은 결과.
  - `server/data.js`: `loadServerData(client | null) => Promise<{SEASONS, HERBS, DESIGN, HERB_TREND, COLOR_TRENDS, source}>`. `client`가 null이거나 조회에 실패하면 `fallback.js` 값(`COLOR_TRENDS: []`, `source: "fallback"`).
  - `latestPalette(data, season) => {name, colors: string[], source, as_of} | null` (같은 파일).

- [ ] **Step 1: 실패하는 테스트:** `loadServerData(null)` → `HERBS.length === fallback.HERBS.length`, `source === "fallback"`; 가짜 client(조회가 에러를 던짐) → fallback; `latestPalette({COLOR_TRENDS:[{season:"봄",as_of:"2026-10-01",...},{season:"봄",as_of:"2026-11-01",...}]}, "봄").as_of === "2026-11-01"`; 없는 계절 → null.
- [ ] **Step 2:** `npm test` FAIL 확인.
- [ ] **Step 3:** 구현. 서버 조회 쿼리는 repository.js의 `loadAppData`와 같은 테이블 + `color_trends`(Task 7에서 만듦. 표가 없으면 빈 배열).
- [ ] **Step 4:** `npm test` PASS, `npm run dev` 화면 그대로.
- [ ] **Step 5:** 커밋 `[HSJ] 서버용 데이터 읽기(server/data.js) 추가`

### Task 3: AI 호출 (Gemini JSON, Gemini 이미지)

> **2026-11-24 변경:** 이미지 생성도 OpenAI 대신 **Gemini 이미지 모델**로 바꿨어요(글·이미지 모두 `GEMINI_API_KEY` 하나). `server/llm/openai.js`는 지웠고 `editImage`는 `server/llm/gemini.js`에 있어요. Gemini 이미지 모델은 무료 플랜 한도가 0이라, Google AI Studio에서 결제(Billing)를 켜야 이미지가 만들어져요.

아래는 처음 구현할 때(OpenAI 이미지)의 계획이에요. 지금 코드는 위 변경을 따라요.

**Files:**
- Create: `server/llm/openai.js`, `tests/llm.test.js`
- Modify: `server/gemini.js` → `server/llm/gemini.js`로 옮기고 import 경로 수정(`api/chat.js`, `vite.config.js`)

**Interfaces:**
- Produces:
  - `class LlmError extends Error { status }` (gemini.js에서 export, openai.js도 사용)
  - `generateJson(prompt, schema, {apiKey, model}?) => Promise<object>` — `generationConfig: {responseMimeType: "application/json", responseSchema, temperature: 0.4, thinkingConfig: {thinkingLevel: "low"}}`, 503이면 기존처럼 한 번 재시도 후 FALLBACK 모델, 한 번 호출 60초. 실패 시 `LlmError`(연결 502, 시간초과 504, 해석 실패 502).
  - 타입 이름: `GenerateJson = (prompt, schema) => Promise<object>` (JSDoc).
  - `editImage({prompt, images: {name, bytes: Uint8Array}[], size?: "1024x1024"}, {apiKey, model}?) => Promise<Uint8Array>` — `POST https://api.openai.com/v1/images/edits`, multipart `image[]` 반복, `model`, `prompt`, `size`, `n=1`. 응답 `data[0].b64_json` 디코드. `response_format`은 보내지 않는다. 120초 제한.
  - 타입 이름: `EditImage`.
  - 기본 이미지 모델 ID: 구현할 때 https://developers.openai.com/api/docs/guides/image-generation 에서 편집을 지원하는 현재 gpt-image 모델을 확인해 상수 `DEFAULT_IMAGE_MODEL`로 적는다.

- [ ] **Step 1: 실패하는 테스트** (`globalThis.fetch`를 vi.fn으로 바꿈): Gemini 응답 `candidates[0].content.parts[0].text = '{"a":1}'` → `{a:1}`; 텍스트가 JSON이 아니면 `LlmError`; 키 없으면 `LlmError`. OpenAI: `b64_json` → 바이트 길이 일치; 요청 body가 `FormData`이고 `image[]` 두 개; HTTP 400 → `LlmError`(메시지에 상태 포함).
- [ ] **Step 2:** FAIL 확인 → **Step 3:** 구현 → **Step 4:** PASS, 채팅이 개발 서버에서 여전히 답하는지 확인.
- [ ] **Step 5:** `.env.example`에 `OPENAI_API_KEY`, `OPENAI_IMAGE_MODEL`(선택) 설명 추가. 커밋 `[HSJ] Gemini JSON 응답·OpenAI 이미지 편집 호출 추가`

### Task 4: 검증 에이전트 (코드 규칙 + AI 검토)

**Files:**
- Create: `server/agents/verifier.js`, `server/agents/prompt.js`, `tests/verifier.test.js`
- Modify: `src/config/rules.js` (`BANNED_PHRASES`, `BANNED_EXCEPTIONS` 추가)

**Interfaces:**
- Consumes: Task 1 `Evaluated`(후보), Task 2 data.
- Produces:
  - `prompt.js`: `STRING`, `STRINGS`, `isStringArray`, `describeLine(cand, season, data) => string` (원료·한자·목적·쓸 수 있는 말·산지 메모·경쟁 메모·제품 목록·기능성 여부를 프롬프트용 글로).
  - `textOf(content) => string` — 기획안·시나리오의 모든 글을 이어 붙임.
  - `checkRules(content, cand, data) => {fix: string[], notes: string[]}` — `fix`는 재작성 대상(빈 배열이면 통과), `notes`는 의견으로만 남김. 규칙(1~6은 fix, 7은 notes):
    1. `BANNED_PHRASES` 중 하나라도 있으면(단 `BANNED_EXCEPTIONS`에 해당하는 위치 제외) `금지 표현 "X"을 빼 주세요.`
    2. 글 속 `/\d[\d,]*\s*(원|ml|mL)/` 숫자가 후보 lineup의 ml·정가에 없으면 `후보에 없는 가격·용량 "X"이 있어요.`
    3. `%` 숫자는 후보 원료의 `gb`·`rival` 등 메모 글에 있으면 허용, 없으면 고칠 점.
    4. 다른 원료 이름(data.HERBS의 herb, 후보 원료 제외)이 있으면 `후보에 없는 원료 "X"을 언급했어요.`
    5. `content.plan.products`의 이름 목록이 후보 lineup 이름(+extra)과 다르면 고칠 점.
    6. 후보가 `미백(톤)`이면 `content.plan.cautions` 중 하나에 "기능성"이 있어야 한다.
    7. 후보 정가 ml당 가격이 `PRICE_RANGE[type]` 밖이면 `가격 범위 밖: 토너 ml당 X원`.
  - `stripBanned(text) => string` — 시나리오 문구용, 금지 표현이 든 문장을 뺀다.
  - `REVIEW_SCHEMA` `{approved: BOOLEAN, issues: STRINGS}`, `buildReviewPrompt(content, cand, season, data)`, `cleanReview(raw) => {approved, issues}` (issues 최대 5, approved가 false가 아니면 true).

- [ ] **Step 1: 실패하는 테스트** (`fixtures`: fallback의 여름·어성초·모공·피지 후보와 그에 맞는 정상 content):
  - 정상 content → `fix: []`
  - concept에 "염증 완화" → fix에 `금지 표현 "염증"` 포함
  - "재생 용기 사용" → 예외라 fix 없음
  - "토너 150ml 9,900원" → 후보에 없는 가격·용량 2건
  - "경북 48.1%" (어성초 gb 메모에 있음) → 통과, "흡수율 87%" → 고칠 점
  - "인삼 추출물" 언급 → 후보에 없는 원료
  - products에서 토너를 빼면 → 고칠 점
  - 미백(톤) 후보에 cautions에 "기능성" 없음 → 고칠 점
  - `cleanReview({approved:false, issues:["a","", "b"]})` → `{approved:false, issues:["a","b"]}`
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS
- [ ] **Step 5:** 커밋 `[HSJ] 검증 에이전트 규칙·검토 프롬프트 추가`

### Task 5: 후보 생성·작성·디자인 에이전트

**Files:**
- Create: `server/agents/research.js`, `server/agents/writer.js`, `server/agents/designer.js`, `tests/agents.test.js`

**Interfaces:**
- Consumes: Task 4 `prompt.js`, `stripBanned`.
- Produces:
  - research: `class InvalidCandidateError extends Error`, `pickCandidate(data, {season, herb, purpose}, now) => Evaluated` (없으면 throw), `RESEARCH_SCHEMA {notes: STRINGS}`, `buildResearchPrompt(cand, season, data)`, `cleanNotes(raw) => string[]` (최대 5).
  - writer: `PLAN_SCHEMA {concept_name, concept, target, key_claims: STRINGS, product_roles: [{name, role}], cautions: STRINGS}`, `buildPlanPrompt(cand, season, data, notes, revise?: {previous, issues})`, `assemblePlan(raw, cand, notes) => Plan`.
    - `Plan = {concept_name, concept, target, key_claims[3], products: [{type, name, ml|null, price|null, role, status: "1차"|"준비 중"}], notes, cautions, review_notes: []}` — products의 type·name·ml·price는 **cand.lineup(+extra)에서 코드가 채우고**, role만 AI 값(이름이 맞는 것). extra는 `status: "준비 중"`, ml·price null.
    - 형식이 틀리면 `PlanFormatError`.
  - designer: `SCENARIO_SCHEMA {scenarios: [{title, concept, target, channel, cuts: [{scene, copy}], image_prompt}]}`, `buildScenarioPrompt(plan, cand, season, data, palette)`, `assembleScenarios(raw) => {scenarios: Scenario[], notes: string[]}` — 정확히 3개(넘치면 자르고 모자라면 `PlanFormatError`), cuts 3~4개, 각 copy·scene에 `stripBanned` 적용하고 뺀 게 있으면 notes에 남김.
  - designer: `buildImagePrompt(scenario, cand, data, palette) => string` — 장면 + "용기에 로고·글자·브랜드명 없음" + 원료 색(`DESIGN[herb].main/cap/liquid`) + palette 색(없으면 생략) 포함.
  - designer: `sampleFilesFor(cand) => string[]` — lineup type → `SAMPLE` 파일명(중복 제거, extra 제외).

- [ ] **Step 1: 실패하는 테스트:** `pickCandidate` 없는 조합 → `InvalidCandidateError`; `assemblePlan`이 AI가 준 가격을 무시하고 lineup 값을 쓴다; 민감·장벽 후보의 products 마지막이 `{name:"클렌저", status:"준비 중", price:null}`; `assembleScenarios` 4개 → 3개, 2개 → throw; copy "염증 완화 미스트" → 그 문장이 빠지고 notes 1건; `buildImagePrompt`에 `#` 색 코드와 "로고" 금지 문구가 들어 있다; palette null이면 "트렌드" 색 줄이 없다; `sampleFilesFor`(토너·젤 크림·미스트 후보) → `["toner.png","cream.png","mist.png"]`.
- [ ] **Step 2:** FAIL → **Step 3:** 구현(프롬프트 문장은 구현자 몫, 규칙: 출처에 없는 수치 금지·금지 표현 금지·숫자 쓰지 말 것·원료 후보 밖 원료 금지) → **Step 4:** PASS
- [ ] **Step 5:** 커밋 `[HSJ] 후보 생성·작성·디자인 에이전트 추가`

### Task 6: 총괄 (오케스트레이터)

**Files:**
- Create: `server/orchestrator.js`, `tests/orchestrator.test.js`

**Interfaces:**
- Consumes: Task 4·5 전부, Task 2 `latestPalette`.
- Produces:
  - `MAX_REVISIONS = 1`
  - `runPlanPipeline({data, season, herb, purpose, generate, now}) => Promise<{content, log}>`
    - `content = {season, herb, purpose, candidate: {name, lineup, extra, functional, mid, evid}, plan: Plan, scenarios: Scenario[], palette, review: {approved, issues, rounds}}`
    - 순서: pickCandidate → research(AI) → write(AI) → [checkRules.fix + AI review → 통과 아니면 revise 1회] → designer(AI) → checkRules를 시나리오에도 적용해 notes 추가.
    - 재작성 뒤에도 남은 의견은 `plan.review_notes`에 넣고 저장은 계속한다.
    - `log`: `{step, agent, ok, note}[]` (화면에 보이지 않음, 버전에 함께 저장).
  - `verifyContent(content, cand, data, generate) => Promise<{approved, issues, notes}>` — 코드 규칙 + AI 검토 합침. Task 11의 적용에서도 씀.

- [ ] **Step 1: 실패하는 테스트** (가짜 `generate`가 schema별로 정해진 응답을 큐에서 꺼냄, 호출 기록 저장):
  - 정상: 호출 순서 `RESEARCH → PLAN → REVIEW → SCENARIO`, `review.rounds === 1`
  - 첫 REVIEW가 `approved:false` → PLAN 한 번 더 → 두 번째 REVIEW 통과 → rounds 2
  - 두 번 다 거절 → PLAN 2번만 부르고 `plan.review_notes.length > 0`, 예외 없음
  - 작성 결과에 금지어 → AI 검토가 통과해도 재작성된다
  - `generate`가 `LlmError` → 그대로 throw
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS
- [ ] **Step 5:** 커밋 `[HSJ] 총괄 에이전트(runPlanPipeline) 추가`

### Task 7: 스키마 · 저장 · 사용 제한

**Files:**
- Modify: `supabase/schema.sql`
- Create: `server/store.js`, `server/limits.js`, `tests/limits.test.js`, `tests/store.test.js`

**Interfaces:**
- 스키마 (모두 `if not exists`, RLS on):
  - `plans(id uuid pk default gen_random_uuid(), user_id uuid not null default auth.uid() references auth.users on delete cascade, season text, herb text, purpose text, title text, image_regens int not null default 0, created_at, updated_at)` — 본인 select/insert/update/delete.
  - `plan_versions(id uuid pk, plan_id uuid references plans on delete cascade, version_no int, content jsonb, source text check in ('generate','edit'), edit_request text, created_at, unique(plan_id, version_no))` — 정책: 부모 plan의 user_id = auth.uid() 일 때 select/insert.
  - `plan_images(version_id uuid references plan_versions on delete cascade, idx int check 0..2, path text, created_at, primary key(version_id, idx))` — 같은 방식, upsert 허용.
  - `entitlements(id uuid pk, user_id uuid, kind text check in ('single','monthly'), remaining int null, period_start date null, period_end date null, created_at)` — 본인 select만.
  - `color_trends(id uuid pk, season text, name text, colors text[], source text, url text, as_of date)` — anon·authenticated select.
  - Storage 버킷 `plan-images`(private) + `storage.objects` 정책: `bucket_id='plan-images' and (storage.foldername(name))[1] = auth.uid()::text` 인 select/insert/update.
- Produces:
  - `store.js`: `userClient(token)`, `getUser(client) => {id} | null`, `createPlan(client, {season, herb, purpose, title, content, log}) => {plan_id, version_no: 1}` (plans insert → versions insert), `getVersion(client, planId, versionNo?) => {id, version_no, content, images: {idx, path}[]} | null` (없으면 최신), `insertVersion(client, planId, baseNo, {content, source, edit_request, copyImagesFrom?}) => {version_no}` (baseNo가 최신이 아니거나 unique 위반 → `ConflictError`), `saveImage(client, userId, planId, versionId, idx, bytes) => path` (업로드 + plan_images upsert), `signedUrls(client, paths) => Record<path,url>`, `listPlans(client)`, `bumpImageRegens(client, planId) => number`.
  - `limits.js`: `LIMITS = {free: 1, single: 1, monthly: 20, editsPerPlan: 5, imageRegensPerPlan: 6}`, `canCreate(usage, entitlements, now) => {ok, reason?}` (usage = `{totalPlans, plansThisMonth}`), `canEdit(editCount)`, `canRegenImage(count)`, `class LimitError extends Error { status = 402 }`.
  - `store.js`도 `usage(client, now)`와 `editCount(client, planId)` 제공.

- [ ] **Step 1: 실패하는 테스트** `limits.test.js`: 이용권 없음·0건 → ok; 이용권 없음·1건 → 아님; single remaining 1 → ok(무료 1건 사용 뒤에도); monthly 기간 안·이번 달 19건 → ok, 20건 → 아님; 기간 밖 monthly → 무료 규칙; `canEdit(5)` 아님, `canRegenImage(6)` 아님.
  - 이용권 차감 규칙: single은 `remaining - (totalPlans - 1)`이 0보다 크면 ok (무료 1건 먼저 소진). 단순하게 "사용 가능 총량 = 1 + sum(single.remaining)" 으로 계산.
- [ ] **Step 2: 실패하는 테스트** `store.test.js` (가짜 supabase client): `insertVersion`이 unique 위반 에러 코드 `23505`면 `ConflictError`; `saveImage` 두 번(idx 0, 1) 동시 호출 → plan_images upsert 2회, 서로 다른 idx.
- [ ] **Step 3:** FAIL → **Step 4:** 구현 → **Step 5:** PASS. `supabase/schema.sql`은 Supabase SQL Editor에서 실행해 오류가 없는지 확인(사용자에게 실행 요청, 결과를 받아 기록).
- [ ] **Step 6:** 커밋 `[HSJ] 기획안 저장 스키마·저장소·요금제 횟수 제한 추가`

### Task 8: API `/api/plan`, `/api/plan-image` + 개발 서버 연결

**Files:**
- Create: `server/http.js`, `server/routes/plan.js`, `server/routes/plan-image.js`, `api/plan.js`, `api/plan-image.js`, `tests/routes.test.js`
- Modify: `vite.config.js` (route 표로 일반화), `vercel.json`

**Interfaces:**
- Consumes: Task 2·3·5·6·7.
- Produces:
  - `http.js`: `class HttpError(status, message)`, `bearer(req) => token|null`, `toVercel(route)`, `toVite(route)` — route는 `async (body, ctx) => object`, `ctx = {token, env, deps}`. `deps`로 `generate`, `editImage`, `store`, `loadData`, `readSample`, `now`를 바꿔 끼울 수 있다(테스트용).
  - `routes/plan.js`: body `{season, herb, purpose}` → 토큰 없음/잘못 401 → `canCreate` 아니면 402 → `runPlanPipeline` → `createPlan` → `{plan_id, version_no}`. `InvalidCandidateError` 400, `LlmError` 그 status, `PlanFormatError` 502.
  - `routes/plan-image.js`: body `{plan_id, version_no, idx, regenerate?: boolean}` → 401/404 → regenerate면 `canRegenImage` 확인 후 `bumpImageRegens` → `buildImagePrompt` + `sampleFilesFor`를 `readSample(name) => Uint8Array`로 읽어 `editImage` → `saveImage` → `{idx, url}`(서명 URL).
  - `vercel.json`: 함수 `api/*.js` `maxDuration: 300`, `api/plan-image.js`에 `includeFiles: "public/IMAGE/LOGO/cheonghyang-logo-02/application-examples/*.png"`.

- [ ] **Step 1: 실패하는 테스트** (가짜 deps): 토큰 없음 → 401; 무료 1건 사용한 사용자 → 402, `generate`가 한 번도 안 불림; 정상 → `createPlan` 1번 호출, 응답에 plan_id; `generate`가 LlmError(504) → 504, `createPlan` 안 불림; 같은 사용자 동시 2건(usage가 0인 상태에서 두 요청) → 두 번째 `createPlan` 직전에 usage를 다시 세어 402 (createPlan 직전 재확인으로 막는다); plan-image 정상 → `editImage`의 images 이름이 후보 샘플 파일, `saveImage` idx 일치; 남의 plan → 404.
- [ ] **Step 2:** FAIL → **Step 3:** 구현 → **Step 4:** PASS
- [ ] **Step 5:** `npm run dev` + 실제 키로 `/api/plan` 한 번 호출(curl, 로그인 토큰은 브라우저 세션에서) → Supabase에 plans·plan_versions 행 확인, `/api/plan-image` 한 장 → Storage에 파일 확인.
- [ ] **Step 6:** 커밋 `[HSJ] 기획안 생성·이미지 생성 API 추가`

### Task 9: 화면 1부 — [기획안 만들기], 대기 화면, 요금제 문구

**Files:**
- Create: `src/plan/api.js`, `src/plan/create.js`, `src/plan/plan.css`
- Modify: `index.html` (상세 창 버튼, 대기 화면, 요금제 "월 구독 (20건, 초과 건당 ₩4,900)"), `src/app.js` (상세 창 열 때 현재 후보 전달), `src/main.js`, `src/auth/auth.js` (로그인 창 여는 함수 export: `openAuthDialog()`)

**Interfaces:**
- Produces:
  - `api.js`: `callApi(path, body) => Promise<object>` — 세션 토큰을 `Authorization`에 넣고, 401이면 `openAuthDialog()` 후 `AuthRequired` throw, 402면 요금제 안내 문구 throw.
  - `create.js`: `initCreate({getCurrentLine})` — 버튼 클릭 → 잠금 → 대기 화면("기획안을 만들고 있어요. 1~3분 걸려요") → `/api/plan` → 이미지 3장 `Promise.allSettled`로 `/api/plan-image` → 마이 기획실로 이동해 `openPlan(plan_id)`(Task 10, 그 전에는 결과 JSON을 대기 화면에 임시 표시).

- [ ] **Step 1:** 구현.
- [ ] **Step 2:** 브라우저 확인(개발 서버): 로그아웃 상태 클릭 → 로그인 창; 로그인 후 클릭 → 대기 화면 → 완료; 버튼 두 번 눌러도 요청 1번(네트워크 탭); 요금제 화면 문구 20건; 모바일 폭(375px) 대기 화면 깨짐 없음.
- [ ] **Step 3:** 커밋 `[HSJ] 출시 기획실에 기획안 만들기·대기 화면 추가, 요금제 월 20건 반영`

## 2부: 마이 기획실 + 챗봇 수정

### Task 10: 마이 기획실 목록·보기

**Files:**
- Create: `src/plan/my.js`, `server/routes/plan-get.js`, `api/plan-get.js`
- Modify: `index.html` (`#view-my` 채우기), `src/plan/plan.css`

**Interfaces:**
- Produces:
  - `routes/plan-get.js`: body `{plan_id?, version_no?}` → plan_id 없으면 `{plans: listPlans}` (최신 버전 번호·수정일 포함), 있으면 `{version, versions: number[], image_urls: string[3]}`.
  - `my.js`: `initMy()`, `openPlan(planId, versionNo?)` — 목록(계절·원료·최신 버전·수정일) → 보기(버전 선택, 기획안: 콘셉트·타깃·핵심 문구·제품표(코드 값)·근거·주의사항·검토 의견, 시나리오 3개: 채널·컷·카피·이미지(실패 칸은 [다시 만들기] → `/api/plan-image` regenerate)).
- [ ] **Step 1:** 라우트 테스트(`tests/routes.test.js`에 추가): 남의 plan → 404, 목록은 본인 것만(가짜 store가 받은 client 확인).
- [ ] **Step 2:** FAIL → 구현 → PASS. **Step 3:** 브라우저: 생성 후 자동 이동, 버전 선택, 이미지 표시, 실패 칸 다시 만들기.
- [ ] **Step 4:** 커밋 `[HSJ] 마이 기획실 목록·기획안 보기 추가`

### Task 11: 수정 에이전트 + `/api/plan-edit/preview`, `/apply`

**Files:**
- Create: `server/agents/editor.js`, `server/routes/plan-edit.js`, `api/plan-edit/preview.js`, `api/plan-edit/apply.js`, `tests/editor.test.js`

**Interfaces:**
- Consumes: Task 6 `verifyContent`, Task 7 store·limits, Task 5 `assemblePlan`·`assembleScenarios`.
- Produces:
  - `EDIT_SCHEMA {reply: STRING, proposal: {summary: STRING, changes: [{part, before, after}], plan?: PLAN_SCHEMA 내용, scenarios?: SCENARIO_SCHEMA 내용, regenerate_images: [INTEGER]} | null}`
  - `buildEditPrompt(content, messages, cand, data)`, `cleanProposal(raw, content, cand) => Proposal | null` — plan/scenarios가 오면 Task 5 assemble로 숫자를 코드 값으로 다시 채운다. 이미지 다시 만들기는 사용자가 이미지 변경을 말했을 때만(프롬프트 규칙) + idx 0~2만 남김.
  - preview: `{plan_id, base_version_no, messages}` → `{reply, proposal}` (저장 안 함, 횟수 안 셈).
  - apply: `{plan_id, base_version_no, proposal}` → `canEdit` 아니면 402 → 새 content 조립 → `verifyContent` 실패 → 422 `{issues}` (저장 안 함) → `insertVersion(source:"edit", edit_request: proposal.summary, copyImagesFrom: regenerate에 없는 idx)` → `{version_no, regenerate_images}` (화면이 그 idx만 `/api/plan-image` 호출). base가 최신 아님 → 409.
- [ ] **Step 1: 실패하는 테스트:** apply 금지어 들어간 proposal → 422, `insertVersion` 안 불림; 정상 → 새 버전, 이미지 복사 idx = regenerate에 없는 것; 수정 5회 쓴 기획안 → 402; base_version_no 오래됨 → 409; cleanProposal이 AI가 바꾼 가격을 코드 값으로 되돌림.
- [ ] **Step 2:** FAIL → 구현 → PASS
- [ ] **Step 3:** 커밋 `[HSJ] 수정 에이전트·미리보기/적용 API 추가`

### Task 12: 챗봇을 마이 기획실로 옮기기

**Files:**
- Modify: `src/chat/chat.js` (팝업 → 마이 기획실 보기 화면 오른쪽 패널, `/api/plan-edit/preview` 사용, 미리보기 카드 + [적용]), `src/chat/chat.css`, `src/main.js` (`initChat` 제거, my.js가 패널 생성), `index.html` (헤더 AI Chat 버튼 삭제)
- Delete: `api/chat.js`, `vite.config.js`의 `/api/chat` 연결, `server/llm/gemini.js`의 `chatWithGemini`(다른 곳에서 안 쓰면)

**Interfaces:**
- Consumes: Task 10 `openPlan`, Task 11 API.
- Produces: `mountEditChat(container, {planId, getVersionNo, onApplied(versionNo, regenerate)})`.
- [ ] **Step 1:** 구현. 미리보기 카드: summary + changes 목록(무엇을 → 어떻게) + [적용]·[취소]. 422면 이유를 챗봇 말풍선으로 보여 주고 "고친 안을 다시 제안할까요?" 입력을 채워 둔다. 409면 "다른 곳에서 먼저 수정됐어요. 최신 버전을 불러올게요" 후 다시 열기.
- [ ] **Step 2:** 브라우저 확인: 헤더에 AI Chat 없음; 수정 요청 → 미리보기 → 적용 → v2 표시; 이미지 변경 요청 시에만 이미지 새로 생성; 금지어 유도 요청("염증 완화 넣어 줘") → 적용 거절 메시지.
- [ ] **Step 3:** 커밋 `[HSJ] AI 챗봇을 마이 기획실 수정용으로 이동, 헤더 챗봇 삭제`

### Task 13: 마무리

**Files:**
- Modify: `README.md` (구조·환경변수·Supabase 실행 순서·`npm test`)

- [ ] **Step 1:** `npm test` 전체 PASS, `npm run build` 성공.
- [ ] **Step 2:** 개발 서버로 처음부터 끝까지: 로그인 → 계절 → 후보 → 기획안 만들기 → 마이 기획실 → 수정 → v2.
- [ ] **Step 3:** 커밋 `[HSJ] README에 에이전트 구조·실행 방법 추가`. push와 PR은 사용자에게 묻고 한다.
