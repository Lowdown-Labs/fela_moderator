// Tests for the two-knob gate. Run: node validate.test.mjs
import { check, redactText, maskValue, DEFAULT_POLICY } from "./validate.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

// default policy blocks both
ok(DEFAULT_POLICY.pii === "block" && DEFAULT_POLICY.toxicity === "block", "default blocks both");

// regex PII -> a pii/block finding
const g1 = check("email me at joe@example.com");
ok(g1.blocked, "email -> blocked by default");
ok(g1.findings.some((f) => f.category === "pii" && f.type === "EMAIL" && f.severity === "block" && f.source === "regex"), "email finding shape");

// pii:"warn" -> warned, not blocked
const g2 = check("call 415-555-0199", { policy: { pii: "warn", toxicity: "block" } });
ok(!g2.blocked && g2.warned, "pii warn -> warned not blocked");
ok(g2.findings[0].severity === "warn", "finding severity follows policy");

// pii:"off" -> finding still emitted, not blocked/warned
const g3 = check("call 415-555-0199", { policy: { pii: "off", toxicity: "block" } });
ok(!g3.blocked && !g3.warned, "pii off -> silent");
ok(g3.findings.some((f) => f.type === "PHONE" && f.severity === "off"), "off findings still emitted");

// neural: toxicity + unstructured PII; structured model entities dropped
const neural = {
  toxicity: { obscene: { prob: 0.95, flagged: true } },
  pii: [
    { entity: "FIRSTNAME", text: "Jane", utf16Start: 0, utf16End: 4 },
    { entity: "EMAIL", text: "x@y.com", utf16Start: 5, utf16End: 12 },
  ],
};
const g4 = check("Jane x@y.com hi", { neural });
ok(g4.findings.some((f) => f.category === "toxicity" && f.type === "obscene" && f.start === -1), "toxicity finding shape");
ok(g4.findings.some((f) => f.type === "FIRSTNAME" && f.source === "model"), "model owns FIRSTNAME");
ok(!g4.findings.some((f) => f.type === "EMAIL" && f.source === "model"), "model EMAIL dropped");
ok(g4.findings.some((f) => f.type === "EMAIL" && f.source === "regex"), "regex still catches email");

// toxicity:"off" silences toxicity but PII still blocks
const g5 = check("Jane x@y.com hi", { neural, policy: { pii: "block", toxicity: "off" } });
ok(g5.blocked, "pii still blocks when toxicity off");
ok(!g5.findings.some((f) => f.category === "toxicity" && f.severity !== "off"), "toxicity silenced");

// redaction
ok(maskValue({ type: "EMAIL", text: "joe@example.com" }).startsWith("j***@"), "email mask");
ok(maskValue({ type: "PHONE", text: "4155550199" }) === "4********9", "generic mask keeps ends");
const rt = redactText("call 415-555-0199 now", check("call 415-555-0199 now").findings);
ok(!rt.includes("415-555-0199"), "redactText removes the phone");

// clean text
ok(!check("just a friendly hello").blocked, "clean -> allowed");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
