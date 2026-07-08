// Run: node reference/engine.test.mjs
import { moderate } from "./engine.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

// (a) obfuscated PII caught post-normalize, span points at ORIGINAL text
const raw = "mail joe@exＡmple.com now"; // fullwidth A
const r1 = moderate(raw);
const email = r1.reasons.find((x) => x.label === "EMAIL");
ok(email && raw.slice(email.span[0], email.span[1]) === "joe@exＡmple.com", "obfuscated email -> original span");

// (a2) obfuscated profanity (circled letters fold via NFKC)
const r2 = moderate("you ⓕⓤⓒⓚⓔⓡ");
ok(r2.reasons.some((x) => x.label === "profanity"), "circled-letter profanity caught");

// (b) every reason with a span slices to a non-empty original substring
const r3 = moderate("mail joe@example.com call 415-555-2671");
ok(r3.reasons.length > 0 && r3.reasons.every((x) => !x.span || "mail joe@example.com call 415-555-2671".slice(x.span[0], x.span[1]).length > 0), "every span is valid in original text");

// piiSpans populated, source recorded
ok(r3.piiSpans.some((p) => p.entity === "EMAIL" && p.source === "rule"), "piiSpans carry entity+source");

// (d) disabling a rule head removes its reasons
const off = moderate("what the fuck", { config: { heads: { profanity: { enabled: false } } } });
ok(!off.reasons.some((x) => x.label === "profanity"), "disabled profanity head -> no profanity reasons");

// (d2) disabled model head never appears even when neural flags it
const neural = { toxicity: { obscene: { prob: 0.99, flagged: true } } };
const offModel = moderate("hello", { neural, config: { heads: { jigsaw: { enabled: false } } } });
ok(!offModel.reasons.some((x) => x.detector === "model.jigsaw"), "disabled jigsaw head -> no model reasons");

// model jigsaw appears when enabled, contributes a category
const onModel = moderate("hello", { neural });
ok(onModel.reasons.some((x) => x.detector === "model.jigsaw" && x.label === "obscene"), "jigsaw reason present");
ok(onModel.categories.jigsaw >= 0.99, "categories head->max score");

// PII dedupe: a model PII span overlapping a rule PII span is dropped
const dedupe = moderate("call 415-555-2671", { neural: { pii: [{ entity: "LASTNAME", text: "555", utf16Start: 9, utf16End: 12 }] } });
ok(!dedupe.reasons.some((x) => x.label === "LASTNAME"), "model PII overlapping rule PII dropped");

// agreement boost: profanity rule corroborates jigsaw -> boosted score
const boost = moderate("what the fuck", { neural: { toxicity: { obscene: { prob: 0.80, flagged: true } } } });
const jig = boost.reasons.find((x) => x.detector === "model.jigsaw");
ok(jig && jig.score > 0.80, "jigsaw score boosted by profanity corroboration");

// clean text -> not flagged
ok(!moderate("a friendly hello").flagged, "clean -> not flagged");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
