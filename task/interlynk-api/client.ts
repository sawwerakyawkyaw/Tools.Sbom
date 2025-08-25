import * as tl from 'azure-pipelines-task-lib/task';
import * as path from "path";
import * as fs from "fs";
import axios, { AxiosError } from "axios";
const FormData = require("form-data");
import { normalizeFilenameForFormat } from "../utils/helpers";
import { SBOM_UPLOAD } from "./mutations";

const ENDPOINT = "https://api.interlynk.io/lynkapi";
type OutputFormat = "json" | "xml" | "unsafeJson";

export async function uploadSbom(): Promise<void> {
  const TOKEN = tl.getInput('interlynkApiKey', true);
  const outputDirectory = tl.getPathInput('outputDirectory', true, false)!;
  const rawFilename = (tl.getInput("filename", false) || "bom.json").trim();
  const outputFormat = (tl.getInput("outputFormat", false) as OutputFormat) || "json";
  const normalizedFilename = normalizeFilenameForFormat(rawFilename, outputFormat);
  const filePath = path.join(outputDirectory, normalizedFilename);
  const projectGroupName = tl.getInput('sbomProductName', true) || '';

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
