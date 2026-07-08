// ipaddr.js adapter (MIT): extract IP-ish candidates, validate + classify (private/reserved/loopback).
import ipaddr from "ipaddr.js";

const V4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const V6 = /\b(?:[A-F0-9]{0,4}:){2,7}[A-F0-9]{0,4}\b/gi;

function push(flags, label, val, index) {
  if (!ipaddr.isValid(val)) return;
  let range = "unicast";
  try {
    range = ipaddr.parse(val).range();
  } catch {
    return;
  }
  flags.push({
    source: "rule",
    detector: "ipaddr",
    label,
    span: [index, index + val.length],
    matched: val,
    score: 1,
    category: "pii",
    range,
  });
}

/** @returns {Array<{source:"rule",detector:"ipaddr",label:"IPV4"|"IPV6",span:[number,number],matched:string,score:1,category:"pii",range:string}>} */
export function detect(text) {
  const flags = [];
  for (const m of text.matchAll(V4)) push(flags, "IPV4", m[0], m.index);
  for (const m of text.matchAll(V6)) push(flags, "IPV6", m[0], m.index);
  return flags;
}
