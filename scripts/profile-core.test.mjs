import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_DAYS,
  DISPLAY_WEEKS,
  activitySummary,
  activityWindow,
  assertTrustedActivityContext,
  buildActivityModel,
  renderActivityOrbit,
  replaceActivitySummary,
  replaceTransmissionSummary,
  transmissionSummary,
  validateContributionCalendar,
} from "./profile-core.mjs";

const DAY_MS = 24 * 60 * 60 * 1000;

function fixture(reference, countForIndex = () => 0) {
  const window = activityWindow(reference);
  const days = Array.from({ length: ACTIVITY_DAYS }, (_, index) => {
    const date = new Date(window.first.valueOf() + index * DAY_MS).toISOString().slice(0, 10);
    const contributionCount = countForIndex(index);
    return {
      date,
      contributionCount,
      contributionLevel: contributionCount > 0 ? "FIRST_QUARTILE" : "NONE",
    };
  });
  return { totalContributions: days.reduce((sum, day) => sum + day.contributionCount, 0), weeks: [{ contributionDays: days }] };
}

test("live activity generation is restricted to the profile repository workflow", () => {
  assert.doesNotThrow(() =>
    assertTrustedActivityContext({
      GITHUB_ACTIONS: "true",
      GITHUB_REPOSITORY: "agrovr/agrovr",
    }),
  );
  assert.throws(
    () =>
      assertTrustedActivityContext({
        GITHUB_ACTIONS: "false",
        GITHUB_REPOSITORY: "agrovr/agrovr",
      }),
    /restricted.*GitHub Actions context/i,
  );
  assert.throws(
    () =>
      assertTrustedActivityContext({
        GITHUB_ACTIONS: "true",
        GITHUB_REPOSITORY: "someone/else",
      }),
    /restricted.*GitHub Actions context/i,
  );
});

test("activity window is a deterministic trailing 365-day UTC range", () => {
  const window = activityWindow("2024-03-01T19:00:00-06:00");
  assert.equal(window.from, "2023-03-04T00:00:00Z");
  assert.equal(window.to, "2024-03-02T23:59:59Z");
});

test("activity metrics calculate current and longest signals", () => {
  const reference = new Date("2026-07-14T12:00:00Z");
  const calendar = fixture(reference, (index) => {
    if (index >= 20 && index <= 24) return 2;
    if (index >= 363) return 1;
    return 0;
  });
  const model = buildActivityModel(calendar, reference);
  assert.equal(model.totalContributions, 12);
  assert.equal(model.activeDays, 7);
  assert.equal(model.currentStreak, 2);
  assert.equal(model.longestStreak, 5);
});

test("an unfinished zero-count UTC day keeps yesterday's current signal", () => {
  const reference = new Date("2026-07-14T02:00:00Z");
  const calendar = fixture(reference, (index) => (index === 362 || index === 363 ? 1 : 0));
  const model = buildActivityModel(calendar, reference);
  assert.equal(model.currentStreak, 2);
  assert.equal(model.currentStreakDates.has(model.throughDate), false);
});

test("flight recorder always contains fifty-three Sunday-aligned weeks", () => {
  const reference = new Date("2026-07-14T12:00:00Z");
  const model = buildActivityModel(fixture(reference), reference);
  assert.equal(model.yearDays.length, DISPLAY_WEEKS * 7);
  assert.equal(new Date(model.yearStartDate + "T00:00:00Z").getUTCDay(), 0);
  assert.equal(model.yearDays.filter((day) => day.outside).length, 6);
  assert.equal(model.yearDays.filter((day) => day.future).length, 4);
});

test("activity SVGs are deterministic, accessible, and static", () => {
  const reference = new Date("2026-07-14T12:00:00Z");
  const model = buildActivityModel(fixture(reference, (index) => (index % 13 === 0 ? 3 : 0)), reference);
  const first = renderActivityOrbit("dark", model, "desktop");
  const second = renderActivityOrbit("dark", model, "desktop");
  assert.equal(first, second);
  assert.match(first, /<title id="activity-title">Activity constellation<\/title>/);
  assert.match(first, /<desc id="activity-desc">[^<]+<\/desc>/);
  assert.match(first, /fifty-three-week constellation/);
  assert.doesNotMatch(first, /<animate|@keyframes|<script/i);
  assert.match(renderActivityOrbit("light", model, "mobile"), /viewBox="0 0 600 720"/);
});

test("README summary replacement is bounded by unique markers", () => {
  const reference = new Date("2026-07-14T12:00:00Z");
  const model = buildActivityModel(fixture(reference, (index) => (index === 364 ? 1 : 0)), reference);
  const readme = "before\n<!-- activity-summary:start -->\nold\n<!-- activity-summary:end -->\nafter\n";
  const replaced = replaceActivitySummary(readme, model);
  assert.match(replaced, /before[\s\S]+1 publicly visible contribution/);
  assert.match(replaced, /after\n$/);
  assert.equal(activitySummary(model).includes("2026-07-14 UTC"), true);
});

test("recent transmissions render factual repository telemetry inside bounded markers", () => {
  const repositories = [
    {
      slug: "roleforge-ai",
      label: "RoleForge AI",
      language: "TypeScript",
      pushedAt: "2026-07-14",
    },
  ];
  assert.match(transmissionSummary(repositories), /RoleForge AI.*TypeScript.*2026-07-14/);
  const readme =
    "before\n<!-- transmission-summary:start -->\nold\n<!-- transmission-summary:end -->\nafter\n";
  const replaced = replaceTransmissionSummary(readme, repositories);
  assert.match(replaced, /\| Mission \| Primary language \| Last public push \|/);
  assert.match(replaced, /after\n$/);
  assert.throws(
    () => transmissionSummary([{ ...repositories[0], slug: "../private" }]),
    /unsafe repository slug/,
  );
});

test("calendar validation rejects duplicate and incomplete data", () => {
  const reference = new Date("2026-07-14T12:00:00Z");
  const calendar = fixture(reference);
  calendar.weeks[0].contributionDays[1].date = calendar.weeks[0].contributionDays[0].date;
  assert.throws(() => validateContributionCalendar(calendar, reference), /duplicate|ordered/);
  assert.throws(
    () => validateContributionCalendar({ weeks: [{ contributionDays: [] }] }, reference),
    /expected 365/,
  );
});
