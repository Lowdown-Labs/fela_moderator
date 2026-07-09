import * as validator from "./validator.mjs";
import * as phone from "./phone.mjs";
import * as ipaddr from "./ipaddr.mjs";
import * as presidio from "./presidio.mjs";
import * as profanity from "./profanity.mjs";
import * as wordlists from "./wordlists.mjs";
import * as spam from "./spam.mjs";

export const DETECTORS = [
  { name: "validator", detect: validator.detect },
  { name: "phone", detect: phone.detect },
  { name: "ipaddr", detect: ipaddr.detect },
  { name: "presidio", detect: presidio.detect },
  { name: "profanity", detect: profanity.detect },
  { name: "wordlists", detect: wordlists.detect },
  { name: "spam", detect: spam.detect },
];

export function detect(text, { map, enabled, detectorOpts = {}, onError } = {}) {
  const out = [];
  for (const d of DETECTORS) {
    if (enabled && enabled[d.name] === false) continue;
    let flags;
    try {
      flags = d.detect(text, detectorOpts[d.name]);
    } catch (e) {
      onError?.(e, d.name);
      continue;
    }
    for (const f of flags) {
      const span = map ? map.toOriginal(f.span[0], f.span[1]) : f.span;
      out.push({ ...f, span });
    }
  }
  return out;
}
