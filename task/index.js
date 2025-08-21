"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
exports.__esModule = true;
var tl = require('azure-pipelines-task-lib/task');
var trm = require('azure-pipelines-task-lib/toolrunner');
var path = require('path');
var axios_1 = require("axios");
var FormData = require("form-data");
var fs = require("fs");
var ENDPOINT = "https://api.interlynk.io/lynkapi";
var TOKEN = process.env.INTERLYNK_SECURITY_TOKEN;
// Installs the dotnet CycloneDX global tool if it's not present.
// Assumption: the tool package id is `dotnet-cyclonedx` and the executable is `dotnet-cyclonedx`.
function installDotnetCycloneDX() {
    return __awaiter(this, void 0, void 0, function () {
        var dotnet, existing, tr, rc, installed;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    dotnet = tl.which('dotnet', false);
                    if (!dotnet) {
                        throw new Error('`dotnet` CLI is not available on PATH. Please install .NET SDK.');
                    }
                    existing = tl.which('dotnet-CycloneDX', false);
                    if (existing) {
                        tl.debug("Found dotnet-CycloneDX at ".concat(existing));
                        return [2 /*return*/];
                    }
                    tl.debug('dotnet-CycloneDX not found, installing as a global tool');
                    tr = new trm.ToolRunner('dotnet');
                    tr.arg(['tool', 'install', '--global', 'CycloneDX', '--version', '3.0.8']);
                    return [4 /*yield*/, tr.exec()];
                case 1:
                    rc = _a.sent();
                    if (rc !== 0) {
                        throw new Error("Failed to install CycloneDX (exit code ".concat(rc, ")"));
                    }
                    installed = tl.which('dotnet-CycloneDX', false);
                    if (!installed) {
                        throw new Error('dotnet-CycloneDX installation finished but the executable was not found on PATH.');
                    }
                    tl.debug("dotnet-CycloneDX installed at ".concat(installed));
                    return [2 /*return*/];
            }
        });
    });
}
// Function to build args for dotnet-CycloneDX
function buildArgsFromInputs() {
    var args = [];
    var solutionFilePath = tl.getPathInput("solutionFilePath", true, false);
    var outputDirectory = tl.getPathInput("outputDirectory", true, false);
    var filename = tl.getInput("filename", true) || "bom.json";
    var outputFormat = tl.getInput("outputFormat", true) || "json"; // json | xml | unsafeJson
    var disablePackageRestore = tl.getBoolInput("disablePackageRestore", false);
    var setVersion = tl.getInput("setVersion", false);
    var setType = tl.getInput("setType", false);
    var excludeDevDependencies = tl.getBoolInput("excludeDevDependencies", false);
    var excludeTestProjects = tl.getBoolInput("excludeTestProjects", false);
    var excludeFilterList = tl.getInput("excludeFilterList", false);
    var enableGithubLicenses = tl.getBoolInput("enableGithubLicenses", false);
    var githubUsername = tl.getInput("githubUsername", false);
    var githubToken = tl.getInput("githubToken", false);
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
            tl.warning("Unknown outputFormat '".concat(outputFormat, "', defaulting to --json"));
            args.push("--json");
            break;
    }
    if (disablePackageRestore)
        args.push("--disable-package-restore");
    if (setVersion && setVersion.trim())
        args.push("--set-version", setVersion.trim());
    if (setType && setType.trim())
        args.push("--set-type", setType.trim());
    if (excludeDevDependencies)
        args.push("--exclude-dev");
    if (excludeTestProjects)
        args.push("--exclude-test-projects");
    if (excludeFilterList && excludeFilterList.trim()) {
        // Expecting "name1@version1,name2@version2" with optional whitespace
        var cleaned = excludeFilterList.replace(/\s+/g, "");
        if (cleaned)
            args.push("--exclude", cleaned);
    }
    if (enableGithubLicenses) {
        if (!githubUsername || !githubToken) {
            throw new Error("GitHub license resolution enabled but 'githubUsername' or 'githubToken' is missing.");
        }
        // Adjust flag names as per cyclonedx-dotnet docs if needed
        args.push("--github-username", githubUsername);
        args.push("--github-token", githubToken);
    }
    tl.debug("Final CycloneDX args: ".concat(JSON.stringify(args)));
    return args;
}
function uploadSbom() {
    var _a, _b;
    return __awaiter(this, void 0, void 0, function () {
        var outputDirectory, filename, filePath, projectGroupName, query, operations, map, form, resp, err_1;
        return __generator(this, function (_c) {
            switch (_c.label) {
                case 0:
                    outputDirectory = tl.getPathInput('outputDirectory', true, false);
                    filename = tl.getInput('filename', true) || 'bom.json';
                    filePath = path.join(outputDirectory, filename);
                    projectGroupName = tl.getInput('sbomProductName', true) || '';
                    if (!fs.existsSync(filePath)) {
                        tl.debug("SBOM file not found at ".concat(filePath, ", skipping upload."));
                        return [2 /*return*/];
                    }
                    query = "\n    mutation uploadSbom($doc: Upload!, $projectGroupName: String!) {\n      sbomUpload(input: { doc: $doc, projectGroupName: $projectGroupName }) {\n        errors\n      }\n    }\n  ";
                    operations = JSON.stringify({
                        query: query,
                        variables: {
                            doc: null,
                            projectGroupName: projectGroupName
                        }
                    });
                    map = JSON.stringify({
                        '0': ['variables.doc']
                    });
                    form = new FormData();
                    form.append('operations', operations);
                    form.append('map', map);
                    form.append('0', fs.createReadStream(filePath)); // actual file
                    _c.label = 1;
                case 1:
                    _c.trys.push([1, 3, , 4]);
                    return [4 /*yield*/, axios_1["default"].post(ENDPOINT, form, {
                            headers: __assign(__assign({}, form.getHeaders()), { authorization: "Bearer ".concat(TOKEN) })
                        })];
                case 2:
                    resp = _c.sent();
                    if ((_a = resp.data.errors) === null || _a === void 0 ? void 0 : _a.length) {
                        tl.error("GraphQL errors: ".concat(JSON.stringify(resp.data.errors)));
                    }
                    else {
                        tl.debug("Upload successfully!");
                    }
                    return [3 /*break*/, 4];
                case 3:
                    err_1 = _c.sent();
                    if (axios_1["default"].isAxiosError(err_1)) {
                        tl.error("Upload failed: ".concat(((_b = err_1.response) === null || _b === void 0 ? void 0 : _b.data) || err_1.message));
                    }
                    else if (err_1 instanceof Error) {
                        tl.error("Upload failed: ".concat(err_1.message));
                    }
                    else {
                        tl.error("Upload failed: ".concat(String(err_1)));
                    }
                    return [3 /*break*/, 4];
                case 4: return [2 /*return*/];
            }
        });
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function () {
        var args, code, err_2, msg;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    _a.trys.push([0, 6, , 7]);
                    return [4 /*yield*/, installDotnetCycloneDX()];
                case 1:
                    _a.sent();
                    args = buildArgsFromInputs();
                    return [4 /*yield*/, tl.exec('dotnet-CycloneDX', args, { failOnStdErr: false })];
                case 2:
                    code = _a.sent();
                    if (code !== 0) {
                        throw new Error("CycloneDX exited with code ".concat(code));
                    }
                    tl.debug('SBOM generated successfully.');
                    if (!TOKEN) return [3 /*break*/, 4];
                    tl.debug('INTERLYNK_SECURITY_TOKEN present, attempting upload');
                    return [4 /*yield*/, uploadSbom()];
                case 3:
                    _a.sent();
                    return [3 /*break*/, 5];
                case 4:
                    tl.debug('INTERLYNK_SECURITY_TOKEN not provided; skipping upload');
                    _a.label = 5;
                case 5:
                    tl.setResult(tl.TaskResult.Succeeded, 'SBOM generated successfully.');
                    return [3 /*break*/, 7];
                case 6:
                    err_2 = _a.sent();
                    msg = err_2 instanceof Error ? err_2.message : String(err_2);
                    tl.error(msg);
                    tl.setResult(tl.TaskResult.Failed, msg);
                    return [3 /*break*/, 7];
                case 7: return [2 /*return*/];
            }
        });
    });
}
run();
