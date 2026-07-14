import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const OWNER = "agrovr";
const REPOSITORIES = [
  { slug: "roleforge-ai", label: "RoleForge AI", index: "01" },
  { slug: "kube-research-aiq", label: "KubeResearch AIQ", index: "02" },
];

const THEMES = {
  light: {
    background: "#f5f0e7",
    grid: "#7d688f",
    border: "#7f6794",
    primary: "#261b32",
    muted: "#5b496d",
    lavender: "#7957a0",
    orange: "#b45f1e",
    surface: "#eee6da",
  },
  dark: {
    background: "#0d0816",
    grid: "#aa8dcb",
    border: "#b89adb",
    primary: "#f4eefb",
    muted: "#c8b8dc",
    lavender: "#b895dc",
    orange: "#f2a45b",
    surface: "#171020",
  },
};

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function publicDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new Error("GitHub returned an invalid pushed_at date.");
  }
  return date.toISOString().slice(0, 10);
}

async function fetchRepository(configuration) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "agrovr-profile-atlas",
    "X-GitHub-Api-Version": "2022-11-28",
  };

  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = "Bearer " + process.env.GITHUB_TOKEN;
  }

  const url =
    "https://api.github.com/repos/" +
    encodeURIComponent(OWNER) +
    "/" +
    encodeURIComponent(configuration.slug);
  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      "GitHub API request failed for " +
        configuration.slug +
        " (" +
        response.status +
        ").",
    );
  }

  const repository = await response.json();
  if (repository.private || repository.owner?.login !== OWNER) {
    throw new Error("Refusing unexpected repository data for " + configuration.slug + ".");
  }

  return {
    ...configuration,
    language: repository.language || "Not classified",
    pushedAt: publicDate(repository.pushed_at),
  };
}

function repositoryRow(repository, y, colors) {
  const label = escapeXml(repository.label);
  const language = escapeXml(repository.language);
  const date = escapeXml(repository.pushedAt);
  const accent = repository.index === "01" ? colors.orange : colors.lavender;

  return [
    '  <g transform="translate(54 ' + y + ')">',
    '    <rect width="812" height="72" rx="8" fill="' + colors.surface + '" stroke="' + colors.border + '" stroke-width="1.2" opacity="0.98"/>',
    '    <circle cx="34" cy="36" r="15" fill="none" stroke="' + accent + '" stroke-width="2"/>',
    '    <circle cx="34" cy="36" r="5" fill="' + accent + '"/>',
    '    <path d="M34 13V5M34 67v-8M11 36H3M65 36h-8" stroke="' + accent + '" stroke-width="1.4" opacity="0.82"/>',
    '    <text x="68" y="31" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="24" font-weight="720" fill="' + colors.primary + '">' + label + '</text>',
    '    <text x="68" y="54" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="15" letter-spacing="1.1" fill="' + colors.muted + '">PUBLIC MISSION ' + repository.index + '</text>',
    '    <text x="506" y="30" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="15" text-anchor="end" fill="' + colors.muted + '">PRIMARY SYSTEM</text>',
    '    <text x="506" y="54" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="20" font-weight="680" text-anchor="end" fill="' + colors.primary + '">' + language + '</text>',
    '    <text x="778" y="30" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="15" text-anchor="end" fill="' + colors.muted + '">LAST PUBLIC PUSH</text>',
    '    <text x="778" y="54" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="20" font-weight="680" text-anchor="end" fill="' + colors.primary + '">' + date + '</text>',
    "  </g>",
  ].join("\n");
}

function renderTelemetry(theme, repositories) {
  const colors = THEMES[theme];
  const description =
    "Public GitHub telemetry for RoleForge AI and KubeResearch AIQ, showing each repository primary language and latest public push date.";
  const rows = repositories
    .map((repository, index) => repositoryRow(repository, 92 + index * 86, colors))
    .join("\n");

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 920 286" role="img" aria-labelledby="telemetry-title telemetry-desc">',
    '  <title id="telemetry-title">Orbital telemetry</title>',
    '  <desc id="telemetry-desc">' + escapeXml(description) + '</desc>',
    "  <defs>",
    '    <pattern id="telemetry-grid" width="32" height="32" patternUnits="userSpaceOnUse">',
    '      <path d="M32 0H0V32" fill="none" stroke="' + colors.grid + '" stroke-width="0.65" opacity="0.11"/>',
    "    </pattern>",
    "  </defs>",
    '  <rect width="920" height="286" fill="' + colors.background + '"/>',
    '  <rect width="920" height="286" fill="url(#telemetry-grid)"/>',
    '  <path d="M16 40V16h24M880 16h24v24M904 246v24h-24M40 270H16v-24" fill="none" stroke="' + colors.border + '" stroke-width="1.3" opacity="0.62"/>',
    '  <text x="42" y="47" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="27" font-weight="760" fill="' + colors.primary + '">ORBITAL TELEMETRY</text>',
    '  <text x="878" y="47" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="13" letter-spacing="1.5" fill="' + colors.muted + '">FIRST-PARTY / PUBLIC DATA</text>',
    '  <text x="43" y="72" font-family="Georgia, Times New Roman, serif" font-size="17" font-style="italic" fill="' + colors.lavender + '">two active systems, observed without third-party widgets</text>',
    rows,
    "</svg>",
    "",
  ].join("\n");
}

async function replaceIfChanged(relativePath, content) {
  const destination = path.join(ROOT, relativePath);
  let current = null;
  try {
    current = await readFile(destination, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (current === content) {
    return false;
  }

  const temporary = destination + ".tmp-" + process.pid;
  await writeFile(temporary, content, "utf8");
  try {
    await rename(temporary, destination);
  } catch (error) {
    await unlink(temporary).catch(() => {});
    throw error;
  }
  return true;
}

async function main() {
  // Complete every request before touching the last-good committed assets.
  const repositories = await Promise.all(REPOSITORIES.map(fetchRepository));
  const outputs = [
    ["assets/orbital-telemetry-light.svg", renderTelemetry("light", repositories)],
    ["assets/orbital-telemetry-dark.svg", renderTelemetry("dark", repositories)],
  ];

  await mkdir(path.join(ROOT, "assets"), { recursive: true });
  const changed = [];
  for (const [relativePath, content] of outputs) {
    if (await replaceIfChanged(relativePath, content)) {
      changed.push(relativePath);
    }
  }

  if (changed.length === 0) {
    console.log("Orbital telemetry is already current.");
  } else {
    console.log("Updated " + changed.join(", ") + ".");
  }
}

main().catch((error) => {
  console.error("Telemetry update failed; last-good assets were left in place.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
