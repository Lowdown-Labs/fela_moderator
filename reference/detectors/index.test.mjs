// Run: node reference/detectors/index.test.mjs
import { detect, DETECTORS } from "./index.mjs";
import { normalize } from "../normalize.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

// registry holds all seven adapters
ok(DETECTORS.length === 7, "seven detectors registered");

// without a map: spans are in the passed text's coords
const t = "mail joe@example.com now";
const fs = detect(t);
const email = fs.find((f) => f.label === "EMAIL");
ok(email && t.slice(email.span[0], email.span[1]) === "joe@example.com", "no-map span in text coords");

// with a map: an obfuscated email is caught on normalized text but the span points at ORIGINAL text
const raw = "mail joe@exＡmple.com now"; // fullwidth A in the domain
const { normalized, map } = normalize(raw);
const fs2 = detect(normalized, { map });
const e2 = fs2.find((f) => f.label === "EMAIL");
ok(e2 && raw.slice(e2.span[0], e2.span[1]) === "joe@exＡmple.com", "mapped span points at ORIGINAL obfuscated text");

// disabled detector produces nothing
const off = detect(t, { enabled: { validator: false } });
ok(!off.some((f) => f.detector.startsWith("validator")), "disabled detector skipped");

// throw-isolation: a throwing detector is skipped, onError fires with (error, name), others still run
DETECTORS.push({ name: "boom", detect() { throw new Error("boom"); } });
try {
  const errs = [];
  const res = detect("mail joe@example.com", { onError: (e, name) => errs.push([name, e.message]) });
  ok(errs.some(([n, m]) => n === "boom" && m === "boom"), "onError called with (error, detector name)");
  ok(res.some((f) => f.label === "EMAIL"), "other detectors still run after one throws");
} finally {
  DETECTORS.pop(); // restore the registry so other imports are unaffected
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
