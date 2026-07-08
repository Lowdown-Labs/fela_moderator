// Run: node reference/detectors/wordlists.test.mjs
import nw from "naughty-words";
import { detect } from "./wordlists.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

// pick a real Spanish term from the shipped list so the test can't drift from the data
const esWord = nw.es[0];
const t = `hola ${esWord} amigo`;
const fs = detect(t);
const hit = fs.find((f) => f.language === "es");
ok(hit && t.slice(hit.span[0], hit.span[1]) === esWord, "Spanish slur span exact");
ok(hit.detector === "naughty-words:es" && hit.source === "wordlist" && hit.category === "profanity", "wordlist flag shape");

// substring inside a bigger word does NOT fire (boundary check)
ok(!detect(`x${esWord}yzq`).some((f) => f.language === "es"), "no substring false-positive");
// clean text -> nothing
ok(detect("una frase totalmente limpia").length === 0, "clean -> no flags");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
