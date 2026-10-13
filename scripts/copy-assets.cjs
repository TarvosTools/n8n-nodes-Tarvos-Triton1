const fs = require("node:fs");
fs.cpSync(
  "nodes/TarvosTritonTrigger/proto",
  "dist/nodes/TarvosTritonTrigger/proto",
  { recursive: true },
);
