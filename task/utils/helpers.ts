import * as tl from "azure-pipelines-task-lib/task";
import * as fs from "fs";
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

export async function checkVulnerabilities(filePath: string): Promise<void> {
  try {
    // Read the JSON file
    const data = await fs.promises.readFile(filePath, "utf-8");

    // Parse into an object
    const json = JSON.parse(data);

    // Check if vulnerabilities key exists
    if (json.vulnerabilities && Array.isArray(json.vulnerabilities)) {
      const count = json.vulnerabilities.length;
      tl.warning(`Found ${count} vulnerabilities.`);
    } else {
      tl.debug("No vulnerabilities found.");
    }
  } catch (err) {
    tl.error(`Error reading or parsing JSON file: ${err instanceof Error ? err.message : String(err)}`);
  }
}
