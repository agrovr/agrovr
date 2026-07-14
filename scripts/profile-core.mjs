const DAY_MS = 24 * 60 * 60 * 1000;

export const ACTIVITY_DAYS = 365;
export const RECENT_WEEKS = 12;

export function assertTrustedActivityContext(
  environment,
  expectedRepository = "agrovr/agrovr",
) {
  if (
    environment.GITHUB_ACTIONS !== "true" ||
    environment.GITHUB_REPOSITORY !== expectedRepository
  ) {
    throw new Error(
      "Live contribution generation is restricted to the " +
        expectedRepository +
        " GitHub Actions context. Use PROFILE_ACTIVITY_FIXTURE for local rendering.",
    );
  }
}

export const THEMES = {
  light: {
    background: "#f5f0e7",
    grid: "#7d688f",
    border: "#7f6794",
    primary: "#261b32",
    muted: "#5b496d",
    lavender: "#7957a0",
    orange: "#b45f1e",
    surface: "#eee6da",
    levels: ["#cdbed8", "#ad91c2", "#8d6cad", "#654486"],
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
    levels: ["#5f4a73", "#80629a", "#a17ac2", "#c7a0eb"],
  },
};

const LEVEL_INDEX = {
  FIRST_QUARTILE: 0,
  SECOND_QUARTILE: 1,
  THIRD_QUARTILE: 2,
  FOURTH_QUARTILE: 3,
};

export function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function startOfUtcDay(value) {
  const date = value instanceof Date ? new Date(value.valueOf()) : new Date(value);
  if (Number.isNaN(date.valueOf())) throw new Error("Invalid activity reference date.");
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, amount) {
  return new Date(date.valueOf() + amount * DAY_MS);
}

function utcDate(value) {
  return startOfUtcDay(value).toISOString().slice(0, 10);
}

function parseCalendarDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error("Contribution calendar returned an invalid date.");
  }
  const date = new Date(value + "T00:00:00Z");
  if (Number.isNaN(date.valueOf()) || utcDate(date) !== value) {
    throw new Error("Contribution calendar returned an impossible date.");
  }
  return date;
}

export function activityWindow(reference = new Date()) {
  const today = startOfUtcDay(reference);
  const first = addUtcDays(today, -(ACTIVITY_DAYS - 1));
  return {
    today,
    first,
    from: utcDate(first) + "T00:00:00Z",
    to: utcDate(today) + "T23:59:59Z",
  };
}

export function validateContributionCalendar(calendar, reference = new Date()) {
  if (!calendar || !Array.isArray(calendar.weeks)) {
    throw new Error("GitHub returned no contribution calendar.");
  }

  const window = activityWindow(reference);
  const expectedFirst = utcDate(window.first);
  const expectedLast = utcDate(window.today);
  const allowedLevels = new Set(["NONE", ...Object.keys(LEVEL_INDEX)]);
  const days = calendar.weeks.flatMap((week) => week?.contributionDays || []);

  if (days.length !== ACTIVITY_DAYS) {
    throw new Error(
      "Contribution calendar returned " + days.length + " days; expected " + ACTIVITY_DAYS + ".",
    );
  }

  const seen = new Set();
  let previous = null;
  const normalized = days.map((day) => {
    const date = String(day?.date || "");
    parseCalendarDate(date);
    if (seen.has(date)) throw new Error("Contribution calendar returned duplicate date " + date + ".");
    if (previous && date <= previous) throw new Error("Contribution calendar dates are not ordered.");
    seen.add(date);
    previous = date;

    if (!Number.isInteger(day?.contributionCount) || day.contributionCount < 0) {
      throw new Error("Contribution calendar returned an invalid count for " + date + ".");
    }
    const contributionLevel = String(day?.contributionLevel || "");
    if (!allowedLevels.has(contributionLevel)) {
      throw new Error("Contribution calendar returned an invalid level for " + date + ".");
    }

    return {
      date,
      contributionCount: day.contributionCount,
      contributionLevel,
    };
  });

  if (normalized[0].date !== expectedFirst || normalized.at(-1).date !== expectedLast) {
    throw new Error(
      "Contribution calendar range mismatch: " +
        normalized[0].date +
        " through " +
        normalized.at(-1).date +
        ".",
    );
  }

  return normalized;
}

function streakMetrics(days) {
  let longest = 0;
  let run = 0;
  let longestTouchesStart = false;
  let runStartedAtZero = false;

  days.forEach((day, index) => {
    if (day.contributionCount > 0) {
      if (run === 0) runStartedAtZero = index === 0;
      run += 1;
      if (run > longest) {
        longest = run;
        longestTouchesStart = runStartedAtZero;
      }
    } else {
      run = 0;
      runStartedAtZero = false;
    }
  });

  let end = days.length - 1;
  // Do not break a signal merely because the current UTC day is unfinished.
  if (days[end].contributionCount === 0) end -= 1;
  let current = 0;
  while (end >= 0 && days[end].contributionCount > 0) {
    current += 1;
    end -= 1;
  }

  return {
    current,
    currentTouchesStart: current > 0 && end < 0,
    longest,
    longestTouchesStart,
  };
}

function formatNumber(value) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" })
    .format(date)
    .toUpperCase();
}

function formatRangeDate(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function buildActivityModel(calendar, reference = new Date()) {
  const days = validateContributionCalendar(calendar, reference);
  const window = activityWindow(reference);
  const streaks = streakMetrics(days);
  const activeDays = days.filter((day) => day.contributionCount > 0).length;
  const totalContributions = days.reduce((sum, day) => sum + day.contributionCount, 0);

  const currentStreakStartIndex = Math.max(
    0,
    days.length - streaks.current - (days.at(-1).contributionCount === 0 ? 1 : 0),
  );
  const currentStreakDates = new Set(
    streaks.current > 0
      ? days.slice(currentStreakStartIndex, currentStreakStartIndex + streaks.current).map((day) => day.date)
      : [],
  );

  const weekStart = addUtcDays(window.today, -window.today.getUTCDay());
  const recentStart = addUtcDays(weekStart, -(RECENT_WEEKS - 1) * 7);
  const dayByDate = new Map(days.map((day) => [day.date, day]));
  const recentDays = Array.from({ length: RECENT_WEEKS * 7 }, (_, index) => {
    const dateObject = addUtcDays(recentStart, index);
    const date = utcDate(dateObject);
    return (
      dayByDate.get(date) || {
        date,
        contributionCount: 0,
        contributionLevel: "NONE",
        future: dateObject > window.today,
      }
    );
  });

  const monthLabels = [];
  for (let week = 0; week < RECENT_WEEKS; week += 1) {
    const date = addUtcDays(recentStart, week * 7);
    const month = formatMonth(date);
    if (week === 0 || month !== monthLabels.at(-1)?.month) {
      monthLabels.push({ week, month });
    }
  }

  return {
    days,
    recentDays,
    monthLabels,
    currentStreakDates,
    firstDate: days[0].date,
    throughDate: days.at(-1).date,
    recentStartDate: utcDate(recentStart),
    totalContributions,
    activeDays,
    currentStreak: streaks.current,
    currentStreakLabel: String(streaks.current) + (streaks.currentTouchesStart ? "+" : ""),
    longestStreak: streaks.longest,
    longestStreakLabel: String(streaks.longest) + (streaks.longestTouchesStart ? "+" : ""),
    totalContributionsLabel: formatNumber(totalContributions),
    rangeLabel: formatRangeDate(window.first) + " — " + formatRangeDate(window.today),
  };
}

function dayPosition(index, layout) {
  const week = Math.floor(index / 7);
  const weekday = index % 7;
  return {
    week,
    weekday,
    x: layout.chartX + week * layout.weekGap,
    y: layout.chartY + weekday * layout.dayGap,
  };
}

function renderDay(day, index, layout, colors, currentStreakDates, throughDate) {
  const { x, y } = dayPosition(index, layout);
  const title =
    day.date +
    (day.future
      ? ": future UTC day"
      : ": " + day.contributionCount + " visible contribution" + (day.contributionCount === 1 ? "" : "s"));

  if (day.future) {
    return [
      '    <g opacity="0.28">',
      '      <circle cx="' + x + '" cy="' + y + '" r="3" fill="none" stroke="' + colors.border + '"/>',
      '      <path d="M' + (x - 3) + " " + y + "H" + (x + 3) + '" stroke="' + colors.border + '" stroke-width="1"/>',
      "      <title>" + escapeXml(title) + "</title>",
      "    </g>",
    ].join("\n");
  }

  const isCurrent = currentStreakDates.has(day.date);
  const isToday = day.date === throughDate;
  if (day.contributionCount === 0) {
    return [
      '    <circle cx="' + x + '" cy="' + y + '" r="3.2" fill="' + colors.surface + '" stroke="' + colors.border + '" stroke-width="1" opacity="0.62">',
      "      <title>" + escapeXml(title) + "</title>",
      "    </circle>",
    ].join("\n");
  }

  const level = LEVEL_INDEX[day.contributionLevel] ?? 0;
  const radius = [5, 6.5, 8, 9.5][level];
  const fill = isCurrent ? colors.orange : colors.levels[level];
  return [
    '    <g>',
    isToday
      ? '      <circle cx="' + x + '" cy="' + y + '" r="14" fill="none" stroke="' + colors.orange + '" stroke-width="1.5" opacity="0.72"/>'
      : "",
    '      <circle cx="' + x + '" cy="' + y + '" r="' + radius + '" fill="' + fill + '" stroke="' + colors.background + '" stroke-width="1.2">',
    "        <title>" + escapeXml(title) + "</title>",
    "      </circle>",
    "    </g>",
  ]
    .filter(Boolean)
    .join("\n");
}

function currentSignalPath(model, layout, colors) {
  const points = model.recentDays
    .map((day, index) => ({ day, ...dayPosition(index, layout) }))
    .filter(({ day }) => model.currentStreakDates.has(day.date));
  if (points.length < 2) return "";
  const path = points.map((point, index) => (index === 0 ? "M" : "L") + point.x + " " + point.y).join(" ");
  return (
    '  <path d="' +
    path +
    '" fill="none" stroke="' +
    colors.orange +
    '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity="0.62"/>'
  );
}

function metric(label, value, x, y, colors, anchor = "start") {
  return [
    '  <text x="' + x + '" y="' + y + '" text-anchor="' + anchor + '" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="16" letter-spacing="1.2" fill="' + colors.muted + '">' + escapeXml(label) + "</text>",
    '  <text x="' + x + '" y="' + (y + 35) + '" text-anchor="' + anchor + '" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="30" font-weight="760" fill="' + colors.primary + '">' + escapeXml(value) + "</text>",
  ].join("\n");
}

function renderDesktopActivity(theme, model) {
  const colors = THEMES[theme];
  const layout = { chartX: 72, chartY: 137, weekGap: 47, dayGap: 33 };
  const days = model.recentDays
    .map((day, index) => renderDay(day, index, layout, colors, model.currentStreakDates, model.throughDate))
    .join("\n");
  const months = model.monthLabels
    .map(({ week, month }) => {
      const x = layout.chartX + week * layout.weekGap;
      return '  <text x="' + x + '" y="108" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14" letter-spacing="1.2" fill="' + colors.muted + '">' + month + "</text>";
    })
    .join("\n");
  const current = model.currentStreakLabel + " DAY" + (model.currentStreak === 1 ? "" : "S");
  const longest = model.longestStreakLabel + " DAY" + (model.longestStreak === 1 ? "" : "S");
  const description =
    "A twelve-week constellation of publicly visible GitHub contribution days, with " +
    model.totalContributionsLabel +
    " contributions across " +
    model.activeDays +
    " active days in the trailing year, a current signal of " +
    model.currentStreakLabel +
    " days, and a longest signal of " +
    model.longestStreakLabel +
    " days.";

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 410" role="img" aria-labelledby="activity-title activity-desc">',
    '  <title id="activity-title">Activity constellation</title>',
    '  <desc id="activity-desc">' + escapeXml(description) + "</desc>",
    "  <defs>",
    '    <pattern id="activity-grid" width="32" height="32" patternUnits="userSpaceOnUse">',
    '      <path d="M32 0H0V32" fill="none" stroke="' + colors.grid + '" stroke-width="0.65" opacity="0.1"/>',
    "    </pattern>",
    "  </defs>",
    '  <rect width="1000" height="410" fill="' + colors.background + '"/>',
    '  <rect width="1000" height="410" fill="url(#activity-grid)"/>',
    '  <path d="M16 40V16h24M960 16h24v24M984 370v24h-24M40 394H16v-24" fill="none" stroke="' + colors.border + '" stroke-width="1.3" opacity="0.62"/>',
    '  <text x="44" y="50" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="30" font-weight="760" fill="' + colors.primary + '">ACTIVITY CONSTELLATION</text>',
    '  <text x="45" y="78" font-family="Georgia, Times New Roman, serif" font-size="18" font-style="italic" fill="' + colors.lavender + '">twelve-week trajectory · trailing-year signal metrics</text>',
    '  <text x="956" y="50" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14" letter-spacing="1.3" fill="' + colors.muted + '">VISIBLE GITHUB SIGNAL / UTC</text>',
    months,
    '  <path d="M55 248C180 90 430 330 624 144" fill="none" stroke="' + colors.lavender + '" stroke-width="1" stroke-dasharray="3 8" opacity="0.26"/>',
    currentSignalPath(model, layout, colors),
    '  <g aria-label="Recent contribution days">',
    days,
    "  </g>",
    '  <path d="M656 104V344" stroke="' + colors.border + '" stroke-width="1" opacity="0.42"/>',
    metric("CURRENT SIGNAL", current, 700, 115, colors),
    metric("LONGEST ARC / 365D", longest, 700, 178, colors),
    metric("ACTIVE DAYS / 365D", model.activeDays + " / 365", 700, 241, colors),
    metric("CONTRIBUTIONS / 365D", model.totalContributionsLabel, 700, 304, colors),
    '  <circle cx="50" cy="373" r="4" fill="' + colors.orange + '"/>',
    '  <text x="64" y="378" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14" letter-spacing="1" fill="' + colors.muted + '">CURRENT SIGNAL</text>',
    '  <text x="956" y="378" text-anchor="end" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14" letter-spacing="1" fill="' + colors.muted + '">' + escapeXml(model.rangeLabel.toUpperCase()) + " / UTC</text>",
    "</svg>",
    "",
  ].join("\n");
}

function renderMobileActivity(theme, model) {
  const colors = THEMES[theme];
  const layout = { chartX: 52, chartY: 154, weekGap: 45, dayGap: 39 };
  const days = model.recentDays
    .map((day, index) => renderDay(day, index, layout, colors, model.currentStreakDates, model.throughDate))
    .join("\n");
  const months = model.monthLabels
    .map(({ week, month }) => {
      const x = layout.chartX + week * layout.weekGap;
      return '  <text x="' + x + '" y="116" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="17" letter-spacing="1" fill="' + colors.muted + '">' + month + "</text>";
    })
    .join("\n");
  const current = model.currentStreakLabel + " DAY" + (model.currentStreak === 1 ? "" : "S");
  const longest = model.longestStreakLabel + " DAY" + (model.longestStreak === 1 ? "" : "S");

  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 720" role="img" aria-labelledby="activity-mobile-title activity-mobile-desc">',
    '  <title id="activity-mobile-title">Activity constellation</title>',
    '  <desc id="activity-mobile-desc">A mobile activity constellation showing a twelve-week contribution trajectory and trailing-year signal metrics through ' + escapeXml(model.throughDate) + ".</desc>",
    "  <defs>",
    '    <pattern id="activity-mobile-grid" width="30" height="30" patternUnits="userSpaceOnUse">',
    '      <path d="M30 0H0V30" fill="none" stroke="' + colors.grid + '" stroke-width="0.65" opacity="0.1"/>',
    "    </pattern>",
    "  </defs>",
    '  <rect width="600" height="720" fill="' + colors.background + '"/>',
    '  <rect width="600" height="720" fill="url(#activity-mobile-grid)"/>',
    '  <path d="M16 40V16h24M560 16h24v24M584 680v24h-24M40 704H16v-24" fill="none" stroke="' + colors.border + '" stroke-width="1.4" opacity="0.62"/>',
    '  <text x="36" y="54" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="34" font-weight="760" fill="' + colors.primary + '">ACTIVITY CONSTELLATION</text>',
    '  <text x="37" y="84" font-family="Georgia, Times New Roman, serif" font-size="20" font-style="italic" fill="' + colors.lavender + '">twelve-week trajectory · UTC</text>',
    months,
    '  <path d="M38 286C170 112 360 434 562 206" fill="none" stroke="' + colors.lavender + '" stroke-width="1.2" stroke-dasharray="3 8" opacity="0.26"/>',
    currentSignalPath(model, layout, colors),
    '  <g aria-label="Recent contribution days">',
    days,
    "  </g>",
    '  <path d="M36 455H564" stroke="' + colors.border + '" stroke-width="1" opacity="0.42"/>',
    metric("CURRENT SIGNAL", current, 48, 500, colors),
    metric("LONGEST ARC / 365D", longest, 326, 500, colors),
    metric("ACTIVE DAYS / 365D", model.activeDays + " / 365", 48, 602, colors),
    metric("CONTRIBUTIONS / 365D", model.totalContributionsLabel, 326, 602, colors),
    '  <circle cx="40" cy="683" r="5" fill="' + colors.orange + '"/>',
    '  <text x="56" y="689" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="16" letter-spacing="1" fill="' + colors.muted + '">CURRENT SIGNAL · THROUGH ' + escapeXml(model.throughDate) + " UTC</text>",
    "</svg>",
    "",
  ].join("\n");
}

export function renderActivityOrbit(theme, model, layout = "desktop") {
  if (!THEMES[theme]) throw new Error("Unknown activity theme " + theme + ".");
  if (layout === "desktop") return renderDesktopActivity(theme, model);
  if (layout === "mobile") return renderMobileActivity(theme, model);
  throw new Error("Unknown activity layout " + layout + ".");
}

export function activitySummary(model) {
  const current = model.currentStreakLabel + "-day current signal";
  const longest = model.longestStreakLabel + "-day longest arc";
  return (
    "**Signal summary:** **" +
    model.totalContributionsLabel +
    " publicly visible contributions** across **" +
    model.activeDays +
    " active days** in the last 365 days · **" +
    current +
    "** · **" +
    longest +
    "** · through **" +
    model.throughDate +
    " UTC**."
  );
}

export function replaceActivitySummary(readme, model) {
  const start = "<!-- activity-summary:start -->";
  const end = "<!-- activity-summary:end -->";
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error("README activity summary markers are missing or out of order.");
  }
  if (readme.indexOf(start, startIndex + start.length) >= 0 || readme.indexOf(end, endIndex + end.length) >= 0) {
    throw new Error("README activity summary markers must be unique.");
  }

  return (
    readme.slice(0, startIndex) +
    start +
    "\n" +
    activitySummary(model) +
    "\n" +
    end +
    readme.slice(endIndex + end.length)
  );
}
