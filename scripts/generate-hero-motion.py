"""Generate the repository-owned light/dark Orbital Systems Atlas motion assets.

This script is intentionally not part of the daily profile workflow. The WebP files
are brand artwork, while the compact public mission table is refreshed separately.
"""

from __future__ import annotations

import math
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1000, 420
HD_WIDTH, HD_HEIGHT = 1800, 756
HD_MOBILE_WIDTH, HD_MOBILE_HEIGHT = 900, 378
SCALE = 2
FRAMES = 32
FRAME_DURATION_MS = 188
STARS = [(518, 70, 2), (545, 92, 1.6), (968, 104, 2.2), (938, 44, 1.4), (967, 290, 1.6)]

THEMES = {
    "dark": {
        "background_a": "#090611",
        "background_b": "#170d22",
        "grid": "#a78dcc",
        "primary": "#f5f0fb",
        "muted": "#a995c5",
        "body": "#d5c9e5",
        "lavender": "#b895dc",
        "lavender_soft": "#8d6cad",
        "orange": "#f2a45b",
        "core": "#130b20",
        "nebula": "#7650a8",
        "chip": "#120b1c",
        "chip_stroke": "#b79bdb",
    },
    "light": {
        "background_a": "#fbf8f2",
        "background_b": "#eee6da",
        "grid": "#7d688f",
        "primary": "#261b32",
        "muted": "#5b496d",
        "body": "#493957",
        "lavender": "#7957a0",
        "lavender_soft": "#9a7bb2",
        "orange": "#b45f1e",
        "core": "#f5f0e7",
        "nebula": "#b69ac8",
        "chip": "#fbf7f0",
        "chip_stroke": "#514363",
    },
}


def scaled(value: float) -> int:
    return round(value * SCALE)


def rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    return (*rgb(hex_color), alpha)


# Optional folder of Inter / JetBrains Mono / Source Serif 4 TTFs (for example from
# Fontsource) so non-Windows machines render the same typefaces as the SVG heroes.
FONT_DIR = Path(os.environ["AGROVR_FONT_DIR"]) if os.environ.get("AGROVR_FONT_DIR") else None


def load_font(size: float, *, bold: bool = False, heavy: bool = False, italic: bool = False, mono: bool = False, medium: bool = False):
    windows = Path("C:/Windows/Fonts")
    dejavu = Path("/usr/share/fonts/truetype/dejavu")
    if mono:
        preferred, candidates = "jetbrains-mono-latin-400-normal.ttf", [windows / "consola.ttf", dejavu / "DejaVuSansMono.ttf"]
    elif italic:
        preferred, candidates = "source-serif-4-latin-400-italic.ttf", [windows / "georgiai.ttf", dejavu / "DejaVuSerif-Italic.ttf"]
    elif heavy:
        preferred, candidates = "inter-latin-800-normal.ttf", [windows / "segoeuib.ttf", dejavu / "DejaVuSans-Bold.ttf"]
    elif bold:
        preferred, candidates = "inter-latin-700-normal.ttf", [windows / "segoeuib.ttf", dejavu / "DejaVuSans-Bold.ttf"]
    elif medium:
        preferred, candidates = "inter-latin-500-normal.ttf", [windows / "segoeui.ttf", dejavu / "DejaVuSans.ttf"]
    else:
        preferred, candidates = "inter-latin-400-normal.ttf", [windows / "segoeui.ttf", dejavu / "DejaVuSans.ttf"]
    if FONT_DIR is not None:
        candidates.insert(0, FONT_DIR / preferred)

    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), scaled(size))
    return ImageFont.load_default(size=scaled(size))


def spaced_text(draw: ImageDraw.ImageDraw, xy, text, font, fill, spacing: float = 0, anchor: str = "ls"):
    """Draw text at an SVG-style baseline position with SVG-style letter-spacing."""
    x, y = scaled(xy[0]), scaled(xy[1])
    if not spacing:
        draw.text((x, y), text, font=font, fill=fill, anchor=anchor)
        return
    for index, character in enumerate(text):
        offset = font.getlength(text[:index]) + scaled(spacing) * index
        draw.text((x + offset, y), character, font=font, fill=fill, anchor=anchor)


def interpolate(a: tuple[int, int, int], b: tuple[int, int, int], amount: float):
    return tuple(round(start + (end - start) * amount) for start, end in zip(a, b))


def rotated_ellipse_points(
    center: tuple[float, float], rx: float, ry: float, angle: float, start: float = 0, end: float = math.tau, steps: int = 180
):
    cx, cy = center
    rotation = math.radians(angle)
    cosine, sine = math.cos(rotation), math.sin(rotation)
    points = []
    for index in range(steps + 1):
        theta = start + (end - start) * index / steps
        local_x, local_y = rx * math.cos(theta), ry * math.sin(theta)
        x = cx + local_x * cosine - local_y * sine
        y = cy + local_x * sine + local_y * cosine
        points.append((scaled(x), scaled(y)))
    return points


def point_on_ellipse(center, rx, ry, angle, theta):
    cx, cy = center
    rotation = math.radians(angle)
    local_x, local_y = rx * math.cos(theta), ry * math.sin(theta)
    return (
        cx + local_x * math.cos(rotation) - local_y * math.sin(rotation),
        cy + local_x * math.sin(rotation) + local_y * math.cos(rotation),
    )


def centered_text(draw: ImageDraw.ImageDraw, xy, text, font, fill):
    box = draw.textbbox((0, 0), text, font=font)
    width = box[2] - box[0]
    draw.text((scaled(xy[0]) - width / 2, scaled(xy[1])), text, font=font, fill=fill)


def make_base(theme_name: str) -> Image.Image:
    theme = THEMES[theme_name]
    size = (scaled(WIDTH), scaled(HEIGHT))
    image = Image.new("RGB", size)
    # Drawing in "RGBA" mode on an RGB image blends translucent ink. Drawing RGBA ink
    # straight onto an RGBA canvas replaces pixels instead, which flattened every
    # low-opacity grid line and orbit to full strength in earlier renders.
    draw = ImageDraw.Draw(image, "RGBA")

    top, bottom = rgb(theme["background_a"]), rgb(theme["background_b"])
    for y in range(size[1]):
        draw.line((0, y, size[0], y), fill=interpolate(top, bottom, y / max(1, size[1] - 1)))

    grid_alpha = 26 if theme_name == "dark" else 34
    for x in range(0, WIDTH + 1, 40):
        draw.line((scaled(x), 0, scaled(x), size[1]), fill=rgba(theme["grid"], grid_alpha), width=scaled(0.7))
    for y in range(0, HEIGHT + 1, 40):
        draw.line((0, scaled(y), size[0], scaled(y)), fill=rgba(theme["grid"], grid_alpha), width=scaled(0.7))

    nebula = Image.new("RGBA", size, (0, 0, 0, 0))
    nebula_draw = ImageDraw.Draw(nebula)
    nebula_draw.ellipse(
        (scaled(590), scaled(-40), scaled(950), scaled(330)),
        fill=rgba(theme["nebula"], 82 if theme_name == "dark" else 52),
    )
    nebula_draw.ellipse(
        (scaled(790), scaled(260), scaled(1035), scaled(500)),
        fill=rgba(theme["orange"], 42 if theme_name == "dark" else 28),
    )
    nebula = nebula.filter(ImageFilter.GaussianBlur(scaled(36)))
    image = Image.alpha_composite(image.convert("RGBA"), nebula).convert("RGB")
    draw = ImageDraw.Draw(image, "RGBA")

    border = rgba(theme["lavender"], 145)
    for points in [
        [(18, 42), (18, 18), (42, 18)],
        [(958, 18), (982, 18), (982, 42)],
        [(982, 378), (982, 402), (958, 402)],
        [(42, 402), (18, 402), (18, 378)],
    ]:
        draw.line([(scaled(x), scaled(y)) for x, y in points], fill=border, width=scaled(1.5), joint="curve")

    mono = load_font(15, mono=True)
    mono_small = load_font(14, mono=True)
    title = load_font(70, heavy=True)
    italic = load_font(31, italic=True)
    body = load_font(20, medium=True)
    chip_font = load_font(13, bold=True)
    tiny = load_font(12, mono=True)

    # Baselines match the static SVG heroes exactly.
    spaced_text(draw, (58, 52), "FIELD LOG 07 / PERSONAL SYSTEMS MAP", mono, theme["muted"], 2.4)
    spaced_text(draw, (56, 143), "ASHMIT", title, theme["primary"], -1.2)
    spaced_text(draw, (56, 210), "GROVER", title, theme["primary"], -1.2)
    spaced_text(draw, (59, 252), "orbital systems atlas", italic, theme["lavender"])
    spaced_text(draw, (59, 291), "Building AI products and the cloud-native", body, theme["body"])
    spaced_text(draw, (59, 319), "systems that carry them into production.", body, theme["body"])
    draw.line((scaled(36), scaled(355), scaled(472), scaled(355)), fill=rgba(theme["muted"], 100), width=scaled(1))
    draw.ellipse((scaled(32.5), scaled(351.5), scaled(39.5), scaled(358.5)), fill=theme["orange"])
    spaced_text(draw, (58, 382), "OBSERVATORY / PUBLIC SYSTEMS CATALOG", mono_small, theme["muted"], 1.8)

    center = (748, 210)
    draw.line((scaled(540), scaled(210), scaled(956), scaled(210)), fill=rgba(theme["muted"], 70), width=scaled(0.9))
    draw.line((scaled(748), scaled(42), scaled(748), scaled(378)), fill=rgba(theme["muted"], 70), width=scaled(0.9))
    draw.line(rotated_ellipse_points(center, 195, 66, -12), fill=rgba(theme["lavender"], 175), width=scaled(1.8), joint="curve")
    draw.line(rotated_ellipse_points(center, 176, 83, 38), fill=rgba(theme["orange"], 170), width=scaled(1.4), joint="curve")
    draw.line(rotated_ellipse_points(center, 142, 102, -56), fill=rgba(theme["lavender_soft"], 180), width=scaled(1.5), joint="curve")

    triangle = [(632, 121), (874, 111), (718, 329), (632, 121)]
    draw.line([(scaled(x), scaled(y)) for x, y in triangle], fill=rgba(theme["lavender"], 125), width=scaled(1.1))

    cx, cy = map(scaled, center)
    draw.ellipse((cx - scaled(47), cy - scaled(47), cx + scaled(47), cy + scaled(47)), fill=theme["core"], outline=theme["lavender"], width=scaled(2))
    draw.ellipse((cx - scaled(32), cy - scaled(32), cx + scaled(32), cy + scaled(32)), outline=rgba(theme["lavender_soft"], 145), width=scaled(1))
    draw.line((cx - scaled(14), cy, cx + scaled(14), cy), fill=theme["orange"], width=scaled(2))
    draw.line((cx, cy - scaled(14), cx, cy + scaled(14)), fill=theme["orange"], width=scaled(2))
    draw.ellipse((cx - scaled(5), cy - scaled(5), cx + scaled(5), cy + scaled(5)), fill=theme["orange"])
    spaced_text(draw, (748, 239), "A.G.", tiny, theme["body"], anchor="ms")

    nodes = [((874, 111), theme["orange"]), ((632, 121), theme["lavender"]), ((718, 329), theme["lavender_soft"])]
    for (x, y), color in nodes:
        draw.ellipse((scaled(x - 11), scaled(y - 11), scaled(x + 11), scaled(y + 11)), fill=color)
        draw.ellipse((scaled(x - 18), scaled(y - 18), scaled(x + 18), scaled(y + 18)), outline=rgba(color, 150), width=scaled(1))

    # Label chips sit on top of the orbits so no line ever crosses the words.
    chips = [
        ("AI PRODUCTS", 803, 58, 142, theme["orange"]),
        ("RESEARCH AGENTS", 547, 60, 186, theme["lavender"]),
        ("CLOUD SYSTEMS", 634, 356, 168, theme["lavender_soft"]),
    ]
    for text, x, y, width, color in chips:
        draw.rounded_rectangle(
            (scaled(x), scaled(y), scaled(x + width), scaled(y + 26)),
            radius=scaled(13),
            fill=rgba(theme["chip"], 235),
            outline=rgba(theme["chip_stroke"], 108 if theme_name == "dark" else 82),
            width=scaled(1),
        )
        draw.ellipse((scaled(x + 10), scaled(y + 9), scaled(x + 18), scaled(y + 17)), fill=color)
        spaced_text(draw, (x + 26, y + 17.6), text, chip_font, theme["primary"], 1.3)

    for x, y, radius in STARS:
        draw.ellipse((scaled(x - radius), scaled(y - radius), scaled(x + radius), scaled(y + radius)), fill=theme["body"])

    return image.convert("RGBA")


def add_motion(
    base: Image.Image,
    theme_name: str,
    frame: int,
    output_size: tuple[int, int] = (WIDTH, HEIGHT),
) -> Image.Image:
    theme = THEMES[theme_name]
    phase = math.tau * frame / FRAMES
    image = base.copy()
    motion = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(motion)
    center = (748, 210)

    # A short acquisition segment leads the probe around the primary orbit.
    for segment in range(18):
        start = phase - 0.72 + segment * 0.034
        end = start + 0.052
        alpha = round(24 + 185 * (segment + 1) / 18)
        draw.line(
            rotated_ellipse_points(center, 195, 66, -12, start, end, 5),
            fill=rgba(theme["orange"], alpha),
            width=scaled(2.4),
            joint="curve",
        )

    probe_x, probe_y = point_on_ellipse(center, 195, 66, -12, phase)
    glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.ellipse(
        (scaled(probe_x - 18), scaled(probe_y - 18), scaled(probe_x + 18), scaled(probe_y + 18)),
        fill=rgba(theme["orange"], 100),
    )
    glow = glow.filter(ImageFilter.GaussianBlur(scaled(10)))
    motion = Image.alpha_composite(motion, glow)
    draw = ImageDraw.Draw(motion)
    draw.ellipse(
        (scaled(probe_x - 5), scaled(probe_y - 5), scaled(probe_x + 5), scaled(probe_y + 5)),
        fill=theme["orange"],
        outline=theme["primary"],
        width=scaled(1),
    )

    pulse = (math.sin(phase) + 1) / 2
    radius = 51 + 7 * pulse
    alpha = round(36 + 54 * (1 - pulse))
    draw.ellipse(
        (
            scaled(center[0] - radius),
            scaled(center[1] - radius),
            scaled(center[0] + radius),
            scaled(center[1] + radius),
        ),
        outline=rgba(theme["lavender"], alpha),
        width=scaled(2),
    )

    for index, (x, y, _) in enumerate(STARS):
        twinkle = (math.sin(phase + index * 1.37) + 1) / 2
        radius = 1.2 + twinkle * 1.6
        draw.ellipse(
            (scaled(x - radius), scaled(y - radius), scaled(x + radius), scaled(y + radius)),
            fill=rgba(theme["primary"], round(75 + twinkle * 150)),
        )

    image = Image.alpha_composite(image, motion)
    if image.size != output_size:
        image = image.resize(output_size, Image.Resampling.LANCZOS)
    return image.convert("RGB")


def save_webp(frames: list[Image.Image], destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    frames[0].save(
        destination,
        save_all=True,
        append_images=frames[1:],
        duration=FRAME_DURATION_MS,
        loop=0,
        format="WEBP",
        lossless=True,
        method=6,
    )
    return destination


def generate(theme_name: str) -> list[Path]:
    base = make_base(theme_name)
    hd_frames: list[Image.Image] = []
    hd_mobile_frames: list[Image.Image] = []
    for frame in range(FRAMES):
        source = add_motion(base, theme_name, frame, base.size)
        hd_frames.append(source.resize((HD_WIDTH, HD_HEIGHT), Image.Resampling.LANCZOS))
        hd_mobile_frames.append(
            source.resize((HD_MOBILE_WIDTH, HD_MOBILE_HEIGHT), Image.Resampling.LANCZOS)
        )
    hd = save_webp(
        hd_frames,
        ROOT / "assets" / f"hero-motion-{theme_name}.webp",
    )
    hd_mobile = save_webp(
        hd_mobile_frames,
        ROOT / "assets" / f"hero-motion-mobile-{theme_name}.webp",
    )
    return [hd, hd_mobile]


if __name__ == "__main__":
    for theme in ("light", "dark"):
        for output in generate(theme):
            print(f"Generated {output.relative_to(ROOT)} ({output.stat().st_size:,} bytes)")
