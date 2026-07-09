import { moderate } from "./engine.mjs";

let fails = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL " + m);
    fails++;
  } else console.log("ok   " + m);
};

const raw = "mail joe@exＡmple.com now";
const r1 = moderate(raw);
const email = r1.reasons.find((x) => x.label === "EMAIL");
ok(email && raw.slice(email.span[0], email.span[1]) === "joe@exＡmple.com", "obfuscated email -> original span");

const r2 = moderate("you ⓕⓤⓒⓚⓔⓡ");
ok(
  r2.reasons.some((x) => x.label === "profanity"),
  "circled-letter profanity caught",
);

const r3 = moderate("mail joe@example.com call 415-555-2671");
ok(
  r3.reasons.length > 0 &&
    r3.reasons.every((x) => !x.span || "mail joe@example.com call 415-555-2671".slice(x.span[0], x.span[1]).length > 0),
  "every span is valid in original text",
);

ok(
  r3.piiSpans.some((p) => p.entity === "EMAIL" && p.source === "rule"),
  "piiSpans carry entity+source",
);

const off = moderate("what the fuck", { config: { heads: { profanity: { enabled: false } } } });
ok(!off.reasons.some((x) => x.label === "profanity"), "disabled profanity head -> no profanity reasons");

const neural = { toxicity: { obscene: { prob: 0.99, flagged: true } } };
const offModel = moderate("hello", { neural, config: { heads: { jigsaw: { enabled: false } } } });
ok(!offModel.reasons.some((x) => x.detector === "model.jigsaw"), "disabled jigsaw head -> no model reasons");

const onModel = moderate("hello", { neural });
ok(
  onModel.reasons.some((x) => x.detector === "model.jigsaw" && x.label === "obscene"),
  "jigsaw reason present",
);
ok(onModel.categories.jigsaw >= 0.99, "categories head->max score");

const dedupe = moderate("call 415-555-2671", {
  neural: { pii: [{ entity: "LASTNAME", text: "555", utf16Start: 9, utf16End: 12 }] },
});
ok(!dedupe.reasons.some((x) => x.label === "LASTNAME"), "model PII overlapping rule PII dropped");

const boost = moderate("what the fuck", { neural: { toxicity: { obscene: { prob: 0.8, flagged: true } } } });
const jig = boost.reasons.find((x) => x.detector === "model.jigsaw");
ok(jig && jig.score > 0.8, "jigsaw score boosted by profanity corroboration");

ok(!moderate("a friendly hello").flagged, "clean -> not flagged");

const sm = moderate("hello", { neural: { spam_ml: { prob: 0.99, flagged: true, label: "phishing" } } });
ok(
  sm.reasons.some((r) => r.detector === "model.spam_ml" && r.label === "phishing"),
  "spam model head -> reason with sublabel",
);

const ghost = moderate("hello", {
  neural: {
    jailbreak: { prob: 0.99, flagged: true, label: "role_hijack" },
    nsfw: { prob: 0.99, flagged: true, label: "sexual_suggestive" },
  },
});
ok(!ghost.reasons.some((r) => /jailbreak|nsfw/.test(r.detector)), "removed heads (jailbreak/nsfw) never surface");

const emailProf = moderate("assface@example.com");
ok(
  emailProf.reasons.some((r) => r.label === "EMAIL") && !emailProf.reasons.some((r) => r.label === "profanity"),
  "profanity inside a validated PII span is suppressed",
);

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
