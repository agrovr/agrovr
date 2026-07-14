import assert from "node:assert/strict";
import test from "node:test";
import {
  replaceTransmissionSummary,
  transmissionSummary,
} from "./profile-core.mjs";

const REPOSITORIES = [
  {
    slug: "roleforge-ai",
    label: "RoleForge AI",
    language: "TypeScript",
    pushedAt: "2026-07-14",
  },
];

test("recent transmissions render factual repository telemetry inside bounded markers", () => {
  assert.match(transmissionSummary(REPOSITORIES), /RoleForge AI.*TypeScript.*2026-07-14/);
  const readme =
    "before\n<!-- transmission-summary:start -->\nold\n<!-- transmission-summary:end -->\nafter\n";
  const replaced = replaceTransmissionSummary(readme, REPOSITORIES);
  assert.match(replaced, /\| Mission \| Primary language \| Last public push \|/);
  assert.match(replaced, /after\n$/);
});

test("recent transmissions reject unsafe slugs and escape markdown cells", () => {
  assert.throws(
    () => transmissionSummary([{ ...REPOSITORIES[0], slug: "../private" }]),
    /unsafe repository slug/,
  );
  assert.match(
    transmissionSummary([{ ...REPOSITORIES[0], label: "Role|Forge", language: "Type\nScript" }]),
    /Role\\\|Forge.*Type Script/,
  );
});

test("recent transmission markers must exist once and in order", () => {
  assert.throws(
    () => replaceTransmissionSummary("README without markers", REPOSITORIES),
    /missing or out of order/,
  );
  assert.throws(
    () =>
      replaceTransmissionSummary(
        "<!-- transmission-summary:start -->\n<!-- transmission-summary:start -->\n<!-- transmission-summary:end -->",
        REPOSITORIES,
      ),
    /must be unique/,
  );
});
