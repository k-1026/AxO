"""용기 샘플 사진에서 브랜드 로고(청향 글자 · CHAHAR 원형 마크)를 지운 <이름>-nologo.png 를 만들어요.

샘플 사진은 디자인 참고용이라 로고가 들어 있어요. 기획안 화면의 제품 이미지와 AI 광고 이미지 참고 사진에는
로고 없는 사진을 써야 해서, 로고 자리(LOGOS)만 주변 용기 색으로 메워요.
  1) 로고 영역을 가장자리 색으로 부드럽게 채운 '바탕 추정'을 만들고
  2) 원본과 바탕 추정이 크게 다른 픽셀(= 글자·마크)만 골라
  3) 그 픽셀만 주변에서 번져 오게(확산) 메워요. 용기의 빛 반사·그라데이션은 그대로 남아요.
결과: public/IMAGE/LOGO/cheonghyang-logo-02/application-examples/<이름>-nologo.png (원본 크기 그대로)
실행: python scripts/remove-logos.py            (전부)
      python scripts/remove-logos.py cream eye   (일부)
그다음 python scripts/make-cutouts.py 로 화면용 누끼를 다시 만들어요.
"""
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

DIR = Path(__file__).resolve().parent.parent / "public/IMAGE/LOGO/cheonghyang-logo-02/application-examples"

# 로고가 있는 영역 (x0, y0, x1, y1) · 1536×1024 원본 기준. 왼쪽 전체 사진과 오른쪽 상세 사진 모두 적어요.
LOGOS = {
    "toner":       [(372, 440, 558, 562)],
    "serum":       [(388, 528, 552, 650)],
    "cream":       [(418, 552, 602, 678), (1128, 603, 1262, 697)],
    "lotion-pump": [(368, 638, 527, 750)],
    "mist":        [(328, 458, 517, 607)],
    "cleanser":    [(352, 390, 563, 598)],
    "eye":         [(306, 340, 442, 475), (1036, 345, 1200, 500)],
    "pad":         [(386, 478, 600, 692), (1058, 605, 1202, 748)],
    "mask":        [(324, 338, 577, 593), (1020, 545, 1246, 772)],
}
# 가운데로 세로 대롱(스포이트·빨대)이 지나가는 용기는 위아래 색으로만 메워서 대롱을 살려요
VERTICAL = {"serum", "mist"}
THRESHOLD = 14   # 바탕 추정과 이만큼(0~255) 넘게 다르면 글자·마크로 봐요
GROW = 4         # 글자 둘레 번짐까지 지우려고 고른 픽셀을 이만큼 넓혀요
ITER = 1500      # 확산 횟수


def edge_fill(block: np.ndarray) -> np.ndarray:
    """영역 테두리 색으로 안쪽을 채운 바탕 추정 (가로·세로 선형 보간의 평균)"""
    h, w, _ = block.shape
    left, right = block[:, :1], block[:, -1:]
    top, bottom = block[:1], block[-1:]
    tx = np.linspace(0, 1, w)[None, :, None]
    ty = np.linspace(0, 1, h)[:, None, None]
    horiz = left * (1 - tx) + right * tx
    vert = top * (1 - ty) + bottom * ty
    return (horiz + vert) / 2


def diffuse(block: np.ndarray, mask: np.ndarray, iters: int = ITER) -> np.ndarray:
    """mask 인 픽셀만 이웃 평균으로 반복해서 메워요 (테두리·마스크 밖 픽셀은 고정)"""
    out = block.copy()
    out[mask] = edge_fill(block)[mask]
    m = mask.copy()
    m[0, :] = m[-1, :] = m[:, 0] = m[:, -1] = False
    for _ in range(iters):
        avg = (np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 4
        out[m] = avg[m]
    return out


def vertical_fill(block: np.ndarray, mask: np.ndarray) -> np.ndarray:
    """mask 인 픽셀을 같은 열의 위·아래 가장 가까운 남은 픽셀 사이 선형 보간으로 메워요 (세로 대롱 보존)"""
    out = block.copy()
    h = block.shape[0]
    for x in range(block.shape[1]):
        col = mask[:, x]
        if not col.any():
            continue
        keep = np.where(~col)[0]
        if len(keep) == 0:
            continue
        ys = np.arange(h)
        for c in range(3):
            out[col, x, c] = np.interp(ys[col], keep, block[keep, x, c])
    return out


def remove(name: str) -> Image.Image:
    img = Image.open(DIR / f"{name}.png").convert("RGB")
    a = np.asarray(img).astype(np.float32)
    for x0, y0, x1, y1 in LOGOS[name]:
        block = a[y0:y1, x0:x1]
        full = np.ones(block.shape[:2], bool)
        full[0, :] = full[-1, :] = False
        # 영역 전체를 메운 바탕 추정 (세로 대롱 용기는 위아래로만)
        guess = vertical_fill(block, full) if name in VERTICAL else diffuse(block, np.ones(block.shape[:2], bool), 600)
        diff = np.abs(block - guess).max(axis=2)
        mask_img = Image.fromarray((diff > THRESHOLD).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(GROW * 2 + 1))
        mask = np.asarray(mask_img) > 0
        if name in VERTICAL:
            filled = vertical_fill(block, mask)
            # 세로로 메운 자리에 남는 줄무늬를 가로로만 살짝 풀어 줘요 (메운 픽셀에만)
            soft = filled.copy()
            for d in (1, 2, 3):
                soft += np.roll(filled, d, 1) + np.roll(filled, -d, 1)
            soft /= 7
            filled[mask] = soft[mask]
            a[y0:y1, x0:x1] = filled
        else:
            a[y0:y1, x0:x1] = diffuse(block, mask)
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))


if __name__ == "__main__":
    for n in (sys.argv[1:] or LOGOS):
        remove(n).save(DIR / f"{n}-nologo.png", optimize=True)
        print(f"{n}: 로고 지움 → {n}-nologo.png")
