import { constants, promises as fs } from "node:fs";
import path from "node:path";
import { launchVisualQaBrowser } from "./capture.js";
import { readVisualCase } from "./config.js";
import {
  createHdcRunner,
  detectHarmonyDevices,
  selectHarmonyDevice,
  type HarmonyDevice,
} from "./platforms/harmony/device.js";
import type { PlatformCase, VisualCase } from "./types.js";

export interface DoctorCheck {
  name: string;
  status: "passed" | "warning" | "failed";
  message: string;
  details?: Record<string, unknown>;
}

export interface DoctorReport {
  schemaVersion: 1;
  kind: "visual-qa-doctor-report";
  generatedAt: string;
  status: "ready" | "blocked";
  casePath?: string;
  platform?: "web" | "harmony";
  checks: DoctorCheck[];
}

export interface DoctorOptions {
  casePath?: string;
  browserChannel?: VisualCase["browserChannel"];
  hdcPath?: string;
  skipBrowserLaunch?: boolean;
}

export interface DoctorDependencies {
  launchBrowser?: (
    channel: VisualCase["browserChannel"],
  ) => Promise<{ close(): Promise<void> }>;
  detectDevices?: (hdcPath: string) => Promise<HarmonyDevice[]>;
}

async function exists(filePath: string): Promise<boolean> {
  return fs.access(filePath, constants.R_OK).then(
    () => true,
    () => false,
  );
}

async function nearestExistingDirectory(inputPath: string): Promise<string> {
  let current = path.resolve(inputPath);
  while (!(await fs.stat(current).then((value) => value.isDirectory(), () => false))) {
    const parent = path.dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

function add(
  checks: DoctorCheck[],
  name: string,
  status: DoctorCheck["status"],
  message: string,
  details?: Record<string, unknown>,
): void {
  checks.push({ name, status, message, ...(details ? { details } : {}) });
}

function conciseError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const plain = raw.replace(/\u001b\[[0-9;]*m/g, "").trim();
  const lines = plain.split("\n").map((line) => line.trim()).filter(Boolean);
  const useful = lines.find((line) =>
    /(?:error|failed|not found|missing|permission|denied|eacces|eperm|executable)/i.test(line),
  );
  const summary = useful ?? lines[0] ?? "Unknown error";
  return summary.length > 500 ? `${summary.slice(0, 497)}...` : summary;
}

async function inspectCasePaths(
  visualCase: PlatformCase,
  checks: DoctorCheck[],
): Promise<void> {
  add(checks, "case", "passed", "Case configuration is valid", {
    name: visualCase.name,
  });
  const designReadable = await exists(visualCase.designImage);
  add(
    checks,
    "design-image",
    designReadable ? "passed" : "failed",
    designReadable
      ? "Design image is readable"
      : `Design image is missing or unreadable: ${visualCase.designImage}`,
    { path: visualCase.designImage },
  );
  if (visualCase.platform === "harmony" && visualCase.harmony.screenshot) {
    const readable = await exists(visualCase.harmony.screenshot);
    add(
      checks,
      "harmony-screenshot",
      readable ? "passed" : "failed",
      readable
        ? "Imported Harmony screenshot is readable"
        : `Imported Harmony screenshot is missing or unreadable: ${visualCase.harmony.screenshot}`,
      { path: visualCase.harmony.screenshot },
    );
  }
  const writableParent = await nearestExistingDirectory(visualCase.outputDir!);
  const writable = await fs.access(writableParent, constants.W_OK).then(
    () => true,
    () => false,
  );
  add(
    checks,
    "output",
    writable ? "passed" : "failed",
    writable
      ? "Output location has a writable parent directory"
      : `Output location is not writable: ${writableParent}`,
    { path: visualCase.outputDir, checkedParent: writableParent },
  );
}

export async function runDoctor(
  options: DoctorOptions = {},
  dependencies: DoctorDependencies = {},
): Promise<DoctorReport> {
  const checks: DoctorCheck[] = [];
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  add(
    checks,
    "node",
    nodeMajor >= 18 ? "passed" : "failed",
    nodeMajor >= 18
      ? `Node.js ${process.versions.node} satisfies the >=18 requirement`
      : `Node.js ${process.versions.node} is unsupported; use Node.js 18 or newer`,
  );

  let visualCase: PlatformCase | undefined;
  const casePath = options.casePath ? path.resolve(options.casePath) : undefined;
  if (casePath) {
    try {
      visualCase = await readVisualCase(casePath);
      await inspectCasePaths(visualCase, checks);
    } catch (error) {
      add(
        checks,
        "case",
        "failed",
        conciseError(error),
        { path: casePath },
      );
    }
  }

  const platform = visualCase?.platform === "harmony" ? "harmony" : "web";
  if (platform === "harmony" && visualCase?.platform === "harmony") {
    if (visualCase.harmony.screenshot) {
      add(
        checks,
        "hdc",
        "passed",
        "HDC is not required because this case uses an imported screenshot",
      );
    } else {
      const hdcPath = options.hdcPath ?? visualCase.harmony.hdcPath ?? "hdc";
      try {
        const devices = await (
          dependencies.detectDevices ??
          ((executable: string) => detectHarmonyDevices(createHdcRunner(executable)))
        )(hdcPath);
        const selected = selectHarmonyDevice(
          devices,
          visualCase.harmony.deviceId ?? "auto",
        );
        add(checks, "hdc", "passed", `Harmony device ${selected.id} is reachable`, {
          devices,
        });
      } catch (error) {
        add(
          checks,
          "hdc",
          "failed",
          conciseError(error),
          { executable: hdcPath },
        );
      }
    }
  } else if (options.skipBrowserLaunch) {
    add(
      checks,
      "browser",
      "warning",
      "Browser launch check was skipped by request",
    );
  } else {
    const channel = options.browserChannel ??
      (visualCase?.platform !== "harmony" ? visualCase?.browserChannel : undefined) ??
      "chrome";
    let browser: { close(): Promise<void> } | undefined;
    try {
      browser = await (dependencies.launchBrowser ?? launchVisualQaBrowser)(channel);
      add(checks, "browser", "passed", `Browser channel ${channel} launched successfully`);
    } catch (error) {
      add(
        checks,
        "browser",
        "failed",
        conciseError(error),
        { channel },
      );
    } finally {
      await browser?.close().catch(() => undefined);
    }
  }

  return {
    schemaVersion: 1,
    kind: "visual-qa-doctor-report",
    generatedAt: new Date().toISOString(),
    status: checks.some((check) => check.status === "failed")
      ? "blocked"
      : "ready",
    ...(casePath ? { casePath } : {}),
    platform,
    checks,
  };
}
