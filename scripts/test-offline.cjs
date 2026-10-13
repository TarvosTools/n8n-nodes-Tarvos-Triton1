const { spawnSync } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "..");
const stages = [];
function run(name, args, cwd = root) {
  console.log(`\nTesting: ${name}`);
  const r = spawnSync(process.execPath, args, {
    cwd,
    stdio: "inherit",
    windowsHide: true,
  });
  stages.push({ name, status: r.status === 0 ? "PASS" : "FAIL" });
  if (r.status !== 0) throw Error(name + " failed");
}
const npm = process.env.npm_execpath;
if (!npm) throw Error("Run using npm run test:offline");
try {
  run("build", [npm, "run", "build"]);
  run("generated fixtures", [path.join(root, "scripts/generate-examples.cjs")]);
  run("typecheck", [npm, "run", "typecheck"]);
  run("lint", [npm, "run", "lint"]);
  run("node suites", [
    "--test",
    ...fs
      .readdirSync(path.join(root, "test"))
      .filter((f) => f.endsWith(".test.cjs"))
      .map((f) => path.join(root, "test", f)),
  ]);
  run("gRPC loopback", [path.join(root, "scripts/grpc-loopback.cjs")]);
  run("worker suites", [npm, "test"], path.join(root, "worker"));
  run("worker bounded load", [path.join(root, "scripts/worker-load.cjs")]);
  const candidates = [
    process.env.N8N_TEST_RUNTIME,
    path.join(root, ".test-runtime/node_modules"),
    path.resolve(root, "../n8n-x402-runtime/node_modules"),
  ].filter(Boolean);
  const runtime = candidates.find((p) =>
    fs.existsSync(path.join(p, "n8n-core")),
  );
  if (runtime)
    run("actual n8n execution context", [
      path.join(root, "scripts/runtime-smoke.cjs"),
      runtime,
    ]);
  else {
    stages.push({
      name: "actual n8n execution context",
      status: "BLOCKED",
      reason:
        "Run npm run test:setup-runtime or set N8N_TEST_RUNTIME to its node_modules path.",
    });
    process.exitCode = 2;
  }
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
} finally {
  fs.mkdirSync(path.join(root, "test-results"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "test-results/offline.json"),
    JSON.stringify(
      { at: new Date().toISOString(), node: process.version, stages },
      null,
      2,
    ),
  );
}
