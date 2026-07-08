// Run: node reference/normalize.test.mjs
import { normalize, skeleton } from "./normalize.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };

// NFKC folds compat chars; unhomoglyph folds confusables. NFKC must run first (circled r).
ok(skeleton("ⓡ") === "r", "NFKC folds circled r");
ok(skeleton("Ⅴ") === "V", "NFKC folds roman numeral V");
ok(skeleton("Аpple") === "Apple", "unhomoglyph folds Cyrillic A");

// normalize applies skeleton (+ optional lowercase) and reports normalized text
const { normalized } = normalize("Ⅴ1@gⓡ@", { lowercase: false });
ok(normalized.includes("V") && normalized.includes("r"), "obfuscated form canonicalized");
ok(normalize("ABC", { lowercase: true }).normalized === "abc", "lowercase option");

// offset map: a span in normalized coords maps back to whole original chars
const n = normalize("aⓡb");            // 'ⓡ' is one original code unit that folds to 'r'
const rIdx = n.normalized.indexOf("r"); // position of the folded char in normalized
const [s, e] = n.map.toOriginal(rIdx, rIdx + 1);
ok(n.normalized === "arb", "circled r folded inline");
ok("aⓡb".slice(s, e) === "ⓡ", "span maps to the original circled r");

// astral/multi-unit original char maps as a whole
const emoji = normalize("x😀y");
ok(emoji.normalized === "x😀y", "emoji unchanged by NFKC");
const eStart = emoji.normalized.indexOf("😀");
const [es, ee] = emoji.map.toOriginal(eStart, eStart + 2); // emoji is 2 UTF-16 units
ok("x😀y".slice(es, ee) === "😀", "astral char maps whole");

// NFD / combining marks compose under whole-string NFKC semantics; the map covers base+mark
const nfd = "élite";                        // genuinely decomposed: base e + combining acute U+0301
const cm = normalize(nfd);
ok(cm.normalized === nfd.normalize("NFKC") && cm.normalized.length === 5, "NFD combining mark composes to 5-unit form");
const [cs, ce] = cm.map.toOriginal(0, 1);         // the composed é
ok(nfd.slice(cs, ce) === "é", "composed char maps to base+mark (2 units) in original");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
