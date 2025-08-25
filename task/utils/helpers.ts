const path = require('path');
type OutputFormat = "json" | "xml" | "unsafeJson";

/** Ensure filename extension matches the chosen output format. */
export function normalizeFilenameForFormat(filename: string, format: OutputFormat): string {
  let base = filename;
  const ext = path.extname(filename).toLowerCase();

  // Strip known extensions to reapply the correct one
  if (ext === ".json" || ext === ".xml") {
    base = filename.slice(0, -ext.length);
  }

  switch (format) {
    case "xml":
      return `${base}.xml`;
    case "json":
    case "unsafeJson":
    default:
      return `${base}.json`;
  }
}
