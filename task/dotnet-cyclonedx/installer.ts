import * as os from "os";
import * as path from "path";
import * as tl from "azure-pipelines-task-lib/task";

/**
 * Installs the CycloneDX .NET global tool if not already present.
 * - Verifies `dotnet` availability
 * - Installs "CycloneDX" as a global tool (name exposed as `dotnet-CycloneDX`)
 * - Ensures ~/.dotnet/tools is on PATH
 * - Pinned version by default, override via parameter
 */
export async function installDotnetCycloneDX(version: string = "3.0.8"): Promise<void> {
  // 1) Ensure dotnet is available first
  const dotnetPath = tl.which("dotnet", false);
  if (!dotnetPath) {
    throw new Error("`dotnet` CLI is not available on PATH. Please install the .NET SDK.");
  }
  tl.debug(`dotnet found at: ${dotnetPath}`);

  // 2) Short-circuit if already present
  const existing = tl.which("dotnet-CycloneDX", false);
  if (existing) {
    tl.debug(`dotnet-CycloneDX already present at: ${existing}`);
    return;
  }
  tl.debug("dotnet-CycloneDX not found on PATH. Proceeding to install…");

  // 3) Attempt install (retry once for transient issues)
  const attempts = 2;
  let lastErr: unknown = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      tl.debug(`Installing CycloneDX global tool (attempt ${attempt}/${attempts})…`);

      const tool = tl.tool(dotnetPath);
      tool.arg(["tool", "install", "--global", "CycloneDX"]);
      if (version) tool.arg(["--version", version]);

      // Do not fail on stderr automatically—some tools emit warnings there.
      const code = await tool.exec({ failOnStdErr: false, ignoreReturnCode: true });
      if (code !== 0) {
        throw new Error(`dotnet tool install exited with code ${code}`);
      }

      // Ensure global tools dir is on PATH
      ensureDotnetToolsOnPath();

      // Verify the specific executable name now exists
      const installed = tl.which("dotnet-CycloneDX", false);
      if (!installed) {
        throw new Error("CycloneDX installation completed, but `dotnet-CycloneDX` is still not on PATH.");
      }

      tl.debug(`dotnet-CycloneDX installed and found at: ${installed}`);
      return;
    } catch (err) {
      lastErr = err;
      tl.warning(
        `CycloneDX install attempt ${attempt} failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
      if (attempt < attempts) tl.debug("Retrying installation…");
    }
  }

  throw new Error(
    `Failed to install CycloneDX global tool after ${attempts} attempts. ${
      lastErr instanceof Error ? lastErr.message : String(lastErr)
    }`
  );
}

/** Ensure ~/.dotnet/tools is on PATH so global tools are discoverable. */
function ensureDotnetToolsOnPath(): void {
  const home = process.env["HOME"] || process.env["USERPROFILE"] || os.homedir();
  if (!home) {
    tl.debug("Could not resolve HOME/USERPROFILE to add ~/.dotnet/tools to PATH.");
    return;
  }

  const toolsDir = path.join(home, ".dotnet", "tools");
  tl.prependPath(toolsDir); // idempotent; safe to call multiple times
  tl.debug(`Ensured PATH contains: ${toolsDir}`);
}
