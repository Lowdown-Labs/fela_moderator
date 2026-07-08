// Run: node reference/detectors/profanity.test.mjs
import { detect } from "./profanity.mjs";

let fails = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL " + m);
    fails++;
  } else console.log("ok   " + m);
};

const t = "what the fuck man";
const fs = detect(t);
const f = fs.find((x) => x.detector === "obscenity");
ok(f && t.slice(f.span[0], f.span[1]).toLowerCase().includes("fuck"), "obscenity span covers the word");
ok(f.source === "wordlist" && f.category === "profanity" && f.language === "en", "profanity flag shape");

// leetspeak substitution is caught
ok(detect("you f4ggot").length > 0, "leetspeak caught by obscenity");
// clean text -> nothing
ok(detect("what a lovely day").length === 0, "clean -> no flags");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
