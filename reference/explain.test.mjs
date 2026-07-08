// Run: node reference/explain.test.mjs
import { explain, explainReason } from "./explain.mjs";
import { moderate } from "./engine.mjs";

let fails = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL " + m);
    fails++;
  } else console.log("ok   " + m);
};

const s = explainReason({
  source: "wordlist",
  detector: "naughty-words:pt",
  label: "slur",
  span: [12, 18],
  matched: "xxx",
  score: 1,
  language: "pt",
});
ok(s.includes("slur") && s.includes("wordlist") && s.includes("pt"), "reason mentions label/source/language");
ok(s.includes("12") && s.includes("18"), "reason mentions the char span");

const model = explainReason({ source: "model", detector: "model.jigsaw", label: "harassment", score: 0.91 });
ok(model.includes("harassment") && model.includes("model") && model.includes("0.91"), "model reason mentions score");

const r = moderate("mail joe@example.com");
ok(explain(r).startsWith("Flagged") && explain(r).includes("EMAIL"), "explain(result) summarizes flags");
ok(explain(moderate("a friendly hello")) === "No moderation flags.", "clean -> no-flags string");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
