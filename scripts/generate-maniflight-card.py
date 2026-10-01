"""Generate the light/dark Maniflight mission card in the Orbital Systems Atlas style.

The card mirrors the RoleForge and KubeResearch mission cards (920-wide viewBox,
chart grid, corner brackets, mono mission tag) and shows Maniflight's fork:
a read-only evidence scan splits into observed blockers and evidence gaps,
which then converge on the next actor.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

THEMES = {
    "dark": {
        "bg": "#0d0816",
        "grid": "#aa8dcb",
        "grid_opacity": "0.1",
        "haze": "#67408f",
        "haze_opacity": "0.46",
        "bracket": "#b89adb",
        "title": "#f4eefb",
        "subtitle": "#c2a5e8",
        "tag": "#a992c4",
        "text": "#f3edf9",
        "sub": "#ad99c5",
        "orange": "#f2a45b",
        "route_glow": "#a98bca",
        "dash": "#c0a3e0",
        "node": "#151020",
        "node_stroke": "#b491d8",
        "ring": "#9472b8",
        "icon": "#d0bee4",
        "core": "#744fa0",
        "core_stroke": "#b98ddd",
        "core_icon": "#fff8ee",
        "stars": "#cfbae7",
        "desc": "A deep-space flight path",
    },
    "light": {
        "bg": "#f8f3eb",
        "grid": "#7d6d92",
        "grid_opacity": "0.13",
        "haze": "#c5afe7",
        "haze_opacity": "0.38",
        "bracket": "#5b486e",
        "title": "#271936",
        "subtitle": "#7556a4",
        "tag": "#786989",
        "text": "#281a38",
        "sub": "#746585",
        "orange": "#df8139",
        "route_glow": "#b39ccf",
        "dash": "#6f568b",
        "node": "#faf6ef",
        "node_stroke": "#80659e",
        "ring": "#80659e",
        "icon": "#604675",
        "core": "#6f4e93",
        "core_stroke": "#4d3568",
        "core_icon": "#fff8ee",
        "stars": "#8e70b4",
        "desc": "An observatory-style flight path",
    },
}

SANS = "Inter, ui-sans-serif, system-ui, sans-serif"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
SERIF = "Georgia, Times New Roman, serif"

# Route geometry (shared by both themes).
INTAKE = "M105 206C170 206 225 192 300 196"
TO_BLOCKERS = "M346 184C404 160 436 136 494 136"
TO_UNKNOWNS = "M346 210C404 236 436 262 494 262"
BLOCKERS_OUT = "M554 152C610 176 672 190 752 194"
UNKNOWNS_OUT = "M554 246C610 222 672 210 752 206"


def route(d: str, t: dict, *, dashed: bool = False, arrow: bool = False) -> str:
    glow = f'<path d="{d}" fill="none" stroke="{t["route_glow"]}" stroke-width="8" opacity="0.18"/>'
    marker = ' marker-end="url(#route-arrow)"' if arrow else ""
    if dashed:
        main = (
            f'<path d="{d}" fill="none" stroke="{t["dash"]}" stroke-width="2" '
            f'stroke-dasharray="6 7" stroke-linecap="round"{marker}/>'
        )
        return glow + "\n  " + main
    main = f'<path d="{d}" fill="none" stroke="{t["orange"]}" stroke-width="2.4"{marker}/>'
    dots = f'<path d="{d}" fill="none" stroke="{t["dash"]}" stroke-width="1" stroke-dasharray="2 10" opacity="0.74"/>'
    return "\n  ".join([glow, main, dots])


def label(y: int, title: str, sub: str, t: dict, anchor: str = "middle", x: int = 0) -> str:
    return (
        f'<text x="{x}" y="{y}" text-anchor="{anchor}" font-size="20" font-weight="720">{title}</text>\n'
        f'      <text x="{x}" y="{y + 20}" text-anchor="{anchor}" font-family="{MONO}" font-size="12" '
        f'letter-spacing="1.2" fill="{t["sub"]}">{sub}</text>'
    )


def build(theme_name: str) -> str:
    t = THEMES[theme_name]
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 350" role="img" aria-labelledby="maniflight-title maniflight-desc">
  <title id="maniflight-title">Maniflight PR flight director</title>
  <desc id="maniflight-desc">{t["desc"]} showing the Maniflight workflow: a pull request enters a read-only evidence scan that separates observed blockers from evidence gaps, and both routes converge on the next actor.</desc>
  <defs>
    <pattern id="chart-grid" width="32" height="32" patternUnits="userSpaceOnUse">
      <path d="M32 0H0V32" fill="none" stroke="{t["grid"]}" stroke-width="0.65" opacity="{t["grid_opacity"]}"/>
    </pattern>
    <radialGradient id="violet-haze" cx="50%" cy="50%" r="50%">
      <stop offset="0" stop-color="{t["haze"]}" stop-opacity="{t["haze_opacity"]}"/>
      <stop offset="1" stop-color="{t["haze"]}" stop-opacity="0"/>
    </radialGradient>
    <marker id="route-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M1 1L9 5 1 9Z" fill="{t["orange"]}"/>
    </marker>
    <filter id="blur" x="-70%" y="-70%" width="240%" height="240%">
      <feGaussianBlur stdDeviation="17"/>
    </filter>
  </defs>

  <rect width="920" height="350" fill="{t["bg"]}"/>
  <rect width="920" height="350" fill="url(#chart-grid)"/>
  <ellipse cx="330" cy="206" rx="220" ry="126" fill="url(#violet-haze)" filter="url(#blur)"/>
  <path d="M16 40V16h24M880 16h24v24M904 310v24h-24M40 334H16v-24" fill="none" stroke="{t["bracket"]}" stroke-width="1.3" opacity="0.58"/>

  <text x="42" y="48" font-family="{SANS}" font-size="28" font-weight="760" letter-spacing="-0.4" fill="{t["title"]}">MANIFLIGHT / PR FLIGHT DIRECTOR</text>
  <text x="43" y="76" font-family="{SERIF}" font-size="17" font-style="italic" fill="{t["subtitle"]}">why a pull request is grounded, and who clears it for launch</text>
  <text x="878" y="48" text-anchor="end" font-family="{MONO}" font-size="13" letter-spacing="1.6" fill="{t["tag"]}">MISSION 01</text>

  {route(INTAKE, t)}
  {route(TO_BLOCKERS, t)}
  {route(TO_UNKNOWNS, t, dashed=True)}
  {route(BLOCKERS_OUT, t, arrow=True)}
  {route(UNKNOWNS_OUT, t, dashed=True)}

  <g font-family="{SANS}" fill="{t["text"]}">
    <g transform="translate(105 206)">
      <circle r="39" fill="{t["node"]}" stroke="{t["node_stroke"]}" stroke-width="1.8"/>
      <circle r="51" fill="none" stroke="{t["ring"]}" stroke-width="1" stroke-dasharray="2 6" opacity="0.62"/>
      <circle cx="-9" cy="-14" r="5" fill="none" stroke="{t["icon"]}" stroke-width="2.2"/>
      <circle cx="-9" cy="15" r="5" fill="none" stroke="{t["icon"]}" stroke-width="2.2"/>
      <circle cx="11" cy="15" r="5" fill="none" stroke="{t["orange"]}" stroke-width="2.2"/>
      <path d="M-9-9V10M11 10V-6c0-5-3-8-8-8H-1" fill="none" stroke="{t["icon"]}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M3-19-2-14 3-9" fill="none" stroke="{t["orange"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      {label(77, "PULL REQUEST", "INTAKE", t)}
    </g>

    <g transform="translate(300 196)">
      <circle r="47" fill="{t["core"]}" stroke="{t["core_stroke"]}" stroke-width="2"/>
      <circle r="59" fill="none" stroke="{t["ring"]}" stroke-width="1" stroke-dasharray="3 7"/>
      <circle r="24" fill="none" stroke="{t["core_icon"]}" stroke-width="1.4" opacity="0.5"/>
      <circle r="13" fill="none" stroke="{t["core_icon"]}" stroke-width="1.4" opacity="0.75"/>
      <path d="M0 0 20-13" stroke="{t["orange"]}" stroke-width="2.6" stroke-linecap="round"/>
      <circle r="4.5" fill="{t["core_icon"]}"/>
      <circle cx="-11" cy="15" r="2.6" fill="{t["orange"]}"/>
      {label(87, "EVIDENCE SCAN", "READ-ONLY", t)}
    </g>

    <g transform="translate(524 136)">
      <circle r="30" fill="{t["node"]}" stroke="{t["orange"]}" stroke-width="2"/>
      <path d="M-7-15H7L15-7V7L7 15H-7L-15 7V-7Z" fill="none" stroke="{t["orange"]}" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M-5-5 5 5M5-5-5 5" stroke="{t["icon"]}" stroke-width="2.2" stroke-linecap="round"/>
      {label(-2, "BLOCKERS", "OBSERVED", t, anchor="start", x=44)}
    </g>

    <g transform="translate(524 262)">
      <circle r="30" fill="{t["node"]}" stroke="{t["node_stroke"]}" stroke-width="1.8" stroke-dasharray="5 4"/>
      <path d="M-6-6c0-5 3-8 7-8s7 3 7 7c0 6-7 6-7 11" fill="none" stroke="{t["icon"]}" stroke-width="2.2" stroke-linecap="round"/>
      <circle cx="1" cy="11" r="2.3" fill="{t["orange"]}"/>
      {label(4, "UNKNOWNS", "EVIDENCE GAPS", t, anchor="start", x=44)}
    </g>

    <g transform="translate(798 200)">
      <circle r="42" fill="{t["node"]}" stroke="{t["orange"]}" stroke-width="2"/>
      <circle r="54" fill="none" stroke="{t["ring"]}" stroke-width="1" stroke-dasharray="2 6" opacity="0.62"/>
      <circle cy="-9" r="8" fill="none" stroke="{t["icon"]}" stroke-width="2.2"/>
      <path d="M-15 17c2-9 8-13 15-13s13 4 15 13" fill="none" stroke="{t["icon"]}" stroke-width="2.2" stroke-linecap="round"/>
      <path d="M13-20 22-20M18-25 23-20 18-15" fill="none" stroke="{t["orange"]}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>
      {label(82, "NEXT ACTOR", "DISPATCH", t)}
    </g>
  </g>

  <g fill="{t["stars"]}" opacity="0.88">
    <circle cx="864" cy="98" r="1.8"/><circle cx="884" cy="121" r="2.3"/><circle cx="690" cy="104" r="1.7"/><circle cx="714" cy="88" r="2.1"/>
    <path d="M864 98l20 23M690 104l24-16" stroke="{t["stars"]}" stroke-width="1"/>
  </g>
</svg>
"""


if __name__ == "__main__":
    for theme in ("light", "dark"):
        destination = ROOT / "assets" / f"maniflight-mission-{theme}.svg"
        destination.write_text(build(theme), encoding="utf-8")
        print(f"Generated {destination.relative_to(ROOT)}")
