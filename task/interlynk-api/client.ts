/**
 * Interlynk API client for uploading SBOMs via GraphQL mutation.
 * - Reads required and optional task inputs
 * - Normalizes filename and output format
 * - Handles file existence and error reporting
 * - Uploads SBOM file using multipart GraphQL request
 * - Handles and logs API/server errors, masking sensitive data
 */
import * as tl from 'azure-pipelines-task-lib/task';
import * as path from "path";
import * as fs from "fs";
import axios, { AxiosError } from "axios";
const FormData = require("form-data");
import { normalizeFilenameForFormat } from "../utils/helpers";
import { SBOM_UPLOAD } from "./mutations";
import { SBOM_BY_NAMES, SBOM_DOWNLOAD_NEW } from "./queries";

const ENDPOINT = "https://api.interlynk.io/lynkapi";
const TOKEN = tl.getInput('interlynkApiKey', true);

type OutputFormat = "json" | "xml" | "unsafeJson";
type RunStatus = "UNKNOWN" | "NOT_STARTED" | "IN_PROGRESS" | "FINISHED";

export async function uploadSbom(): Promise<void> {

  const outputDirectory = tl.getPathInput('outputDirectory', true, false)!;
  const rawFilename = (tl.getInput("filename", false) || "bom.json").trim();
  const outputFormat = (tl.getInput("outputFormat", false) as OutputFormat) || "json";
  const normalizedFilename = normalizeFilenameForFormat(rawFilename, outputFormat);
  const filePath = path.join(outputDirectory, normalizedFilename);
  const projectGroupName = tl.getInput('sbomProductName', true) || '';
  const projectName = tl.getInput('sbomEnvironmentName', true) || '';

  tl.debug(`Interlynk Token: ${TOKEN}`);
  tl.debug(`ENDPOINT: ${ENDPOINT}`);
  tl.debug(`outputDirectory: ${outputDirectory}`);
  tl.debug(`rawFilename: ${rawFilename}`);
  tl.debug(`outputFormat: ${outputFormat}`);
  tl.debug(`normalizedFilename: ${normalizedFilename}`);
  tl.debug(`filePath: ${filePath}`);
  tl.debug(`projectGroupName: ${projectGroupName}`);
  tl.debug(`projectName: ${projectName}`);

  if (!fs.existsSync(filePath)) {
    tl.debug(`SBOM file not found at ${filePath}, skipping upload.`);
    return;
  }

  // Prepare GraphQL query. Note: this query is defined in the mutations.ts file.
  const query = SBOM_UPLOAD;

  // Step 1: operations JSON
  const operations = JSON.stringify({
    query,
    variables: {
      doc: null, // placeholder
      projectGroupName,
      projectName,
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

  if (!TOKEN) {
    tl.setResult(tl.TaskResult.Failed, "INTERLYNK_SECURITY_TOKEN not provided; skipping upload");
    return;
  }

  try {
    const resp = await axios.post(ENDPOINT, form, {
      headers: {
        ...form.getHeaders(),
        authorization: `Bearer ${TOKEN}`,
      },
    });

    // 2xx success path
    const respJson = resp.data;
    const gqlErrors = respJson?.data?.sbomUpload?.errors;
    if (gqlErrors?.length) {
      tl.setResult(tl.TaskResult.Failed, `Error uploading SBOM: ${JSON.stringify(gqlErrors)}`);
    } else {
      tl.setResult(tl.TaskResult.Succeeded, "SBOM uploaded successfully.");
    }
  } catch (err: unknown) {
    if (axios.isAxiosError(err)) {
      const ax = err as AxiosError;

      // Server responded with a non-2xx status
      if (ax.response) {
        const { status, statusText, data } = ax.response;

        // Pull a useful message from data if possible
        const serverMsg =
          (typeof data === "string" && data) ||
          (typeof data === "object" && (data as any)?.message) ||
          (typeof data === "object" && (data as any)?.errors && JSON.stringify((data as any).errors)) ||
          "";

        switch (status) {
          case 400:
            tl.setResult(tl.TaskResult.Failed, `Bad request (400). ${serverMsg || statusText}`);
            break;
          case 401:
            tl.setResult(tl.TaskResult.Failed, "Unauthorized (401). Check your API token.");
            break;
          case 403:
            tl.setResult(tl.TaskResult.Failed, "Forbidden (403). Token lacks required permissions.");
            break;
          case 404:
            tl.setResult(tl.TaskResult.Failed, `Not found (404). ${serverMsg || statusText}`);
            break;
          case 413:
            tl.setResult(tl.TaskResult.Failed, "Payload too large (413). Try a smaller SBOM file.");
            break;
          case 429:
            tl.setResult(tl.TaskResult.Failed, "Rate limited (429). Please retry after a short delay.");
            break;
          default:
            if (status >= 500) {
              tl.setResult(tl.TaskResult.Failed, `Server error (${status}). ${serverMsg || statusText}`);
            } else {
              tl.setResult(tl.TaskResult.Failed, `Request failed (${status}). ${serverMsg || statusText}`);
            }
        }
        return;
      }

      // Request made but no response (network/DNS/TLS/timeouts)
      if (ax.request) {
        tl.setResult(
          tl.TaskResult.Failed,
          `No response from server. Possible network issue or timeout. ${ax.message}`
        );
        return;
      }

      // Something else in setting up the request
      tl.setResult(tl.TaskResult.Failed, `Request setup failed: ${ax.message}`);
      return;
    }

    // Non-Axios error
    const msg = err instanceof Error ? err.message : String(err);
    tl.setResult(tl.TaskResult.Failed, `Unexpected error: ${msg}`);
  }
}

export async function getSbomStatusByNames(opts: { tries?: number; delayMs?: number } = {}
): Promise<string | undefined> {

  const projectGroupName = tl.getInput("sbomProductName", true)!;
  const projectName = tl.getInput("sbomEnvironmentName", true)!;
  const versionName = tl.getInput("setVersion", true)!;

  tl.debug(`Interlynk Token: ${TOKEN}`);
  tl.debug(`ENDPOINT: ${ENDPOINT}`);
  tl.debug(`projectGroupName: ${projectGroupName}`);
  tl.debug(`projectName: ${projectName}`);
  tl.debug(`versionName: ${versionName}`);

  if (!TOKEN) {
    tl.setResult(tl.TaskResult.Failed, "INTERLYNK_SECURITY_TOKEN not provided; skip checking status");
    return undefined;
  }
  if (!ENDPOINT) {
    tl.setResult(tl.TaskResult.Failed, "GraphQL ENDPOINT not configured");
    return undefined;
  }

  const variables = {
    projectName: projectName.trim().toLowerCase(),
    projectGroupName: projectGroupName.trim(),
    versionName: versionName.trim().toLowerCase()
  };

  tl.debug(`variables: ${JSON.stringify(variables)}`);

  tl.debug(`Getting SBOM status with variables: ${JSON.stringify(variables)}`);

  const tries = opts.tries ?? 10;
  const delayMs = opts.delayMs ?? 5000;

  for (let i = 0; i < tries; i++) {
    const resp = await axios.post(
      ENDPOINT,
      {
        operationName: "SbomByNames",
        query: SBOM_BY_NAMES,
        variables
      },
      {
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${TOKEN}`
        },
      }
    );

    if (resp.data?.errors?.length) {
      throw new Error(`GraphQL errors: ${JSON.stringify(resp.data.errors)}`);
    }

    const sbom = resp.data?.data?.sbom;
    if (!sbom) {
      tl.setResult(tl.TaskResult.Failed, "SBOM not found with the provided names");
      return undefined;
    }

    const { automationRunStatus, policyRunStatus, vulnRunStatus } = sbom as {
      automationRunStatus: RunStatus;
      policyRunStatus: RunStatus;
      vulnRunStatus: RunStatus;
    };

    tl.debug(`Attempt ${i + 1}: SBOM statuses - Automation: ${automationRunStatus}, Policy: ${policyRunStatus}, Vulnerability: ${vulnRunStatus}`);

    // If all finished (or failed), stop polling early
    const statuses = [automationRunStatus, policyRunStatus, vulnRunStatus];
    if (statuses.every(s => s === "FINISHED")) {
      return sbom;
    }

    // otherwise wait and poll again
    if (i < tries - 1) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  // Return the last seen state even if still RUNNING
  // (callers can decide what to do)
  return (await axios.post(
    ENDPOINT,
    {
      operationName: "SbomByNames",
      query: SBOM_BY_NAMES,
      variables
    },
    {
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${TOKEN}`
      },
    }
  )).data?.data?.sbom ?? null;
}

export async function downloadSBOM(): Promise<string | undefined> {
  const projectGroupName = tl.getInput("sbomProductName", true)!;
  const projectName = tl.getInput("sbomEnvironmentName", true)!;
  const versionName = tl.getInput("setVersion", true)!;
  const includeVulnsInput = tl.getInput("includeVulns", true);

  const rawFilename = (tl.getInput("filename", false) || "bom.json").trim();
  const outputFormat = (tl.getInput("outputFormat", false) as OutputFormat) || "json";
  const interlynkDownloadFilename = normalizeFilenameForFormat(rawFilename, outputFormat, "processed");

  const outputDirectory = tl.getPathInput('outputDirectory', true, false)!;

  tl.debug(`Interlynk Token: ${TOKEN}`);
  tl.debug(`ENDPOINT: ${ENDPOINT}`);
  tl.debug(`projectGroupName: ${projectGroupName}`);
  tl.debug(`projectName: ${projectName}`);
  tl.debug(`versionName: ${versionName}`);
  tl.debug(`includeVulnsInput: ${includeVulnsInput}`);
  tl.debug(`rawFilename: ${rawFilename}`);
  tl.debug(`outputFormat: ${outputFormat}`);
  tl.debug(`interlynkDownloadFilename: ${interlynkDownloadFilename}`);
  tl.debug(`outputDirectory: ${outputDirectory}`);

  // Convert safely into a boolean OR undefined if not provided
  let includeVulns: boolean | undefined = undefined;
  if (includeVulnsInput !== undefined) {
    includeVulns = includeVulnsInput.toLowerCase() === "true";
  }

  if (!TOKEN) {
    tl.setResult(tl.TaskResult.Failed, "INTERLYNK_SECURITY_TOKEN not provided; skipping download");
    return undefined;
  }
  if (!ENDPOINT) {
    tl.setResult(tl.TaskResult.Failed, "GraphQL ENDPOINT not configured");
    return undefined;
  }

  // Only the four vars you care about:
  const variables = {
    projectName: projectName.trim().toLowerCase(),
    projectGroupName: projectGroupName.trim(),
    versionName: versionName.trim().toLowerCase(),
    includeVulns: includeVulns,
    // All other parameters are intentionally omitted
  };

  tl.debug(`Downloading SBOM with variables: ${JSON.stringify(variables)}`);

  const attempts = 5; // retry count
  const delayMs = 10000;

  for (let i = 0; i < attempts; i++) {
    try {
      const resp = await axios.post(
        ENDPOINT,
        {
          operationName: "downloadSbom",
          query: SBOM_DOWNLOAD_NEW,
          variables,
        },
        {
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${TOKEN}`,
          },
        }
      );

      if (resp.data.errors?.length) {
        tl.debug(`Attempt ${i + 1}: GraphQL errors: ${JSON.stringify(resp.data.errors)}`);
      } else {
        const dl = resp.data?.data?.sbom?.download;
        if (dl?.content) {
          const buffer = Buffer.from(dl.content, "base64");
          const fullFilePath = path.join(outputDirectory, interlynkDownloadFilename);
          fs.writeFileSync(fullFilePath, buffer);

          tl.setResult(
            tl.TaskResult.Succeeded,
            `Saved file ${interlynkDownloadFilename} (contentType: ${dl.contentType})`
          );
          return fullFilePath;
        }
        tl.debug(`Attempt ${i + 1}: Download content is missing.`);
      }
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        tl.debug(
          `Attempt ${i + 1} failed: ${err.response?.status} ${err.response?.statusText} - ${JSON.stringify(err.response?.data) || err.message
          }`
        );
      } else {
        tl.debug(`Attempt ${i + 1} failed: ${String(err)}`);
      }
    }

    // If not the last attempt, wait before retry
    if (i < attempts - 1) {
      await new Promise(res => setTimeout(res, delayMs));
    }
  }

  tl.setResult(
    tl.TaskResult.Failed,
    `DownloadSBOM failed after ${attempts} attempts. SBOM may not be indexed yet.`
  );
  return undefined;
}
