"""Genera los assets de Libreve sin depender de servicios externos.

Uso: python3 scripts/generate_assets.py
Requiere Pillow.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
S = 4

PURPLE = "#5B4B8A"
PURPLE_LIGHT = "#6E5BA3"
PURPLE_DARK = "#382F55"
CREAM = "#F7F4EF"
PAPER = "#EFE9DE"
GOLD = "#D8A862"
MUTED = "#706A7B"

FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"


def rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


def rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    return (*rgb(value), alpha)


def gradient(size: tuple[int, int], center: str, edge: str) -> Image.Image:
    mask = Image.radial_gradient("L").resize(size, Image.Resampling.BICUBIC)
    return Image.composite(
        Image.new("RGBA", size, rgba(edge)),
        Image.new("RGBA", size, rgba(center)),
        mask,
    )


def bezier(
    p0: tuple[float, float],
    p1: tuple[float, float],
    p2: tuple[float, float],
    p3: tuple[float, float],
    steps: int = 36,
) -> list[tuple[float, float]]:
    points = []
    for index in range(steps + 1):
        t = index / steps
        u = 1 - t
        x = (
            u**3 * p0[0]
            + 3 * u * u * t * p1[0]
            + 3 * u * t * t * p2[0]
            + t**3 * p3[0]
        )
        y = (
            u**3 * p0[1]
            + 3 * u * u * t * p1[1]
            + 3 * u * t * t * p2[1]
            + t**3 * p3[1]
        )
        points.append((x, y))
    return points


def page_points(
    cx: float,
    top: float,
    bottom: float,
    half_width: float,
    bulge: float,
    side: int,
) -> list[tuple[float, float]]:
    top_center = (cx, top)
    outer_top = (cx + side * half_width, top + bulge * 0.35)
    outer_bottom = (cx + side * half_width * 0.94, bottom - bulge * 0.25)
    bottom_center = (cx, bottom)

    points = bezier(
        top_center,
        (cx + side * half_width * 0.55, top - bulge * 0.25),
        (cx + side * half_width * 0.98, top + bulge * 0.05),
        outer_top,
    )
    points += bezier(
        outer_top,
        (cx + side * half_width * 1.06, top + bulge * 1.25),
        (cx + side * half_width * 1.02, bottom - bulge * 0.7),
        outer_bottom,
    )
    points += bezier(
        outer_bottom,
        (cx + side * half_width * 0.62, bottom + bulge * 0.35),
        (cx + side * half_width * 0.24, bottom + bulge * 0.15),
        bottom_center,
    )
    points.append(top_center)
    return points


def star(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    radius: float,
    color: tuple[int, int, int, int],
) -> None:
    inner = radius * 0.17
    points = [
        (cx, cy - radius),
        (cx + inner, cy - inner),
        (cx + radius, cy),
        (cx + inner, cy + inner),
        (cx, cy + radius),
        (cx - inner, cy + inner),
        (cx - radius, cy),
        (cx - inner, cy - inner),
    ]
    draw.polygon(points, fill=color)


def draw_book(
    image: Image.Image,
    cx: float,
    top: float,
    bottom: float,
    half_width: float,
    bulge: float,
) -> None:
    draw = ImageDraw.Draw(image, "RGBA")

    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow, "RGBA")
    glow_draw.ellipse(
        (
            cx - half_width * 1.4,
            top - bulge * 1.6,
            cx + half_width * 1.4,
            bottom + bulge * 1.2,
        ),
        fill=rgba(GOLD, 26),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(radius=40 * S))
    image.alpha_composite(glow)
    draw = ImageDraw.Draw(image, "RGBA")

    draw.polygon(page_points(cx, top, bottom, half_width, bulge, -1), fill=rgba(CREAM))
    draw.polygon(page_points(cx, top, bottom, half_width, bulge, 1), fill=rgba(PAPER))

    for side in (-1, 1):
        for fraction in (0.35, 0.58, 0.81):
            width = half_width * fraction
            line = bezier(
                (cx + side * width * 0.12, top + bulge * 0.95),
                (cx + side * width * 0.55, top + bulge * 1.2),
                (cx + side * width * 0.85, bottom - bulge * 1.15),
                (cx + side * width * 0.45, bottom - bulge * 0.95),
            )
            draw.line(line, fill=rgba(MUTED, 70), width=max(1, int(3 * S)))

    spine_width = max(2, int(12 * S))
    draw.line(
        [(cx, top + bulge * 0.1), (cx, bottom - bulge * 0.05)],
        fill=rgba(GOLD),
        width=spine_width,
    )
    draw.ellipse(
        (
            cx - spine_width / 2,
            bottom - bulge * 0.35 - spine_width / 2,
            cx + spine_width / 2,
            bottom - bulge * 0.35 + spine_width / 2,
        ),
        fill=rgba(GOLD),
    )


def finish(image: Image.Image, path: Path, size: tuple[int, int] | None = None) -> None:
    result = image.convert("RGB")
    if size is not None:
        result = result.resize(size, Image.Resampling.LANCZOS)
    result.save(path, "PNG", optimize=True)
    print(f"{path.relative_to(ROOT)}  {result.size[0]}x{result.size[1]}")


def make_square(name: str, logical_size: int, icon_scale: float) -> Image.Image:
    size = (logical_size * S, logical_size * S)
    image = gradient(size, PURPLE_LIGHT, PURPLE_DARK)
    center = logical_size / 2 * S

    draw_book(
        image,
        cx=center,
        top=(logical_size * 0.42) * S,
        bottom=(logical_size * 0.70) * S,
        half_width=(logical_size * 0.29 * icon_scale) * S,
        bulge=(logical_size * 0.07 * icon_scale) * S,
    )

    draw = ImageDraw.Draw(image, "RGBA")
    star(draw, center, (logical_size * 0.29) * S, (logical_size * 0.065 * icon_scale) * S, rgba(GOLD))
    star(
        draw,
        (logical_size * 0.66) * S,
        (logical_size * 0.22) * S,
        (logical_size * 0.026 * icon_scale) * S,
        rgba(GOLD, 220),
    )
    return image


def make_feature() -> Image.Image:
    width, height = 1024, 500
    size = (width * S, height * S)
    image = gradient(size, PURPLE_LIGHT, PURPLE_DARK)

    draw_book(
        image,
        cx=270 * S,
        top=190 * S,
        bottom=365 * S,
        half_width=155 * S,
        bulge=34 * S,
    )

    draw = ImageDraw.Draw(image, "RGBA")
    star(draw, 270 * S, 135 * S, 34 * S, rgba(GOLD))

    title_font = ImageFont.truetype(FONT_BOLD, 104 * S)
    subtitle_font = ImageFont.truetype(FONT_REGULAR, 30 * S)

    draw.text((560 * S, 158 * S), "Libreve", font=title_font, fill=rgba(CREAM))
    draw.text(
        (566 * S, 288 * S),
        "Tus libros, tus resúmenes",
        font=subtitle_font,
        fill=rgba(GOLD),
    )
    draw.rounded_rectangle(
        (566 * S, 344 * S, 760 * S, 347 * S),
        radius=2 * S,
        fill=rgba(GOLD, 200),
    )
    return image


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)

    icon = make_square("icon", 1024, 1.0)
    finish(icon, ASSETS / "icon-master-1024.png", (1024, 1024))
    finish(icon, ASSETS / "play-store-icon-512.png", (512, 512))
    finish(icon, ASSETS / "favicon-192.png", (192, 192))

    foreground = make_square("foreground", 1080, 0.82)
    finish(foreground, ASSETS / "adaptive-icon-foreground-1080.png", (1080, 1080))

    background_size = (1080 * S, 1080 * S)
    background = gradient(background_size, PURPLE_LIGHT, PURPLE_DARK)
    finish(background, ASSETS / "adaptive-icon-background-1080.png", (1080, 1080))

    finish(make_feature(), ASSETS / "feature-graphic-1024x500.png", (1024, 500))


if __name__ == "__main__":
    main()
