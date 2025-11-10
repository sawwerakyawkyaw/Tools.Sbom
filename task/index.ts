/** Main entry point for the sbom-tool task. */

import * as tl from 'azure-pipelines-task-lib/task';
import { installDotnetCycloneDX } from "./dotnet-cyclonedx/installer";
import { buildArgsFromInputs } from "./dotnet-cyclonedx/buildArgsFromInput";
import { uploadSbom, downloadSBOM, getSbomStatusByNames } from "./interlynk-api/client";
import { checkVulnerabilities, addNumbers } from './utils/helpers';

async function run(): Promise<void> {
  try {
    await installDotnetCycloneDX();
    const args = await buildArgsFromInputs();
    console.log(args);
    console.log(`2 + 3 = ${addNumbers(2, 3)}`);

    const code = await tl.exec('dotnet-CycloneDX', args, { failOnStdErr: false });
    if (code !== 0) {
      throw new Error(`CycloneDX exited with code ${code}`);
    }
    await uploadSbom();
    await new Promise(resolve => setTimeout(resolve, 10000));
    await getSbomStatusByNames();
    const downloadedPath = await downloadSBOM();
    if (downloadedPath) {
      await checkVulnerabilities(downloadedPath);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    tl.error(msg);
    tl.setResult(tl.TaskResult.Failed, msg);
  }
}

run();

