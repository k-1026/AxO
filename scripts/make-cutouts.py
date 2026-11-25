"""용기 샘플 사진의 바탕(연한 분홍·그림자)을 투명하게 만든 누끼 PNG를 만들어요.

사진 가장자리에서 시작해 색이 부드럽게 이어지는 바탕만 지워요. 용기 윤곽선에서 멈춰서 용기는 남아요.
로고를 지운 사진(<이름>-nologo.png, scripts/remove-logos.py)에서 만들어요. 화면 제품 이미지에 로고가 나오지 않아요.
결과: public/IMAGE/LOGO/cheonghyang-logo-02/application-examples/<이름>-cutout.png (크기는 원본과 같아요)
실행: python scripts/make-cutouts.py
"""
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

DIR = Path(__file__).resolve().parent.parent / "public/IMAGE/LOGO/cheonghyang-logo-02/application-examples"
NAMES = ["toner", "serum", "cream", "lotion-pump", "mist", "cleanser", "eye", "pad", "mask"]
STEP = 7.0       # 이웃 픽셀과 이 정도 색 차이까지는 같은 바탕으로 봐요
# 흰 몸통이 바탕색과 비슷한 용기는 윤곽이 옅어서 더 조심스럽게 지워요
STEP_BY_NAME = {"cream": 2.5, "lotion-pump": 2.5, "serum": 2.5, "cleanser": 2.5, "eye": 1.0, "pad": 1.0, "mask": 2.5}
MIN_LIGHT = 150  # 이보다 어두운 픽셀(용기 윤곽·글자)은 바탕으로 보지 않아요


def cutout(path: Path, step: float = STEP) -> Image.Image:
    img = Image.open(path).convert("RGB")
    a = np.asarray(img).astype(np.int16)
    h, w, _ = a.shape
    light = a.mean(axis=2)
    bg = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        q.append((0, x)); q.append((h - 1, x))
    for y in range(h):
        q.append((y, 0)); q.append((y, w - 1))
    for y, x in q:
        bg[y, x] = light[y, x] >= MIN_LIGHT
    q = deque(p for p in q if bg[p])
    while q:
        y, x = q.popleft()
        c = a[y, x]
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= ny < h and 0 <= nx < w and not bg[ny, nx] and light[ny, nx] >= MIN_LIGHT:
                if np.abs(a[ny, nx] - c).max() <= step:
                    bg[ny, nx] = True
                    q.append((ny, nx))
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.2))
    out = img.convert("RGBA")
    out.putalpha(alpha)
    return out


if __name__ == "__main__":
    import sys
    # 이름을 주면 그 샘플만 다시 만들어요 (예: python scripts/make-cutouts.py cleanser eye)
    for n in (sys.argv[1:] or NAMES):
        src = DIR / f"{n}-nologo.png"
        cut = cutout(src, STEP_BY_NAME.get(n, STEP))
        cut.save(DIR / f"{n}-cutout.png", optimize=True)
        clear = (np.asarray(cut)[:, :, 3] < 128).mean()
        print(f"{n}: 바탕 {clear:.0%} 투명 → {n}-cutout.png")
