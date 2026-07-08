// Per-tool / per-gate latency benchmark. Reports p50/p95 (ms) for each detector individually, for
// normalize(), and for moderate() end-to-end (model-off). Feeds the head registry: a tool that costs
// too much for its signal ships enabled:false. Run directly (`node reference/bench.mjs`) to print a table.
import { performance } from "node:perf_hooks";
import { normalize } from "./normalize.mjs";
import { DETECTORS } from "./detectors/index.mjs";
import { moderate } from "./engine.mjs";

const CORPUS = [
  "just a friendly hello there, nice to meet you",
  "mail joe@example.com or call 415-555-2671 today",
  "you ⓕⓤⓒⓚⓔⓡ and visit bit.ly/abc for a free prize",
  "server 192.168.0.1 ssn 123-45-6789 iban GB82WEST12345698765432",
  "hola amigo, una frase con contenido en varios idiomas",
];

function stats(times) {
  const s = [...times].sort((a, b) => a - b);
  const at = (q) => s[Math.min(s.length - 1, Math.floor(q * s.length))];
  return { p50: +at(0.5).toFixed(4), p95: +at(0.95).toFixed(4) };
}

function time(fn, iterations) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    for (const c of CORPUS) fn(c);
    times.push((performance.now() - t0) / CORPUS.length);
  }
  return stats(times);
}

/** @param {{ iterations?: number }} [opts] */
export function runBench({ iterations = 200 } = {}) {
  const tools = {};
  for (const d of DETECTORS) tools[d.name] = time((c) => d.detect(c), iterations);
  return {
    tools,
    normalize: time((c) => normalize(c), iterations),
    moderate: time((c) => moderate(c), iterations),
  };
}

// Direct run: print a table.
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = runBench();
  console.log("tool           p50(ms)  p95(ms)");
  for (const [name, s] of Object.entries(r.tools))
    console.log(name.padEnd(14), String(s.p50).padStart(7), String(s.p95).padStart(8));
  console.log("normalize".padEnd(14), String(r.normalize.p50).padStart(7), String(r.normalize.p95).padStart(8));
  console.log("moderate".padEnd(14), String(r.moderate.p50).padStart(7), String(r.moderate.p95).padStart(8));
}
