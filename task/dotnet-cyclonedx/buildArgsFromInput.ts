const tl = require('azure-pipelines-task-lib/task');

import * as path from "path";
import * as fs from "fs";

type OutputFormat = "json" | "xml" | "unsafeJson";

/**
 * Build arguments for the `dotnet-CycloneDX` CLI from task inputs.
 * - Validates required inputs
 * - Normalizes filename & extension to match the chosen format
 * - Masks secrets (GitHub token) from logs
 * - Avoids logging sensitive values
 */
export async function buildArgsFromInputs(): Promise<string[]> {
  const args: string[] = [];

  // ----- Required inputs -----
  const solutionFilePath = tl.getPathInput("solutionFilePath", true, true);
  const outputDirectory = tl.getPathInput("outputDirectory", true, false);

  if (!solutionFilePath) {
    throw new Error("Missing required input: solutionFilePath");
  }
  if (!outputDirectory) {
    throw new Error("Missing required input: outputDirectory");
  }

  // Ensure output directory exists; CLI expects it to be present
  try {
    tl.mkdirP(outputDirectory);
  } catch (e) {
    throw new Error(`Failed to create output directory '${outputDirectory}': ${String(e)}`);
  }

  // ----- Optional inputs with defaults -----
  const rawFilename = (tl.getInput("filename", false) || "bom.json").trim();
  const outputFormat = (tl.getInput("outputFormat", false) as OutputFormat) || "json"; // json | xml | unsafeJson

  const disablePackageRestore = tl.getBoolInput("disablePackageRestore", false);
  const setVersion = (tl.getInput("setVersion", false) || "").trim();
  const setType = (tl.getInput("setType", false) || "").trim();

  const excludeDevDependencies = tl.getBoolInput("excludeDevDependencies", false);
  const excludeTestProjects = tl.getBoolInput("excludeTestProjects", false);
  const excludeFilterList = (tl.getInput("excludeFilterList", false) || "").trim();

  const enableGithubLicenses = tl.getBoolInput("enableGithubLicenses", false);
  const githubUsername = (tl.getInput("githubUsername", false) || "").trim();
  const githubToken = (tl.getInput("githubToken", false) || "").trim();

  // ----- Normalize filename & extension to match format -----
  const normalizedFilename = normalizeFilenameForFormat(rawFilename, outputFormat);
  const outputPath = path.join(outputDirectory, normalizedFilename);

  // ----- Base positional arg: solution or project path -----
  args.push(solutionFilePath);

  // ----- Output controls -----
  args.push("--output", outputDirectory);
  args.push("--filename", normalizedFilename);

  // ----- Format switches -----
  switch (outputFormat) {
    case "json":
      args.push("--json");
      break;
    case "xml":
      args.push("--xml");
      break;
    case "unsafeJson":
      // According to cyclonedx-dotnet, "--json --unsafe" generates an "unsafe" JSON BOM.
      args.push("--json", "--unsafe");
      break;
    default:
      tl.warning(`Unknown outputFormat '${outputFormat}', defaulting to --json`);
      args.push("--json");
      break;
  }

  // ----- Other flags -----
  if (disablePackageRestore) args.push("--disable-package-restore");
  if (setVersion) args.push("--set-version", setVersion);
  if (setType) args.push("--set-type", setType);

  if (excludeDevDependencies) args.push("--exclude-dev");
  if (excludeTestProjects) args.push("--exclude-test-projects");

  if (excludeFilterList) {
    // Accept comma/space-separated; strip spaces for safety.
    const cleaned = excludeFilterList.replace(/\s+/g, "");
    if (cleaned) args.push("--exclude", cleaned);
  }

  // ----- GitHub license resolution (optional) -----
  if (enableGithubLicenses) {
    if (!githubUsername || !githubToken) {
      throw new Error(
        "GitHub license resolution is enabled but 'githubUsername' or 'githubToken' is missing."
      );
    }
    // Mask token in logs
    tl.setSecret(githubToken);
    // The CycloneDX tool expects these flags for GitHub license lookups
    args.push("--github-username", githubUsername);
    args.push("--github-token", githubToken);
  }

  // Safe debug (no secrets)
  tl.debug(
    `CycloneDX args (safe): ${JSON.stringify(
      args.map((a) => (a === githubToken ? "***" : a))
    )}`
  );
  tl.debug(`Resolved output path: ${outputPath}`);

  // Sanity: ensure the parent dir is writable
  try {
    fs.accessSync(outputDirectory, fs.constants.W_OK);
  } catch {
    tl.warning(
      `Output directory may not be writable: ${outputDirectory}. The CycloneDX tool could fail when writing '${normalizedFilename}'.`
    );
  }

  return args;
}

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
