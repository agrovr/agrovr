"""Generate the repository-owned light/dark Orbital Systems Atlas motion assets.

This script is intentionally not part of the daily profile workflow. The WebP files
are brand artwork, while the activity tracker is the only data-driven visual.
"""

from __future__ import annotations

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1000, 420
HD_WIDTH, HD_HEIGHT = 1800, 756
HD_MOBILE_WIDTH, HD_MOBILE_HEIGHT = 900, 378
SCALE = 2
FRAMES = 32
FRAME_DURATION_MS = 188

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
    },
}


def scaled(value: float) -> int:
    return round(value * SCALE)


def rgb(hex_color: str) -> tuple[int, int, int]:
    value = hex_color.lstrip("#")
    return tuple(int(value[index : index + 2], 16) for index in (0, 2, 4))


def rgba(hex_color: str, alpha: int = 255) -> tuple[int, int, int, int]:
    return (*rgb(hex_color), alpha)


def load_font(size: int, *, bold: bool = False, italic: bool = False, mono: bool = False):
    windows = Path("C:/Windows/Fonts")
    if mono:
        candidates = [windows / "consola.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf")]
    elif italic:
        candidates = [windows / "georgiai.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Italic.ttf")]
    elif bold:
        candidates = [windows / "segoeuib.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf")]
    else:
        candidates = [windows / "segoeui.ttf", Path("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf")]

    for candidate in candidates:
        if candidate.exists():
            return ImageFont.truetype(str(candidate), scaled(size))
    return ImageFont.load_default(size=scaled(size))


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
    image = Image.new("RGBA", size)
    draw = ImageDraw.Draw(image)

    top, bottom = rgb(theme["background_a"]), rgb(theme["background_b"])
    for y in range(size[1]):
        draw.line((0, y, size[0], y), fill=(*interpolate(top, bottom, y / max(1, size[1] - 1)), 255))

    for x in range(0, WIDTH + 1, 40):
        draw.line((scaled(x), 0, scaled(x), size[1]), fill=rgba(theme["grid"], 23), width=1)
    for y in range(0, HEIGHT + 1, 40):
        draw.line((0, scaled(y), size[0], scaled(y)), fill=rgba(theme["grid"], 23), width=1)

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
    image = Image.alpha_composite(image, nebula)
    draw = ImageDraw.Draw(image)

    border = rgba(theme["lavender"], 145)
    corner = 24
    for points in [
        [(18, 42), (18, 18), (42, 18)],
        [(958, 18), (982, 18), (982, 42)],
        [(982, 378), (982, 402), (958, 402)],
        [(42, 402), (18, 402), (18, 378)],
    ]:
        draw.line([(scaled(x), scaled(y)) for x, y in points], fill=border, width=scaled(1.5), joint="curve")

    mono = load_font(15, mono=True)
    title = load_font(70, bold=True)
    italic = load_font(31, italic=True)
    body = load_font(20)
    label = load_font(17, bold=True)
    tiny = load_font(12, mono=True)

    draw.text((scaled(58), scaled(35)), "FIELD LOG 07 / PERSONAL SYSTEMS MAP", font=mono, fill=theme["muted"])
    draw.text((scaled(56), scaled(76)), "ASHMIT", font=title, fill=theme["primary"])
    draw.text((scaled(56), scaled(143)), "GROVER", font=title, fill=theme["primary"])
    draw.text((scaled(59), scaled(236)), "orbital systems atlas", font=italic, fill=theme["lavender"])
    draw.text((scaled(59), scaled(286)), "Building AI products and the cloud-native", font=body, fill=theme["body"])
    draw.text((scaled(59), scaled(314)), "systems that carry them into production.", font=body, fill=theme["body"])
    draw.line((scaled(36), scaled(355), scaled(472), scaled(355)), fill=rgba(theme["muted"], 100), width=scaled(1))
    draw.ellipse((scaled(32.5), scaled(351.5), scaled(39.5), scaled(358.5)), fill=theme["orange"])
    draw.text((scaled(58), scaled(370)), "OBSERVATORY / PUBLIC SYSTEMS CATALOG", font=mono, fill=theme["muted"])

    center = (748, 210)
    draw.line((scaled(540), scaled(210), scaled(956), scaled(210)), fill=rgba(theme["muted"], 60), width=scaled(1))
    draw.line((scaled(748), scaled(42), scaled(748), scaled(378)), fill=rgba(theme["muted"], 60), width=scaled(1))
    draw.line(rotated_ellipse_points(center, 195, 66, -12), fill=rgba(theme["lavender"], 170), width=scaled(2), joint="curve")
    draw.line(rotated_ellipse_points(center, 176, 83, 38), fill=rgba(theme["orange"], 160), width=scaled(1.5), joint="curve")
    draw.line(rotated_ellipse_points(center, 142, 102, -56), fill=rgba(theme["lavender_soft"], 165), width=scaled(1.5), joint="curve")

    triangle = [(632, 121), (874, 111), (718, 329), (632, 121)]
    draw.line([(scaled(x), scaled(y)) for x, y in triangle], fill=rgba(theme["lavender"], 105), width=scaled(1))

    cx, cy = map(scaled, center)
    draw.ellipse((cx - scaled(47), cy - scaled(47), cx + scaled(47), cy + scaled(47)), fill=theme["core"], outline=theme["lavender"], width=scaled(2))
    draw.ellipse((cx - scaled(32), cy - scaled(32), cx + scaled(32), cy + scaled(32)), outline=rgba(theme["lavender_soft"], 145), width=scaled(1))
    draw.line((cx - scaled(14), cy, cx + scaled(14), cy), fill=theme["orange"], width=scaled(2))
    draw.line((cx, cy - scaled(14), cx, cy + scaled(14)), fill=theme["orange"], width=scaled(2))
    draw.ellipse((cx - scaled(5), cy - scaled(5), cx + scaled(5), cy + scaled(5)), fill=theme["orange"])
    centered_text(draw, (748, 235), "A.G.", tiny, theme["body"])

    nodes = [
        ((874, 111), "AI PRODUCTS", (841, 76), theme["orange"]),
        ((632, 121), "RESEARCH AGENTS", (636, 84), theme["lavender"]),
        ((718, 329), "CLOUD SYSTEMS", (718, 350), theme["lavender_soft"]),
    ]
    for (x, y), text, text_xy, color in nodes:
        draw.ellipse((scaled(x - 11), scaled(y - 11), scaled(x + 11), scaled(y + 11)), fill=color)
        draw.ellipse((scaled(x - 18), scaled(y - 18), scaled(x + 18), scaled(y + 18)), outline=rgba(color, 150), width=scaled(1))
        centered_text(draw, text_xy, text, label, theme["primary"])

    for x, y, radius in [(518, 70, 2), (545, 92, 1.6), (968, 104, 2.2), (928, 65, 1.4), (967, 290, 1.6)]:
        draw.ellipse((scaled(x - radius), scaled(y - radius), scaled(x + radius), scaled(y + radius)), fill=theme["body"])

    return image


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

    for index, (x, y) in enumerate([(518, 70), (545, 92), (968, 104), (928, 65), (967, 290)]):
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
        method=4,
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
