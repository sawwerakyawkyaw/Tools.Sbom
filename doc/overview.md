# Tools.Sbom

This custom Azure Pipelines task extension automates the generation and upload of Software Bill of Materials (SBOM) for .NET projects. It leverages the CycloneDX .NET tool to produce SBOMs and securely uploads them to Interlynk, a SBOM Automation Platform.

### Directory Structure

```
├── LICENSE
├── README.md
├── task
│   ├── dotnet-cyclonedx
│   │   ├── buildArgsFromInput.ts
│   │   └── installer.ts
│   ├── interlynk-api
│   │   ├── client.ts
│   │   ├── mutations.ts
│   │   └── queries.ts
│   ├── utils
│   │   └── helpers.ts
│   ├── index.ts
│   ├── node_modules
│   ├── package-lock.json
│   ├── package.json
│   ├── task.json
│   ├── tsconfig.json
└── vss-extension.json
```

### Install

The extension can be install from the [Visual Studio Marketplace.]()

### Usage

In Azure Devops YAML pipelines:

```yml
jobs:
  - job: build
    steps:
      - task: sbom-tool@1
        displayName: "Generate SBOM"
        inputs:
          solutionFilePath: "src/MyApp/MyApp.sln"
          outputDirectory: "$(Build.ArtifactStagingDirectory)/SBOMs"
          filename: "bom.json"
          outputFormat: "json"
          disablePackageRestore: false
          setVersion: "1.2.3"
          setType: "Application"

          # --- More Options group ---
          excludeDevDependencies: true
          excludeTestProjects: true
          excludeFilterList: |
            packageA@1.0.0,packageB@2.0.0
          enableGithubLicenses: true
          githubUsername: "$(GITHUB_USER)"
          githubToken: "$(GITHUB_TOKEN)"

          # --- Interlynk + targeting ---
          interlynkApiKey: "$(INTERLYNK_SECURITY_TOKEN)"
          sbomProductName: "Contoso.Backend"
          sbomEnvironmentName: "production"
          includeVulns: true

      - task: PublishBuildArtifacts@1
        displayName: "Publish artifacts"
        inputs:
          PathtoPublish: "$(Build.ArtifactStagingDirectory)/SBOMs"
          ArtifactName: "SBOMs"
          publishLocation: "Container"
```

### Inputs

The input fields for the task are defined in task.json.


### Running the task locally

**Prerequisites**

- Node.js 18+ (or 20+)
- npm

1. Clone the repository

```bash
git clone https://github.com/sawwerakyawkyaw/Tools.Sbom.git
cd Tools.Sbom/task
```

If you already have the folder open in VS Code, just:

```bash
cd /Users/sawwerakyawkyaw/Desktop/Tools.Sbom/task
```

2. Install dependencies and compile

```bash
npm ci
npx tsc -p tsconfig.json
```

3. Export env variable to simulat the task inputs:

```bash
# Verbose logs from azure-pipelines-task-lib
export SYSTEM_DEBUG=true

# Minimal agent-like directories
export AGENT_TEMPDIRECTORY="$(mktemp -d)"
export SYSTEM_DEFAULTWORKINGDIRECTORY="$(pwd)"
export BUILD_SOURCESDIRECTORY="$(pwd)"

# Required inputs
export INPUT_SOLUTIONFILEPATH="/absolute/path/to/YourSolution.sln"
export INPUT_OUTPUTDIRECTORY="$(pwd)/out-sboms"
export INPUT_FILENAME="bom.json"
export INPUT_OUTPUTFORMAT="json"

# Optional inputs
export INPUT_DISABLEPACKAGERESTORE="false"
export INPUT_SETVERSION="0.0.0"
export INPUT_SETTYPE="Application"

# More Options group
export INPUT_EXCLUDEDEVDEPENDENCIES="false"
export INPUT_EXCLUDETESTPROJECTS="false"
export INPUT_EXCLUDEFILTERLIST=""

# GitHub license resolution (only if enabling)
export INPUT_ENABLEGITHUBLICENSES="false"
export INPUT_GITHUBUSERNAME=""
export INPUT_GITHUBTOKEN=""

# Interlynk + targeting
export INPUT_INTERLYNKAPIKEY="CHANGE_ME_INTERLYNK_TOKEN"
export INPUT_SBOMPRODUCTNAME="CHANGE_ME_Product"
export INPUT_SBOMENVIRONMENTNAME="default"
export INPUT_INCLUDEVULNS="true"
```

4. Run the task
```bash
npx ts-node index.ts
```

### License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/sawwerakyawkyaw/Tools.Sbom/blob/main/LICENSE) file for details.
