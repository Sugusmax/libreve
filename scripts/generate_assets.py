"""Genera los assets de Libreve a partir de assets/icon-source.png.

Uso: python3 scripts/generate_assets.py
Requiere Pillow. La imagen fuente se conserva en el repo para poder regenerar.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
ASSETS = ROOT / "assets"
SOURCE = ASSETS / "icon-source.png"
S = 4

# Paleta de la app (src/theme/colors.ts) y del icono anterior.
PURPLE = "#5B4B8A"
PURPLE_LIGHT = "#6E5BA3"
PURPLE_DARK = "#382F55"
CREAM = "#F7F4EF"
GOLD = "#D8A862"

# El icono generado tiene esquinas negras fuera de la forma redondeada.
FILL_CORNERS = (248, 230, 212)  # crema cálido tomado del borde de la imagen.
PURPLE_KEY = (70, 46, 98)  # morado del fondo que se vuelve transparente.

FONT_BOLD = "/usr/share/fonts/truetype/noto/NotoSans-Bold.ttf"
FONT_REGULAR = "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf"


def rgba(value: str, alpha: int = 255) -> tuple[int, int, int, int]:
    value = value.lstrip("#")
    return (*tuple(int(value[i : i + 2], 16) for i in (0, 2, 4)), alpha)


def gradient(size: tuple[int, int], center: str, edge: str) -> Image.Image:
    mask = Image.radial_gradient("L").resize(size, Image.Resampling.BICUBIC)
    return Image.composite(
        Image.new("RGBA", size, rgba(edge)),
        Image.new("RGBA", size, rgba(center)),
        mask,
    )


def base_icon() -> Image.Image:
    """Imagen fuente con las esquinas negras rellenas de crema."""
    image = Image.open(SOURCE).convert("RGB")
    width, height = image.size

    for xy in [(0, 0), (width - 1, 0), (0, height - 1), (width - 1, height - 1)]:
        ImageDraw.floodfill(image, xy, FILL_CORNERS, thresh=45)

    return image


def finish(image: Image.Image, path: Path, size: tuple[int, int]) -> None:
    result = image.convert("RGB").resize(size, Image.Resampling.LANCZOS)
    result.save(path, "PNG", optimize=True)
    print(f"{path.relative_to(ROOT)}  {result.size[0]}x{result.size[1]}")


def make_square_icons() -> None:
    icon = base_icon()
    finish(icon, ASSETS / "icon-master-1024.png", (1024, 1024))
    finish(icon, ASSETS / "play-store-icon-512.png", (512, 512))
    finish(icon, ASSETS / "favicon-192.png", (192, 192))


def book_glyph() -> Image.Image:
    """Recorta el libro y la chispa, sin el texto ni el borde del icono."""
    source = Image.open(SOURCE).convert("RGB")
    crop = source.crop((180, 120, 1075, 690)).convert("RGBA")
    pixels = crop.load()

    for y in range(crop.height):
        for x in range(crop.width):
            r, g, b, _ = pixels[x, y]
            distance = (
                (r - PURPLE_KEY[0]) ** 2
                + (g - PURPLE_KEY[1]) ** 2
                + (b - PURPLE_KEY[2]) ** 2
            ) ** 0.5
            alpha = 0 if distance <= 25 else min(255, int((distance - 25) * 255 / 45))
            pixels[x, y] = (r, g, b, alpha)

    bbox = crop.getchannel("A").getbbox()
    return crop.crop(bbox) if bbox else crop


def make_adaptive_icons(glyph: Image.Image) -> None:
    # El área segura del icono adaptativo es un círculo del 66% del lienzo.
    safe = int(1080 * 0.66)
    scale = min(safe / glyph.width, safe / glyph.height)
    scaled = glyph.resize(
        (max(1, int(glyph.width * scale)), max(1, int(glyph.height * scale))),
        Image.Resampling.LANCZOS,
    )

    foreground = Image.new("RGBA", (1080, 1080), (0, 0, 0, 0))
    foreground.alpha_composite(
        scaled, ((1080 - scaled.width) // 2, (1080 - scaled.height) // 2)
    )
    foreground.save(ASSETS / "adaptive-icon-foreground-1080.png", "PNG", optimize=True)
    print("assets/adaptive-icon-foreground-1080.png  1080x1080")

    background = gradient((1080, 1080), PURPLE_LIGHT, PURPLE_DARK)
    background.convert("RGB").save(
        ASSETS / "adaptive-icon-background-1080.png", "PNG", optimize=True
    )
    print("assets/adaptive-icon-background-1080.png  1080x1080")


def make_feature(glyph: Image.Image) -> None:
    width, height = 1024, 500
    image = gradient((width * S, height * S), PURPLE_LIGHT, PURPLE_DARK)

    icon_size = 360 * S
    icon = glyph.resize(
        (
            int(glyph.width * icon_size / max(glyph.width, glyph.height)),
            int(glyph.height * icon_size / max(glyph.width, glyph.height)),
        ),
        Image.Resampling.LANCZOS,
    )
    image.alpha_composite(icon, (90 * S, (height * S - icon.height) // 2))

    draw = ImageDraw.Draw(image, "RGBA")
    title_font = ImageFont.truetype(FONT_BOLD, 104 * S)
    subtitle_font = ImageFont.truetype(FONT_REGULAR, 30 * S)

    draw.text((500 * S, 158 * S), "Libreve", font=title_font, fill=rgba(CREAM))
    draw.text(
        (506 * S, 288 * S),
        "Tus libros, tus resúmenes",
        font=subtitle_font,
        fill=rgba(GOLD),
    )
    draw.rounded_rectangle(
        (506 * S, 344 * S, 700 * S, 347 * S),
        radius=2 * S,
        fill=rgba(GOLD, 200),
    )

    result = image.convert("RGB").resize((width, height), Image.Resampling.LANCZOS)
    result.save(ASSETS / "feature-graphic-1024x500.png", "PNG", optimize=True)
    print("assets/feature-graphic-1024x500.png  1024x500")


def main() -> None:
    ASSETS.mkdir(parents=True, exist_ok=True)
    if not SOURCE.exists():
        raise SystemExit(f"Falta la imagen fuente: {SOURCE}")

    make_square_icons()
    glyph = book_glyph()
    make_adaptive_icons(glyph)
    make_feature(glyph)


if __name__ == "__main__":
    main()
