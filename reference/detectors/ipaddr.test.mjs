import { detect } from "./ipaddr.mjs";

let fails = 0;
const ok = (c, m) => {
  if (!c) {
    console.error("FAIL " + m);
    fails++;
  } else console.log("ok   " + m);
};

const t = "server 192.168.0.1 and 2001:db8::1 here";
const fs = detect(t);
const v4 = fs.find((f) => f.label === "IPV4");
ok(v4 && t.slice(v4.span[0], v4.span[1]) === "192.168.0.1", "ipv4 span exact");
ok(v4.range === "private", "ipv4 classified private");
const v6 = fs.find((f) => f.label === "IPV6");
ok(v6 && t.slice(v6.span[0], v6.span[1]) === "2001:db8::1", "ipv6 span exact");

ok(!detect("code 999.1.1.1 here").some((f) => f.label === "IPV4"), "invalid octet rejected");

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
