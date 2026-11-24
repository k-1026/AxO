/* 화면 전용 자원 주소 (Vite의 import.meta.env를 쓰므로 서버 코드는 불러오지 않아요) */
/* 용기 샘플 주소 앞부분 · 파일 이름은 config/rules.js의 SAMPLE */
/* 로딩 캐릭터 두 장면 (원료 짜기 ↔ 제품 소개). 대기 창(index.html)과 마이 기획실 불러오기 화면이 같이 써요 */
export const LOADING_IMAGES = ["loading-1.webp", "loading-2.webp"].map(n => `${import.meta.env.BASE_URL}IMAGE/LOADING/${n}`);
export const SAMPLE_BASE = `${import.meta.env.BASE_URL}IMAGE/LOGO/cheonghyang-logo-02/application-examples/`;
