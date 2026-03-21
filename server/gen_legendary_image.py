"""
gen_legendary_image.py
Генерирует PNG-картинку топ-10 легендарных карт для Арены.
Запуск: python gen_legendary_image.py [output_path]
"""

import json
import os
import sys
import textwrap
from io import BytesIO
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# ── Пути ──────────────────────────────────────────────────────────────────────
BASE_DIR   = Path(__file__).parent
DATA_FILE  = BASE_DIR / "data" / "legendaries.json"
PUBLIC_DIR = BASE_DIR.parent / "public"
BG_FILE    = PUBLIC_DIR / "wallpaper" / "body-content-bg.jpg"
FONT_HS    = PUBLIC_DIR / "fonts" / "2318-font.otf"
OUT_PATH   = Path(sys.argv[1]) if len(sys.argv) > 1 else PUBLIC_DIR / "generated" / "top_legendaries.png"

# Fallback system fonts (Windows / Linux)
FALLBACK_FONTS = [
    "C:/Windows/Fonts/segoeui.ttf",
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
]

# ── Константы макета ───────────────────────────────────────────────────────────
CANVAS_W    = 1200
CANVAS_H    = 680
PADDING     = 40
CARD_W      = 185       # ширина карты после ресайза
CARD_H      = 280       # высота карты
COLS        = 5
ROWS        = 2
GAP_X       = (CANVAS_W - PADDING * 2 - CARD_W * COLS) // (COLS - 1)  # промежуток по X
HEADER_H    = 80        # высота шапки
TOP_CARDS   = COLS * ROWS  # = 10


def load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    """Загружает шрифт с поддержкой кириллицы."""
    candidates = []
    if not bold and FONT_HS.exists():
        candidates.append(str(FONT_HS))
    if bold:
        candidates += [
            "C:/Windows/Fonts/segoeuib.ttf",
            "C:/Windows/Fonts/arialbd.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        ]
    candidates += FALLBACK_FONTS
    for path in candidates:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            pass
    return ImageFont.load_default()


def fetch_image(url: str, timeout: int = 12) -> Image.Image | None:
    """Скачивает изображение по URL."""
    if not url:
        return None
    try:
        r = requests.get(url, timeout=timeout,
                         headers={"User-Agent": "Mozilla/5.0 (compatible; ManacostArena/1.0)"})
        if r.status_code == 200:
            return Image.open(BytesIO(r.content)).convert("RGBA")
    except Exception as e:
        print(f"  [WARN] fetch failed {url[:60]}: {e}", flush=True)
    return None


def fetch_card_image(kc: dict) -> Image.Image | None:
    """Пробует несколько источников изображения карты."""
    card_id = kc.get("cardId", "")
    sources = [
        kc.get("imageHa"),
        kc.get("imageRu"),
        f"https://art.hearthstonejson.com/v1/render/latest/ruRU/256x/{card_id}.png" if card_id else None,
        f"https://art.hearthstonejson.com/v1/render/latest/enUS/256x/{card_id}.png" if card_id else None,
    ]
    for src in sources:
        if not src:
            continue
        img = fetch_image(src)
        if img:
            return img
    return None


def make_parchment_bg(w: int, h: int) -> Image.Image:
    """Создаёт фон из wallpaper или чистый пергаментный цвет."""
    if BG_FILE.exists():
        bg = Image.open(BG_FILE).convert("RGB")
        # Масштабируем с заполнением (cover)
        bg_ratio = bg.width / bg.height
        canvas_ratio = w / h
        if bg_ratio > canvas_ratio:
            new_h = h
            new_w = int(bg.width * h / bg.height)
        else:
            new_w = w
            new_h = int(bg.height * w / bg.width)
        bg = bg.resize((new_w, new_h), Image.LANCZOS)
        # Обрезаем по центру
        x = (new_w - w) // 2
        y = (new_h - h) // 2
        bg = bg.crop((x, y, x + w, y + h))
        return bg.convert("RGBA")
    else:
        # Fallback: сплошной пергамент
        bg = Image.new("RGBA", (w, h), (244, 228, 188, 255))
        return bg


def draw_winrate_badge(draw: ImageDraw.Draw, cx: int, cy: int, winrate: float) -> None:
    """Рисует круглый бейдж с процентом побед."""
    r = 26
    x0, y0 = cx - r, cy - r
    x1, y1 = cx + r, cy + r
    # Тень
    shadow_img = Image.new("RGBA", (r*2+10, r*2+10), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow_img)
    sd.ellipse((5, 5, r*2+5, r*2+5), fill=(0, 0, 0, 90))
    # Blur тени
    shadow_img = shadow_img.filter(ImageFilter.GaussianBlur(4))

    color = (214, 175, 55, 255) if winrate >= 58 else (168, 138, 69, 255)
    draw.ellipse((x0, y0, x1, y1), fill=(30, 15, 5, 200), outline=color, width=2)

    fnt = load_font(13, bold=True)
    text = f"{winrate:.1f}%"
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    draw.text((cx - tw // 2, cy - th // 2), text, font=fnt, fill=(252, 211, 77, 255))


def draw_card_name(draw: ImageDraw.Draw, cx: int, y: int, name: str, max_w: int) -> None:
    """Рисует название карты под картинкой."""
    fnt = load_font(15)
    # Перенос текста если не влезает
    lines = textwrap.wrap(name, width=16)
    for i, line in enumerate(lines[:2]):
        bbox = draw.textbbox((0, 0), line, font=fnt)
        tw = bbox[2] - bbox[0]
        # Тень
        draw.text((cx - tw // 2 + 1, y + i * 18 + 1), line, font=fnt, fill=(0, 0, 0, 160))
        draw.text((cx - tw // 2, y + i * 18), line, font=fnt, fill=(61, 34, 8, 255))


def main():
    print("[gen] Loading legendaries data...", flush=True)
    with open(DATA_FILE, encoding="utf-8") as f:
        data = json.load(f)

    groups = [g for g in data.get("groups", []) if g.get("winRate") is not None]
    groups.sort(key=lambda g: -(g["winRate"] or 0))
    top = groups[:TOP_CARDS]

    if not top:
        print("[gen] ERROR: no legendaries data", flush=True)
        sys.exit(1)

    print(f"[gen] Got {len(top)} legendary groups", flush=True)

    # ── Создаём холст ──────────────────────────────────────────────────────────
    canvas = make_parchment_bg(CANVAS_W, CANVAS_H)

    # Тёмный оверлей для читаемости
    overlay = Image.new("RGBA", (CANVAS_W, CANVAS_H), (20, 10, 4, 100))
    canvas = Image.alpha_composite(canvas, overlay)

    draw = ImageDraw.Draw(canvas)

    # ── Шапка ─────────────────────────────────────────────────────────────────
    # Декоративная линия сверху
    draw.rectangle((PADDING, 18, CANVAS_W - PADDING, 21), fill=(212, 175, 55, 200))

    fnt_title = load_font(36)
    fnt_sub   = load_font(16)

    title = "Топ-10 легендарок · Арена Hearthstone"
    subtitle = "manacost.ru/arena"

    # Тень заголовка
    draw.text((PADDING + 2, 30 + 2), title, font=fnt_title, fill=(0, 0, 0, 140))
    draw.text((PADDING, 30), title, font=fnt_title, fill=(252, 211, 77, 255))

    bbox_sub = draw.textbbox((0, 0), subtitle, font=fnt_sub)
    sw = bbox_sub[2] - bbox_sub[0]
    draw.text((CANVAS_W - PADDING - sw, 44), subtitle, font=fnt_sub, fill=(168, 138, 69, 200))

    draw.rectangle((PADDING, HEADER_H - 4, CANVAS_W - PADDING, HEADER_H - 2), fill=(212, 175, 55, 120))

    # ── Карточки ──────────────────────────────────────────────────────────────
    cards_area_h = CANVAS_H - HEADER_H - PADDING
    row_h = cards_area_h // ROWS

    for idx, group in enumerate(top):
        row = idx // COLS
        col = idx % COLS

        cx = PADDING + col * (CARD_W + GAP_X) + CARD_W // 2
        card_top = HEADER_H + row * row_h + 10

        kc = group["keyCard"]
        win_rate = group["winRate"]

        print(f"[gen] [{idx+1}/{len(top)}] Fetching: {kc.get('name', '?')}", flush=True)
        card_img = fetch_card_image(kc)

        if card_img:
            # Ресайз с сохранением пропорций
            orig_w, orig_h = card_img.size
            scale = min(CARD_W / orig_w, CARD_H / orig_h)
            new_w = int(orig_w * scale)
            new_h = int(orig_h * scale)
            card_img = card_img.resize((new_w, new_h), Image.LANCZOS)

            # Тень под картой
            shadow = Image.new("RGBA", (new_w + 20, new_h + 20), (0, 0, 0, 0))
            sd = ImageDraw.Draw(shadow)
            sd.rectangle((10, 10, new_w + 10, new_h + 10), fill=(0, 0, 0, 100))
            shadow = shadow.filter(ImageFilter.GaussianBlur(8))
            px = cx - new_w // 2 - 10 + 5
            py = card_top - 10 + 5
            canvas.paste(shadow, (px, py), shadow)

            # Вставляем карту
            px = cx - new_w // 2
            canvas.paste(card_img, (px, card_top), card_img)
            img_bottom = card_top + new_h
        else:
            # Заглушка
            bx0, bx1 = cx - CARD_W // 2, cx + CARD_W // 2
            by0, by1 = card_top, card_top + CARD_H
            draw.rounded_rectangle((bx0, by0, bx1, by1), radius=10,
                                   fill=(44, 30, 22, 220), outline=(168, 138, 69, 180), width=2)
            fnt_fb = load_font(13)
            name_lines = textwrap.wrap(kc.get("name", "?"), width=14)
            for li, line in enumerate(name_lines[:3]):
                lb = draw.textbbox((0, 0), line, font=fnt_fb)
                lw = lb[2] - lb[0]
                draw.text((cx - lw // 2, card_top + CARD_H // 2 - 10 + li * 18),
                          line, font=fnt_fb, fill=(252, 211, 77, 220))
            img_bottom = card_top + CARD_H

        # Бейдж винрейта
        badge_y = img_bottom - 20
        if badge_y < card_top + 20:
            badge_y = card_top + CARD_H - 20
        draw_winrate_badge(draw, cx, badge_y, win_rate)

        # Название под картой
        name_y = img_bottom + 8
        draw_card_name(draw, cx, name_y, kc.get("name", ""), CARD_W)

    # Декоративная линия снизу
    draw.rectangle((PADDING, CANVAS_H - 22, CANVAS_W - PADDING, CANVAS_H - 19), fill=(212, 175, 55, 200))

    # ── Сохраняем ─────────────────────────────────────────────────────────────
    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    canvas_rgb = canvas.convert("RGB")
    canvas_rgb.save(str(OUT_PATH), "PNG", optimize=True)
    print(f"[gen] Saved to {OUT_PATH}", flush=True)


if __name__ == "__main__":
    main()
