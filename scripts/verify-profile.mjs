import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ONLINE = process.argv.includes("--online");
const failures = [];

const REQUIRED_FILES = [
  "README.md",
  "assets/hero-light.svg",
  "assets/hero-dark.svg",
  "assets/roleforge-mission-light.svg",
  "assets/roleforge-mission-dark.svg",
  "assets/kuberesearch-mission-light.svg",
  "assets/kuberesearch-mission-dark.svg",
  "assets/orbital-telemetry-light.svg",
  "assets/orbital-telemetry-dark.svg",
  "scripts/generate-profile.mjs",
  "scripts/verify-profile.mjs",
  ".github/workflows/profile.yml",
  ".github/dependabot.yml",
];

const UNRELIABLE_WIDGETS = [
  "github-readme-stats",
  "github-readme-streak-stats",
  "github-profile-trophy",
  "github-profile-summary-cards",
  "readme-typing-svg",
  "komarev.com/ghpvc",
  "profile-counter.glitch.me",
  "spotify-github-profile",
  "activity-graph.herokuapp.com",
  "snake.svg",
  "pacman-contribution-graph",
];

const SECRET_PATTERNS = [
  { label: "GitHub token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/ },
  { label: "GitHub fine-grained token", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/ },
  { label: "Stripe live key", pattern: /\b(?:sk|rk)_live_[A-Za-z0-9]{12,}\b/ },
  { label: "Google API key", pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/ },
];

function fail(message) {
  failures.push(message);
}

async function exists(relativePath) {
  try {
    await access(path.join(ROOT, relativePath));
    return true;
  } catch {
    return false;
  }
}

function localImageReferences(readme) {
  const references = new Set();
  for (const match of readme.matchAll(/\b(?:src|srcset)="([^"]+)"/gi)) {
    const reference = match[1].trim().split(/\s+/)[0];
    if (!/^(?:https?:|data:|#)/i.test(reference)) references.add(reference);
  }
  for (const match of readme.matchAll(/!\[[^\]]*\]\(([^\s)]+)(?:\s+["'][^"']*["'])?\)/g)) {
    if (!/^(?:https?:|data:|#)/i.test(match[1])) references.add(match[1]);
  }
  return references;
}

function onlineLinks(readme) {
  const links = new Set();
  for (const match of readme.matchAll(/\bhref="(https?:\/\/[^"]+)"/gi)) {
    links.add(match[1]);
  }
  for (const match of readme.matchAll(/(?<!!)\[[^\]]+\]\((https?:\/\/[^\s)]+)(?:\s+["'][^"']*["'])?\)/g)) {
    links.add(match[1]);
  }
  return [...links].sort();
}

async function validateReadme(readme) {
  if (!readme.trim()) fail("README.md is empty.");

  const readmeInfo = await stat(path.join(ROOT, "README.md"));
  if (readmeInfo.size >= 500 * 1024) {
    fail("README.md is at or above GitHub's 500 KiB truncation threshold.");
  }

  for (const image of readme.matchAll(/<img\b[^>]*>/gi)) {
    const alt = image[0].match(/\balt="([^"]*)"/i);
    if (!alt || !alt[1].trim()) fail("Every HTML image needs meaningful alt text: " + image[0]);
  }
  for (const image of readme.matchAll(/!\[([^\]]*)\]\(/g)) {
    if (!image[1].trim()) fail("Every Markdown image needs meaningful alt text.");
  }

  for (const reference of localImageReferences(readme)) {
    const normalized = decodeURIComponent(reference.split("#")[0].split("?")[0]).replace(/^\.\//, "");
    if (!normalized || normalized.includes("..")) {
      fail("Unsafe or empty local asset reference: " + reference);
      continue;
    }
    if (!(await exists(normalized))) fail("README references a missing local asset: " + reference);
  }

  const lower = readme.toLowerCase();
  for (const widget of UNRELIABLE_WIDGETS) {
    if (lower.includes(widget)) fail("README uses a banned third-party widget pattern: " + widget);
  }
}

async function validateSvg(relativePath) {
  const source = await readFile(path.join(ROOT, relativePath), "utf8");
  if (!/<svg\b/i.test(source)) fail(relativePath + " is not an SVG document.");
  if (!/\bviewBox="[^"]+"/i.test(source)) fail(relativePath + " is missing a viewBox.");
  if (!/<title(?:\s[^>]*)?>[^<]+<\/title>/i.test(source)) fail(relativePath + " is missing a nonempty title.");
  if (!/<desc(?:\s[^>]*)?>[^<]+<\/desc>/i.test(source)) fail(relativePath + " is missing a nonempty description.");

  const forbidden = [
    { label: "script", pattern: /<script\b/i },
    { label: "foreignObject", pattern: /<foreignObject\b/i },
    { label: "embedded or remote image", pattern: /<image\b/i },
    { label: "event handler", pattern: /\son[a-z]+\s*=/i },
    { label: "external stylesheet or asset", pattern: /(?:href\s*=|url\(|@import)[^>\n]*https?:\/\//i },
    { label: "font-face", pattern: /@font-face/i },
  ];
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) fail(relativePath + " contains forbidden " + rule.label + " content.");
  }
}

async function checkUrl(url) {
  const headers = { "User-Agent": "agrovr-profile-verifier", Accept: "text/html,application/xhtml+xml,*/*" };
  const attempts = [
    { method: "HEAD", headers },
    { method: "GET", headers: { ...headers, Range: "bytes=0-1023" } },
  ];
  let last = "unknown failure";

  for (const options of attempts) {
    try {
      const response = await fetch(url, {
        ...options,
        redirect: "follow",
        signal: AbortSignal.timeout(20_000),
      });
      if (response.ok) return response.status;
      if (
        response.status === 999 &&
        ["www.linkedin.com", "linkedin.com"].includes(new URL(url).hostname)
      ) {
        return "reachable (LinkedIn bot gate 999)";
      }
      last = String(response.status) + " " + response.statusText;
      if (![403, 405, 429].includes(response.status) && response.status < 500) break;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(last);
}

async function main() {
  for (const relativePath of REQUIRED_FILES) {
    if (!(await exists(relativePath))) fail("Required file is missing: " + relativePath);
  }

  if (!(await exists("README.md"))) {
    throw new Error("README.md is required before verification can continue.");
  }

  const readme = await readFile(path.join(ROOT, "README.md"), "utf8");
  await validateReadme(readme);

  if (await exists("assets")) {
    const svgFiles = (await readdir(path.join(ROOT, "assets")))
      .filter((name) => name.toLowerCase().endsWith(".svg"))
      .sort();
    for (const name of svgFiles) await validateSvg(path.join("assets", name));
  }

  const checkedText = [readme];
  for (const relativePath of REQUIRED_FILES.filter((item) => !item.endsWith(".svg") && item !== "README.md")) {
    if (await exists(relativePath)) checkedText.push(await readFile(path.join(ROOT, relativePath), "utf8"));
  }
  const combined = checkedText.join("\n");
  for (const secret of SECRET_PATTERNS) {
    if (secret.pattern.test(combined)) fail("Possible " + secret.label + " found in committed text.");
  }

  if (ONLINE) {
    const links = onlineLinks(readme);
    console.log("Checking " + links.length + " unique public links...");
    const results = await Promise.allSettled(
      links.map(async (url) => ({ url, status: await checkUrl(url) })),
    );
    results.forEach((result, index) => {
      const url = links[index];
      if (result.status === "fulfilled") {
        console.log("  " + result.value.status + " " + url);
      } else {
        fail("Public link failed: " + url + " (" + result.reason.message + ")");
      }
    });
  }

  if (failures.length > 0) {
    console.error("\nProfile verification failed:");
    failures.forEach((message) => console.error("  - " + message));
    process.exitCode = 1;
    return;
  }

  console.log("Profile verification passed" + (ONLINE ? " with online link checks." : "."));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
