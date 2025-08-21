const tl = require('azure-pipelines-task-lib/task');
const trm = require('azure-pipelines-task-lib/toolrunner');
const path = require('path');

import axios from "axios";
const FormData = require("form-data");
const fs = require("fs");

const ENDPOINT = "https://api.interlynk.io/lynkapi";
const TOKEN = process.env.INTERLYNK_SECURITY_TOKEN;

// Installs the dotnet CycloneDX global tool if it's not present.
// Assumption: the tool package id is `dotnet-cyclonedx` and the executable is `dotnet-cyclonedx`.
async function installDotnetCycloneDX() {
  // Ensure `dotnet` is available first
  const dotnet = tl.which('dotnet', false);
  if (!dotnet) {
    throw new Error('`dotnet` CLI is not available on PATH. Please install .NET SDK.');
  }

  // Check if the CycloneDX tool is already available
  const existing = tl.which('dotnet-CycloneDX', false);
  if (existing) {
    tl.debug(`Found dotnet-CycloneDX at ${existing}`);
    return;
  }

  tl.debug('dotnet-CycloneDX not found, installing as a global tool');
  const tr = new trm.ToolRunner('dotnet');
  tr.arg(['tool', 'install', '--global', 'CycloneDX', '--version', '3.0.8']);

  const rc = await tr.exec();
  if (rc !== 0) {
    throw new Error(`Failed to install CycloneDX (exit code ${rc})`);
  }

  // Verify installation
  const installed = tl.which('dotnet-CycloneDX', false);
  if (!installed) {
    throw new Error('dotnet-CycloneDX installation finished but the executable was not found on PATH.');
  }
  tl.debug(`dotnet-CycloneDX installed at ${installed}`);
}

// Function to build args for dotnet-CycloneDX
function buildArgsFromInputs(): string[] {
  const args: string[] = [];

  const solutionFilePath = tl.getPathInput("solutionFilePath", true, false)!;
  const outputDirectory = tl.getPathInput("outputDirectory", true, false)!;
  const filename = tl.getInput("filename", true) || "bom.json";

  const outputFormat = tl.getInput("outputFormat", true) || "json"; // json | xml | unsafeJson
  const disablePackageRestore = tl.getBoolInput("disablePackageRestore", false);
  const setVersion = tl.getInput("setVersion", false);
  const setType = tl.getInput("setType", false);

  const excludeDevDependencies = tl.getBoolInput("excludeDevDependencies", false);
  const excludeTestProjects = tl.getBoolInput("excludeTestProjects", false);
  const excludeFilterList = tl.getInput("excludeFilterList", false);

  const enableGithubLicenses = tl.getBoolInput("enableGithubLicenses", false);
  const githubUsername = tl.getInput("githubUsername", false);
  const githubToken = tl.getInput("githubToken", false);

  // Base positional arg: solution or directory
  args.push(solutionFilePath);

  // Output controls
  args.push("--output", outputDirectory);
  args.push("--filename", filename);

  // Format mapping
  switch (outputFormat) {
    case "json":
      args.push("--json");
      break;
    case "xml":
      args.push("--xml");
      break;
    case "unsafeJson":
      // If your CLI expects a different switch for 'unsafe', adjust here.
      args.push("--json", "--unsafe");
      break;
    default:
      tl.warning(`Unknown outputFormat '${outputFormat}', defaulting to --json`);
      args.push("--json");
      break;
  }

  if (disablePackageRestore) args.push("--disable-package-restore");
  if (setVersion && setVersion.trim()) args.push("--set-version", setVersion.trim());
  if (setType && setType.trim()) args.push("--set-type", setType.trim());

  if (excludeDevDependencies) args.push("--exclude-dev");
  if (excludeTestProjects) args.push("--exclude-test-projects");

  if (excludeFilterList && excludeFilterList.trim()) {
    // Expecting "name1@version1,name2@version2" with optional whitespace
    const cleaned = excludeFilterList.replace(/\s+/g, "");
    if (cleaned) args.push("--exclude", cleaned);
  }

  if (enableGithubLicenses) {
    if (!githubUsername || !githubToken) {
      throw new Error(
        "GitHub license resolution enabled but 'githubUsername' or 'githubToken' is missing."
      );
    }
    // Adjust flag names as per cyclonedx-dotnet docs if needed
    args.push("--github-username", githubUsername);
    args.push("--github-token", githubToken);
  }

  tl.debug(`Final CycloneDX args: ${JSON.stringify(args)}`);
  return args;
}

async function uploadSbom(): Promise<void> {
  // Derive file path and project name from task inputs
  const outputDirectory = tl.getPathInput('outputDirectory', true, false)!;
  const filename = tl.getInput('filename', true) || 'bom.json';
  const filePath = path.join(outputDirectory, filename);
  const projectGroupName = tl.getInput('sbomProductName', true) || '';

  if (!fs.existsSync(filePath)) {
    tl.debug(`SBOM file not found at ${filePath}, skipping upload.`);
    return;
  }

  const query = `
    mutation uploadSbom($doc: Upload!, $projectGroupName: String!) {
      sbomUpload(input: { doc: $doc, projectGroupName: $projectGroupName }) {
        errors
      }
    }
  `;

  // Step 1: operations JSON
  const operations = JSON.stringify({
    query,
    variables: {
      doc: null, // placeholder
      projectGroupName,
    },
  });

  // Step 2: map JSON
  const map = JSON.stringify({
    '0': ['variables.doc'],
  });

  // Step 3: build form-data
  const form = new FormData();
  form.append('operations', operations);
  form.append('map', map);
  form.append('0', fs.createReadStream(filePath)); // actual file

  try {
    const resp = await axios.post(ENDPOINT, form, {
      headers: {
        ...form.getHeaders(),
        authorization: `Bearer ${TOKEN}`,
      },
    });

    if (resp.data.errors?.length) {
      tl.error(`GraphQL errors: ${JSON.stringify(resp.data.errors)}`);
    } else {
      tl.debug(`Upload successfully!`);
    }
  } catch (err: any) {
    if (axios.isAxiosError(err)) {
      tl.error(`Upload failed: ${err.response?.data || err.message}`);
    } else if (err instanceof Error) {
      tl.error(`Upload failed: ${err.message}`);
    } else {
      tl.error(`Upload failed: ${String(err)}`);
    }
  }

}

async function run(): Promise<void> {
  try {
    await installDotnetCycloneDX();
    const args = buildArgsFromInputs();

    const code = await tl.exec('dotnet-CycloneDX', args, { failOnStdErr: false });
    if (code !== 0) {
      throw new Error(`CycloneDX exited with code ${code}`);
    }

    tl.debug('SBOM generated successfully.');
    // Try upload if token provided
    if (TOKEN) {
      tl.debug('INTERLYNK_SECURITY_TOKEN present, attempting upload');
      await uploadSbom();
    } else {
      tl.debug('INTERLYNK_SECURITY_TOKEN not provided; skipping upload');
    }

    tl.setResult(tl.TaskResult.Succeeded, 'SBOM successfully generated and uploaded to Interlynk Server.');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    tl.error(msg);
    tl.setResult(tl.TaskResult.Failed, msg);
  }
}

run();

