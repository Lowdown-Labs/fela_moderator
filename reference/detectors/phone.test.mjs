// Run: node reference/detectors/phone.test.mjs
import { detect } from "./phone.mjs";

let fails = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL " + m);
    fails++;
  } else console.log("ok   " + m);
};

const t = "call me at 415-555-2671 tomorrow";
const fs = detect(t);
const p = fs.find((f) => f.label === "PHONE");
ok(p && t.slice(p.span[0], p.span[1]) === "415-555-2671", "phone span exact");
ok(p.detector === "libphonenumber" && p.suggestion === "+14155552671", "phone flag + E.164 suggestion");

// a random digit run that is not a valid number is rejected
ok(!detect("order 12 34 for 5 items").some((f) => f.label === "PHONE"), "invalid number rejected");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
