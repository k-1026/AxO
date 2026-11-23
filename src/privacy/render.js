/* 개인정보 처리방침 화면을 데이터(src/data/privacy.js)로 그려요. */
import { esc } from "../utils/text.js";

/* 텍스트 조각: 문자열 | { b } 굵게 | { a, href } 링크 | 배열(여러 조각) | 함수(meta → 문자열) */
function inline(part, meta) {
  if (part == null) return "";
  if (typeof part === "function") return inline(part(meta), meta);
  if (Array.isArray(part)) return part.map(p => inline(p, meta)).join("");
  if (typeof part === "object") {
    if (part.b != null) return `<strong>${esc(part.b)}</strong>`;
    if (part.a != null) return `<a href="${esc(part.href)}" target="_blank" rel="noopener">${esc(part.a)}</a>`;
    return "";
  }
  return esc(part);
}

/* 표 칸: 문자열 배열이면 줄바꿈으로 이어요 (조각 배열과 구분하려고 모두 문자열일 때만) */
function cell(value, meta) {
  if (Array.isArray(value) && value.every(v => typeof v === "string")) return value.map(esc).join("<br>");
  return inline(value, meta);
}

function block(b, meta) {
  switch (b.type) {
    case "p": return `<p>${inline(b.text, meta)}</p>`;
    case "note": return `<p class="note">${inline(b.text, meta)}</p>`;
    case "ul": return `<ul>${b.items.map(it => `<li>${inline(it, meta)}</li>`).join("")}</ul>`;
    case "table":
      return `<div class="table-scroll"><table>
        <thead><tr>${b.head.map(h => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead>
        <tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${cell(c, meta)}</td>`).join("")}</tr>`).join("")}</tbody>
      </table></div>`;
    default: return "";
  }
}

export function renderPrivacy(root, meta, sections) {
  root.innerHTML = `
    <h1>${esc(meta.service)} 개인정보 처리방침</h1>
    <ul class="meta">
      <li>적용 서비스: <a href="${esc(meta.serviceUrl)}">${esc(meta.serviceLabel)}</a></li>
      <li>운영 주체: ${esc(meta.operator)}</li>
      <li>시행일: ${esc(meta.effectiveDate)}</li>
    </ul>
    ${sections.map(s => `<section><h2>${esc(s.title)}</h2>${s.blocks.map(b => block(b, meta)).join("")}</section>`).join("")}`;
  document.title = `개인정보 처리방침 · ${meta.service}`;
}
