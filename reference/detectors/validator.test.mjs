// Run: node reference/detectors/validator.test.mjs
import { detect } from "./validator.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };
const has = (fs, label) => fs.find((f) => f.label === label);

const t = "mail joe@example.com see http://x.com card 4111 1111 1111 1111 end";
const fs = detect(t);
const email = has(fs, "EMAIL");
ok(email && t.slice(email.span[0], email.span[1]) === "joe@example.com", "email span exact");
ok(email.detector === "validator.email" && email.source === "rule" && email.score === 1, "email flag shape");
const url = has(fs, "URL");
ok(url && t.slice(url.span[0], url.span[1]) === "http://x.com", "url span exact");
const cc = has(fs, "CREDITCARD");
ok(cc && cc.matched.replace(/\D/g, "") === "4111111111111111", "credit card matched (Luhn valid)");

// a non-Luhn 16-digit run is rejected
ok(!detect("1234 5678 9012 3456").some((f) => f.label === "CREDITCARD"), "non-Luhn card rejected");
// clean text -> nothing
ok(detect("just a hello").length === 0, "clean -> no flags");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
