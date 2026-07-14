import assert from "node:assert/strict";
import test from "node:test";
import {
  ACTIVITY_DAYS,
  activitySummary,
  activityWindow,
  buildActivityModel,
  renderActivityOrbit,
  replaceActivitySummary,
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

test("recent trajectory always contains twelve Sunday-aligned weeks", () => {
  const reference = new Date("2026-07-14T12:00:00Z");
  const model = buildActivityModel(fixture(reference), reference);
  assert.equal(model.recentDays.length, 84);
  assert.equal(new Date(model.recentStartDate + "T00:00:00Z").getUTCDay(), 0);
  assert.equal(model.recentDays.filter((day) => day.future).length, 4);
});

test("activity SVGs are deterministic, accessible, and static", () => {
  const reference = new Date("2026-07-14T12:00:00Z");
  const model = buildActivityModel(fixture(reference, (index) => (index % 13 === 0 ? 3 : 0)), reference);
  const first = renderActivityOrbit("dark", model, "desktop");
  const second = renderActivityOrbit("dark", model, "desktop");
  assert.equal(first, second);
  assert.match(first, /<title id="activity-title">Activity constellation<\/title>/);
  assert.match(first, /<desc id="activity-desc">[^<]+<\/desc>/);
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
