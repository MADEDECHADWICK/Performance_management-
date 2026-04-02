const { spawn } = require("child_process");
const path = require("path");

const rootDir = path.resolve(__dirname, "..");
const backendDir = path.join(rootDir, "backend");
const tsNodeBin = path.join(backendDir, "node_modules", "ts-node", "dist", "bin.js");
const playwrightCli = path.join(
  rootDir,
  "node_modules",
  "@playwright",
  "test",
  "cli.js"
);
const HEALTH_URL = "http://127.0.0.1:4000/health";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const runProcess = (command, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with code ${code}`));
    });
  });

const stopProcessTree = async (child) => {
  if (!child?.pid) return;

  if (process.platform === "win32") {
    await runProcess("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
    }).catch(() => undefined);
    return;
  }

  child.kill("SIGTERM");
  await delay(500);
  if (!child.killed) {
    child.kill("SIGKILL");
  }
};

const isHealthy = async () => {
  try {
    const response = await fetch(HEALTH_URL);
    return response.ok;
  } catch {
    return false;
  }
};

const waitForHealth = async (timeoutMs) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isHealthy()) {
      return;
    }
    await delay(1_000);
  }
  throw new Error(`Timed out waiting for backend health at ${HEALTH_URL}`);
};

async function main() {
  const sharedEnv = {
    ...process.env,
    NODE_ENV: "test",
    PORT: "4000",
    JWT_SECRET:
      process.env.JWT_SECRET || "playwright-live-smoke-secret-12345678901234567890",
    REQUEST_LOGGING_ENABLED: "false",
    OBSERVABILITY_ENABLED: "false",
  };

  await runProcess(process.execPath, [tsNodeBin, "prisma/seed.ts"], {
    cwd: backendDir,
    env: sharedEnv,
  });

  let backendServer = null;
  const backendAlreadyRunning = await isHealthy();

  if (!backendAlreadyRunning) {
    backendServer = spawn(process.execPath, [tsNodeBin, "src/index.ts"], {
      cwd: backendDir,
      env: sharedEnv,
      stdio: "inherit",
    });

    try {
      await waitForHealth(120_000);
    } catch (error) {
      await stopProcessTree(backendServer);
      throw error;
    }
  }

  try {
    await runProcess(
      process.execPath,
      [playwrightCli, "test", "ronalds-growth-hub/e2e/launch-readiness.live.spec.ts"],
      {
        cwd: rootDir,
        env: {
          ...process.env,
          PLAYWRIGHT_LIVE_BACKEND: "1",
          PLAYWRIGHT_LIVE_API_ORIGIN: "http://127.0.0.1:4000",
        },
      }
    );
  } finally {
    if (backendServer) {
      await stopProcessTree(backendServer);
    }
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
