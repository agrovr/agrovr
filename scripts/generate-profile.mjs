import { mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  activityWindow,
  assertTrustedActivityContext,
  buildActivityModel,
  renderActivityOrbit,
  replaceActivitySummary,
  replaceTransmissionSummary,
} from "./profile-core.mjs";

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

function referenceDate() {
  if (!process.env.PROFILE_NOW) return new Date();
  const date = new Date(process.env.PROFILE_NOW);
  if (Number.isNaN(date.valueOf())) throw new Error("PROFILE_NOW is not a valid date.");
  return date;
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

async function fetchContributionCalendar(reference) {
  if (process.env.PROFILE_ACTIVITY_FIXTURE) {
    const fixture = JSON.parse(
      await readFile(path.resolve(ROOT, process.env.PROFILE_ACTIVITY_FIXTURE), "utf8"),
    );
    return fixture.contributionCalendar || fixture;
  }

  assertTrustedActivityContext(process.env, OWNER + "/" + OWNER);

  if (!process.env.GITHUB_TOKEN) {
    throw new Error(
      "GITHUB_TOKEN is required for the GitHub GraphQL contribution calendar. " +
        "The scheduled workflow supplies the built-in repository token.",
    );
  }

  const window = activityWindow(reference);
  const query = `
    query ProfileActivity($login: String!, $from: DateTime!, $to: DateTime!) {
      user(login: $login) {
        login
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                contributionCount
                contributionLevel
              }
            }
          }
        }
      }
    }
  `;

  const response = await fetchWithRetry(
    "https://api.github.com/graphql",
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + process.env.GITHUB_TOKEN,
        "Content-Type": "application/json",
        "User-Agent": "agrovr-profile-atlas",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({
        query,
        variables: {
          login: OWNER,
          from: window.from,
          to: window.to,
        },
      }),
    },
    "Contribution calendar request",
  );

  if (!response.ok) {
    throw new Error("GitHub GraphQL request failed (" + response.status + ").");
  }

  const payload = await response.json();
  if (Array.isArray(payload.errors) && payload.errors.length > 0) {
    throw new Error(
      "GitHub GraphQL returned: " +
        payload.errors.map((error) => error.message || "unknown error").join("; "),
    );
  }
  if (payload.data?.user?.login !== OWNER) {
    throw new Error("GitHub GraphQL returned an unexpected profile owner.");
  }

  const calendar = payload.data.user.contributionsCollection?.contributionCalendar;
  if (!calendar) throw new Error("GitHub GraphQL returned no contribution calendar.");
  return calendar;
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
  const reference = referenceDate();
  // Complete every request before touching the last-good committed assets.
  const [repositories, calendar, readme] = await Promise.all([
    Promise.all(REPOSITORIES.map(fetchRepository)),
    fetchContributionCalendar(reference),
    readFile(path.join(ROOT, "README.md"), "utf8"),
  ]);
  const activity = buildActivityModel(calendar, reference);
  const updatedReadme = replaceTransmissionSummary(
    replaceActivitySummary(readme, activity),
    repositories,
  );

  const outputs = [
    ["assets/activity-orbit-light.svg", renderActivityOrbit("light", activity, "desktop")],
    ["assets/activity-orbit-dark.svg", renderActivityOrbit("dark", activity, "desktop")],
    ["assets/activity-orbit-mobile-light.svg", renderActivityOrbit("light", activity, "mobile")],
    ["assets/activity-orbit-mobile-dark.svg", renderActivityOrbit("dark", activity, "mobile")],
    ["README.md", updatedReadme],
  ];

  await mkdir(path.join(ROOT, "assets"), { recursive: true });
  const changed = [];
  for (const [relativePath, content] of outputs) {
    if (await replaceIfChanged(relativePath, content)) changed.push(relativePath);
  }

  if (changed.length === 0) {
    console.log("Orbital signals are already current.");
  } else {
    console.log("Updated " + changed.join(", ") + ".");
  }
}

main().catch((error) => {
  console.error("Profile signal update failed; last-good assets were left in place.");
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
