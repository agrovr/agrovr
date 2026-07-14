import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const ONLINE = process.argv.includes("--online");
const failures = [];

const REQUIRED_FILES = [
  "README.md",
  "assets/hero-light.svg",
  "assets/hero-dark.svg",
  "assets/hero-motion-light.webp",
  "assets/hero-motion-dark.webp",
  "assets/hero-motion-mobile-light.webp",
  "assets/hero-motion-mobile-dark.webp",
  "assets/roleforge-mission-light.svg",
  "assets/roleforge-mission-dark.svg",
  "assets/kuberesearch-mission-light.svg",
  "assets/kuberesearch-mission-dark.svg",
  "assets/activity-orbit-light.svg",
  "assets/activity-orbit-dark.svg",
  "assets/activity-orbit-mobile-light.svg",
  "assets/activity-orbit-mobile-dark.svg",
  "scripts/generate-profile.mjs",
  "scripts/profile-core.mjs",
  "scripts/profile-core.test.mjs",
  "scripts/generate-hero-motion.py",
  "scripts/verify-profile.mjs",
  "requirements-motion.txt",
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

  for (const marker of [
    "<!-- activity-summary:start -->",
    "<!-- activity-summary:end -->",
    "<!-- transmission-summary:start -->",
    "<!-- transmission-summary:end -->",
  ]) {
    if (readme.split(marker).length !== 2) {
      fail("README must contain exactly one " + marker + " marker.");
    }
  }
  if (!readme.includes("Decode the activity signal")) {
    fail("README is missing the accessible activity-signal explanation.");
  }
  if (!readme.includes("prefers-reduced-motion: reduce")) {
    fail("README is missing the static reduced-motion hero fallback.");
  }
  const firstAnimatedHero = readme.indexOf("hero-motion-mobile-dark.webp");
  for (const staticSource of [
    '(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="./assets/hero-dark.svg',
    '(prefers-reduced-motion: reduce) and (prefers-color-scheme: light)" srcset="./assets/hero-light.svg',
  ]) {
    const staticIndex = readme.indexOf(staticSource);
    if (staticIndex < 0 || firstAnimatedHero < 0 || staticIndex > firstAnimatedHero) {
      fail("README reduced-motion sources must precede every animated hero source.");
    }
  }
  if ((readme.match(/type="image\/webp"/g) || []).length !== 4) {
    fail("README must declare all four animated hero sources as WebP.");
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
    { label: "unsupported SVG animation", pattern: /<animate(?:Motion|Transform)?\b|@keyframes|\banimation\s*:/i },
  ];
  for (const rule of forbidden) {
    if (rule.pattern.test(source)) fail(relativePath + " contains forbidden " + rule.label + " content.");
  }
}

function readUInt24LE(source, offset) {
  return source[offset] | (source[offset + 1] << 8) | (source[offset + 2] << 16);
}

async function validateWebp(relativePath) {
  const source = await readFile(path.join(ROOT, relativePath));
  if (
    source.subarray(0, 4).toString("ascii") !== "RIFF" ||
    source.subarray(8, 12).toString("ascii") !== "WEBP"
  ) {
    fail(relativePath + " is not a valid WebP document.");
    return;
  }
  if (source.readUInt32LE(4) + 8 !== source.length) {
    fail(relativePath + " has an invalid RIFF length.");
  }
  const isMobileHero = relativePath.includes("hero-motion-mobile-");
  const sizeBudget = isMobileHero ? 750 * 1024 : 2 * 1024 * 1024;
  if (source.length > sizeBudget) {
    fail(relativePath + " exceeds its lossless WebP motion budget.");
  }

  let width = null;
  let height = null;
  let frames = 0;
  let animationFlag = false;
  let animationHeader = false;
  let infiniteLoop = false;
  let malformedChunk = false;
  let offset = 12;
  while (offset + 8 <= source.length) {
    const type = source.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = source.readUInt32LE(offset + 4);
    const dataOffset = offset + 8;
    const chunkEnd = dataOffset + chunkSize;
    if (chunkEnd > source.length) {
      malformedChunk = true;
      break;
    }
    if (type === "VP8X" && chunkSize >= 10) {
      animationFlag = (source[dataOffset] & 0x02) !== 0;
      width = readUInt24LE(source, dataOffset + 4) + 1;
      height = readUInt24LE(source, dataOffset + 7) + 1;
    }
    if (type === "ANIM" && chunkSize >= 6) {
      animationHeader = true;
      infiniteLoop = source.readUInt16LE(dataOffset + 4) === 0;
    }
    if (type === "ANMF") {
      frames += 1;
      if (chunkSize < 24) {
        malformedChunk = true;
      } else {
        const duration = readUInt24LE(source, dataOffset + 12);
        if (duration !== 188) {
          fail(relativePath + " frame " + frames + " must last exactly 188 ms.");
        }
        let frameOffset = dataOffset + 16;
        let losslessFrame = false;
        while (frameOffset + 8 <= chunkEnd) {
          const frameType = source.subarray(frameOffset, frameOffset + 4).toString("ascii");
          const frameSize = source.readUInt32LE(frameOffset + 4);
          const frameEnd = frameOffset + 8 + frameSize;
          if (frameEnd > chunkEnd) {
            malformedChunk = true;
            break;
          }
          if (frameType === "VP8L") losslessFrame = true;
          frameOffset = frameEnd + (frameSize % 2);
        }
        if (!losslessFrame) {
          fail(relativePath + " frame " + frames + " is not lossless VP8L.");
        }
      }
    }
    offset = dataOffset + chunkSize + (chunkSize % 2);
  }
  if (malformedChunk || offset !== source.length) {
    fail(relativePath + " contains a malformed WebP chunk boundary.");
  }

  const expectedWidth = isMobileHero ? 900 : 1800;
  const expectedHeight = isMobileHero ? 378 : 756;
  if (width !== expectedWidth || height !== expectedHeight) {
    fail(relativePath + " must be " + expectedWidth + " by " + expectedHeight + " pixels.");
  }
  if (!animationFlag || !animationHeader) {
    fail(relativePath + " is missing WebP animation metadata.");
  }
  if (!infiniteLoop) fail(relativePath + " must loop continuously.");
  if (frames !== 32) fail(relativePath + " must contain exactly 32 animation frames.");
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
    const assetFiles = await readdir(path.join(ROOT, "assets"));
    const svgFiles = assetFiles.filter((name) => name.toLowerCase().endsWith(".svg")).sort();
    const webpFiles = assetFiles.filter((name) => name.toLowerCase().endsWith(".webp")).sort();
    const gifFiles = assetFiles.filter((name) => name.toLowerCase().endsWith(".gif")).sort();
    for (const name of svgFiles) await validateSvg(path.join("assets", name));
    for (const name of webpFiles) await validateWebp(path.join("assets", name));
    if (gifFiles.length > 0) {
      fail("Obsolete palette GIF assets remain: " + gifFiles.join(", ") + ".");
    }
  }

  const checkedText = [readme];
  for (const relativePath of REQUIRED_FILES.filter((item) => !/\.(?:svg|webp)$/i.test(item) && item !== "README.md")) {
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
