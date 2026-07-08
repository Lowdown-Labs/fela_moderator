// Run: node reference/detectors/spam.test.mjs
import { detect } from "./spam.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

const t = "you won a free prize claim at bit.ly/abc now";
const fs = detect(t);
const sh = fs.find((f) => f.label === "SHORTENER");
ok(sh && t.slice(sh.span[0], sh.span[1]).startsWith("bit.ly/"), "shortener span");
const kw = fs.find((f) => f.label === "SCAM_KEYWORD" && f.matched === "free prize");
ok(kw && t.slice(kw.span[0], kw.span[1]) === "free prize", "scam keyword span");
ok(fs.every((f) => f.source === "rule" && f.category === "spam"), "spam flag shape");
ok(detect("meeting notes for tuesday").length === 0, "clean -> no flags");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
