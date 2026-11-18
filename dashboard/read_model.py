# -*- coding: utf-8 -*-
"""대시보드용: 엑셀 모델의 핵심 결과를 칸 주소와 함께 JSON으로 출력 (읽기만 함, 저장하지 않음).
사용: python dashboard/read_model.py idea/market_model_case_AxO.xlsx"""
import json
import sys

from openpyxl import load_workbook

path = sys.argv[1]
wb = load_workbook(path, data_only=True, read_only=True)
SC = ["보수", "기준", "낙관"]


def find_rows(ws, labels, col_from=2, n=3):
    """A열 이름표로 행을 찾아 B~D 값을 칸 주소와 함께 돌려줌"""
    out = {}
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row):
        a = row[0].value
        if isinstance(a, str) and a.strip() in labels:
            r = row[0].row
            cells = row[col_from - 1:col_from - 1 + n]
            out[labels[a.strip()]] = {
                "cell": f"{ws.title}!{cells[0].coordinate}:{cells[-1].coordinate}",
                "label": a.strip(),
                "values": {SC[i]: (c.value if isinstance(c.value, (int, float)) else (None if c.value is None else str(c.value))) for i, c in enumerate(cells)},
            }
    return out


res = {"file": path, "metrics": {}, "sensitivity": [], "missing": []}
if "손익" in wb.sheetnames:
    res["metrics"] = find_rows(wb["손익"], {
        "월 영업손익": "op",
        "월 매출 (소비자가, 부가세 포함)": "gross",
        "손익분기 월 판매 수량": "bep",
        "월 판매 수량": "qty",
        "지금 판매 ÷ 손익분기 판매": "ratio",
        "초기 투자 회수 개월": "payback",
    })
else:
    res["missing"].append("손익 시트")
if "민감도" in wb.sheetnames:
    ws = wb["민감도"]
    start = None
    for row in ws.iter_rows(min_row=1, max_row=ws.max_row):
        if row[0].value == "가정" and row[1].value and "−20%" in str(row[1].value):
            start = row[0].row + 1
            continue
        if start and row[0].row >= start and row[0].value:
            v = [c.value for c in row[:5]]
            if isinstance(v[3], (int, float)):
                res["sensitivity"].append({"name": v[0], "minus": v[1], "plus": v[2], "range": v[3], "rank": v[4], "cell": f"민감도!A{row[0].row}:E{row[0].row}"})
# 값이 비어 있으면 Excel에서 다시 계산·저장이 필요한 상태
op = res["metrics"].get("op")
res["needs_recalc"] = bool(op) and all(v is None for v in op["values"].values())
print(json.dumps(res, ensure_ascii=False))
