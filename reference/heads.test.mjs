import { DEFAULT_HEADS, resolveHeads, enabledDetectors, CATEGORY_HEAD } from "./heads.mjs";

let fails = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL " + m);
    fails++;
  } else console.log("ok   " + m);
};

ok(DEFAULT_HEADS.jigsaw.enabled === true, "toxicity (jigsaw) on");
ok(DEFAULT_HEADS.pii_model.enabled === true, "model PII on");
ok(DEFAULT_HEADS.spam_ml.enabled === true, "spam on");
ok(
  !("nsfw" in DEFAULT_HEADS) && !("jailbreak" in DEFAULT_HEADS) && !("taxonomy" in DEFAULT_HEADS),
  "nsfw / jailbreak / taxonomy heads are not part of the library",
);

const h = resolveHeads({ profanity: { enabled: false } });
ok(h.profanity.enabled === false && h.pii_rules.enabled === true, "override merges per-head");
const en = enabledDetectors(h);
ok(en.profanity === false && en.wordlists === false, "disabling profanity head disables its detectors");
ok(en.validator === true, "unrelated detectors stay enabled");
ok(CATEGORY_HEAD.pii === "pii_rules" && CATEGORY_HEAD.spam === "spam", "category->head map");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
