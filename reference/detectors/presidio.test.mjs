// Run: node reference/detectors/presidio.test.mjs
import { detect } from "./presidio.mjs";

let fails = 0;
const ok = (c, m) => { if (!c) { console.error("FAIL " + m); fails++; } else console.log("ok   " + m); };
const find = (t, label) => detect(t).find((f) => f.label === label);

ok(find("ssn 123-45-6789 x", "SSN")?.matched === "123-45-6789", "SSN matched");
ok(!find("bad 000-45-6789", "SSN"), "SSN area 000 rejected");
ok(find("iban GB82WEST12345698765432 x", "IBAN")?.matched === "GB82WEST12345698765432", "IBAN matched");
ok(find("bic DEUTDEFF x", "BIC")?.matched === "DEUTDEFF", "BIC matched");
ok(find("btc 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa x", "BITCOINADDRESS")?.matched?.startsWith("1A1zP1"), "BTC matched");
ok(find("eth 0x52908400098527886E0F7030069857D2E4169EE7 x", "ETHEREUMADDRESS")?.matched?.startsWith("0x5290"), "ETH matched");
const s = detect("ssn 123-45-6789");
ok(s[0].detector === "presidio.ssn" && s[0].source === "rule" && s[0].category === "pii", "flag shape");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
