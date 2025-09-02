import * as tl from 'azure-pipelines-task-lib/task';
import { installDotnetCycloneDX } from "./dotnet-cyclonedx/installer";
import { buildArgsFromInputs } from "./dotnet-cyclonedx/buildArgsFromInput";
import {uploadSbom, downloadSBOM } from "./interlynk-api/client";
import { checkVulnerabilities } from './utils/helpers';

async function run(): Promise<void> {
  try {
    await installDotnetCycloneDX();
    const args = await buildArgsFromInputs();
    console.log(args);

    const code = await tl.exec('dotnet-CycloneDX', args, { failOnStdErr: false });
    if (code !== 0) {
      throw new Error(`CycloneDX exited with code ${code}`);
    }
    await uploadSbom();
    const downloadedPath = await downloadSBOM();
    if (downloadedPath) {
      await checkVulnerabilities(downloadedPath);
    } else {
      throw new Error("Failed to download SBOM. Cannot check vulnerabilities.");
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    tl.error(msg);
    tl.setResult(tl.TaskResult.Failed, msg);
  }
}

run();

