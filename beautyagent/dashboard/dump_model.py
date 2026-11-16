# -*- coding: utf-8 -*-
"""엑셀 모델을 시트별 md로 풀어 둔다 (에이전트가 엑셀을 매번 새로 해석하지 않도록 하는 읽기 전용 캐시).
사용: python beautyagent/dashboard/dump_model.py <xlsx> <출력 폴더>
칸마다 주소 · 수식 · 값을 한 줄로 적는다. 원본 엑셀은 저장하지 않는다."""
import datetime
import os
import sys

from openpyxl import load_workbook

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
wf = load_workbook(src)                 # 수식
wv = load_workbook(src, data_only=True)  # Excel이 저장한 값
mtime = datetime.datetime.fromtimestamp(os.path.getmtime(src)).isoformat(timespec="seconds")


def fmt(v):
    if v is None:
        return ""
    s = str(v).replace("|", "\\|").replace("\n", " ")
    return s if len(s) <= 200 else s[:200] + "…"


index = [f"# 엑셀 덤프 목록\n\n- 원본: `{src}` (저장 시각 {mtime})",
         "- 읽기 전용 캐시예요. 숫자를 바꾸려면 원본 엑셀을 model-simulator가 수정하고, 다시 덤프해요.",
         "- 값 칸이 비어 있고 수식만 있으면 Excel에서 다시 계산·저장이 필요한 상태예요.\n",
         "| 시트 | 사용 범위 | 칸 수 | 파일 |", "|---|---|---|---|"]
for ws in wf.worksheets:
    v = wv[ws.title]
    rows = [f"# 시트: {ws.title}\n", f"- 원본: `{src}` · 저장 시각 {mtime} · 사용 범위 {ws.dimensions}\n",
            "| 칸 | 수식 | 값 |", "|---|---|---|"]
    n = 0
    for row in ws.iter_rows():
        for c in row:
            if c.value is None:
                continue
            f = c.value if isinstance(c.value, str) and c.value.startswith("=") else ""
            val = v[c.coordinate].value
            rows.append(f"| {c.coordinate} | {fmt(f)} | {fmt(val if f else c.value)} |")
            n += 1
    name = f"{ws.title}.md"
    with open(os.path.join(out, name), "w", encoding="utf-8") as fh:
        fh.write("\n".join(rows) + "\n")
    index.append(f"| {ws.title} | {ws.dimensions} | {n} | `{name}` |")
with open(os.path.join(out, "_index.md"), "w", encoding="utf-8") as fh:
    fh.write("\n".join(index) + "\n")
print(f"dumped {len(wf.worksheets)} sheets → {out}")
