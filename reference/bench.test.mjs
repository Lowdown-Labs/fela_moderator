// Run: node reference/bench.test.mjs
import { runBench } from "./bench.mjs";

let fails = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL " + m);
    fails++;
  } else console.log("ok   " + m);
};

const report = runBench({ iterations: 20 });
ok(report.tools.validator && typeof report.tools.validator.p50 === "number", "per-tool p50 present");
ok(typeof report.normalize.p95 === "number", "normalize timing present");
ok(typeof report.moderate.p50 === "number", "moderate end-to-end timing present");
ok(Object.keys(report.tools).length === 7, "all seven detectors timed individually");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
