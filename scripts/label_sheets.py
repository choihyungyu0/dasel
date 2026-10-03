"""라벨링 초안용: 건물별 위성 이미지(screenshots/label_tiles)를 12장씩 한 장에 모은다."""
import json
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

SRC = Path("screenshots/label_tiles")
OUT = SRC / "sheets"
OUT.mkdir(exist_ok=True)
COLS, ROWS, SIZE = 4, 3, 480

index = json.loads((SRC / "index.json").read_text(encoding="utf-8"))
files = {int(p.name[:3]): p for p in SRC.glob("*.jpg")}
try:
    font = ImageFont.truetype("arial.ttf", 34)
except OSError:
    font = ImageFont.load_default()

for start in range(0, len(index), COLS * ROWS):
    sheet = Image.new("RGB", (COLS * SIZE, ROWS * SIZE), "white")
    draw = ImageDraw.Draw(sheet)
    for k, item in enumerate(index[start:start + COLS * ROWS]):
        img = Image.open(files[item["n"]]).convert("RGB")
        side = min(img.size)
        left, top = (img.width - side) // 2, (img.height - side) // 2
        img = img.crop((left, top, left + side, top + side)).resize((SIZE, SIZE), Image.LANCZOS)
        x, y = (k % COLS) * SIZE, (k // COLS) * SIZE
        sheet.paste(img, (x, y))
        draw.rectangle((x, y, x + 78, y + 44), fill="black")
        draw.text((x + 6, y + 3), str(item["n"]), fill="white", font=font)
        draw.rectangle((x, y, x + SIZE - 1, y + SIZE - 1), outline="white", width=2)
    sheet.save(OUT / f"sheet_{start // (COLS * ROWS) + 1:02d}.jpg", quality=85)
print("sheets", len(list(OUT.glob("*.jpg"))))
