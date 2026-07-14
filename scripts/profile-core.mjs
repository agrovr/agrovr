function replaceMarkedBlock(readme, marker, content) {
  const start = "<!-- " + marker + ":start -->";
  const end = "<!-- " + marker + ":end -->";
  const startIndex = readme.indexOf(start);
  const endIndex = readme.indexOf(end);
  if (startIndex < 0 || endIndex < 0 || endIndex <= startIndex) {
    throw new Error("README " + marker + " markers are missing or out of order.");
  }
  if (
    readme.indexOf(start, startIndex + start.length) >= 0 ||
    readme.indexOf(end, endIndex + end.length) >= 0
  ) {
    throw new Error("README " + marker + " markers must be unique.");
  }

  return (
    readme.slice(0, startIndex) +
    start +
    "\n" +
    content +
    "\n" +
    end +
    readme.slice(endIndex + end.length)
  );
}

function escapeMarkdownCell(value) {
  return String(value).replaceAll("|", "\\|").replaceAll(/\r?\n/g, " ").trim();
}

export function transmissionSummary(repositories) {
  if (!Array.isArray(repositories) || repositories.length === 0) {
    throw new Error("Recent transmissions require at least one public repository.");
  }
  const rows = repositories.map((repository) => {
    const slug = String(repository.slug || "");
    if (!/^[A-Za-z0-9_.-]+$/.test(slug)) {
      throw new Error("Recent transmissions received an unsafe repository slug.");
    }
    return (
      "| [" +
      escapeMarkdownCell(repository.label) +
      "](https://github.com/agrovr/" +
      slug +
      ") | " +
      escapeMarkdownCell(repository.language) +
      " | `" +
      escapeMarkdownCell(repository.pushedAt) +
      "` |"
    );
  });
  return [
    "| Mission | Primary language | Last public push |",
    "| :-- | :-- | --: |",
    ...rows,
  ].join("\n");
}

export function replaceTransmissionSummary(readme, repositories) {
  return replaceMarkedBlock(
    readme,
    "transmission-summary",
    transmissionSummary(repositories),
  );
}
