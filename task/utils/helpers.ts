import * as tl from "azure-pipelines-task-lib/task";
import * as fs from "fs";
const path = require('path');
type OutputFormat = "json" | "xml" | "unsafeJson";

/** Ensure filename extension matches the chosen output format. */
export function normalizeFilenameForFormat(
  filename: string,
  format: OutputFormat,
  type?: string
): string {
  let base = filename;
  const ext = path.extname(filename).toLowerCase();

  // Strip known extensions to reapply the correct one
  if (ext === ".json" || ext === ".xml") {
    base = filename.slice(0, -ext.length);
  }

  if (type) {
    // When a type is provided (e.g. "processed"), always append the
    // processed suffix and choose the correct extension based on format.
    const outExt = format === "xml" ? "xml" : "json";
    return `${base}-(interlynk-processed-sbom).${outExt}`;
  } else {
    const outExt = format === "xml" ? "xml" : "json";
    return `${base}-(cyclonedx-tool-generated-sbom).${outExt}`;
  }
}

export async function checkVulnerabilities(filePath: string): Promise<void> {
  try {
    // Read the JSON file
    const data = await fs.promises.readFile(filePath, "utf-8");

    // Parse into an object
    const json = JSON.parse(data);

    // Check if vulnerabilities key exists
    if (!json.vulnerabilities || !Array.isArray(json.vulnerabilities)) {
      tl.debug("No vulnerabilities found.");
      return;
    }

    const counts: Record<string, number> = {};
    let total = 0;

    function normalizeSeverity(s: string | undefined): string {
      if (!s) return "unrated";
      const v = s.trim().toLowerCase();
      if (v === "crit" || v === "critical") return "critical";
      if (v === "high") return "high";
      if (v === "moderate" || v === "medium") return "medium";
      if (v === "low") return "low";
      if (v === "none") return "none";
      if (v === "info" || v === "informational") return "informational";
      return v.length ? v : "unrated";
    }

    function bucketFromCvss(score: unknown): string | undefined {
      const n = typeof score === "number" ? score : Number(score);
      if (!isFinite(n)) return undefined;
      if (n >= 9.0) return "critical";
      if (n >= 7.0) return "high";
      if (n >= 4.0) return "medium";
      if (n > 0) return "low";
      return "none"; // n === 0
    }

    for (const v of json.vulnerabilities) {
      total += 1;

      let sev: string | undefined;

      if (Array.isArray(v?.ratings) && v.ratings.length > 0) {
        // Prefer explicit severity when present
        const first = v.ratings[0];
        sev = normalizeSeverity(first?.severity);

        // If no severity text, try to infer from score
        if (sev === "unrated" || sev === "unknown") {
          const inferred = bucketFromCvss(first?.score);
          if (inferred) sev = inferred;
        }
      }

      const key = normalizeSeverity(sev);
      counts[key] = (counts[key] || 0) + 1;
    }

    // Build a human-friendly summary. Prefer common severity ordering.
    const preferredOrder = [
      "critical",
      "high",
      "medium",
      "low",
      "none",
      "informational",
      "unrated",
      "unknown"
    ];

    const parts: string[] = [];
    for (const key of preferredOrder) {
      if (counts[key]) {
        const label = key;
        const n = counts[key];
        parts.push(`${n} ${label}`);
      }
    }
    for (const key of Object.keys(counts)) {
      if (!preferredOrder.includes(key)) {
        parts.push(`${counts[key]} ${key}`);
      }
    }

    tl.warning(`Found ${total} vulnerabilities: ${parts.join(", ")}.`);
  } catch (err) {
    tl.error(`Error reading or parsing JSON file: ${err instanceof Error ? err.message : String(err)}`);
    tl.setResult(tl.TaskResult.Failed, "Failed to check vulnerabilities.");
  }
}

