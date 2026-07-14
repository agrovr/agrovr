import { readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { replaceTransmissionSummary } from "./profile-core.mjs";

const ROOT = process.cwd();
const OWNER = "agrovr";
const REPOSITORIES = [
  { slug: "roleforge-ai", label: "RoleForge AI" },
  { slug: "kube-research-aiq", label: "KubeResearch AIQ" },
];

function publicDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    throw new Error("GitHub returned an invalid pushed_at date.");
  }
  return date.toISOString().slice(0, 10);
}

async function fetchWithRetry(url, options, label) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...options,
        signal: AbortSignal.timeout(15_000),
      });
      if (response.ok || ![429, 500, 502, 503, 504].includes(response.status) || attempt === 1) {
        return response;
      }
      lastError = new Error(label + " returned " + response.status + ".");
    } catch (error) {
      lastError = error;
      if (attempt === 1) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw lastError || new Error(label + " failed.");
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
  const response = await fetchWithRetry(url, { headers }, "Repository telemetry request");

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

async function replaceIfChanged(relativePath, content) {
  const destination = path.join(ROOT, relativePath);
  let current = null;
  try {
    current = await readFile(destination, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  if (current === content) return false;

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
  // Resolve every public request before touching the last-good committed README.
  const [repositories, readme] = await Promise.all([
    Promise.all(REPOSITORIES.map(fetchRepository)),
    readFile(path.join(ROOT, "README.md"), "utf8"),
  ]);
  const updatedReadme = replaceTransmissionSummary(readme, repositories);

  if (await replaceIfChanged("README.md", updatedReadme)) {
    console.log("Updated README.md with current public mission status.");
  } else {
    console.log("Public mission status is already current.");
  }
}

main().catch((error) => {
  console.error("Profile status update failed; the last-good README was left in place.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
