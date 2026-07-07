// Unit tests for the byte<->UTF-16 offset mapping + PII redaction on multi-byte text.
// Run: node test.mjs
import { encodeText, charBoundsByByte, piiSpans, redact, toxicity } from "./moderate.mjs";

let fails = 0;
const eq = (got, want, msg) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.error(`FAIL ${msg}\n   got  ${g}\n   want ${w}`); fails++; }
  else { console.log(`ok   ${msg}`); }
};

const TAGS = ["O", "B-EMAIL", "I-EMAIL", "B-PHONE", "I-PHONE"]; // minimal; reference is index-agnostic

// tag the tokens whose byte falls in [b0,b1) with B-/I-<ent>
function tagBytes(text, ranges) {
  const { byteOfToken, ids } = encodeText(text);
  const arg = new Array(ids.length).fill(0);
  for (const { b0, b1, ent } of ranges) {
    let first = true;
    for (let t = 1; t < byteOfToken.length; t++) {
      const b = byteOfToken[t];
      if (b >= b0 && b < b1) { arg[t] = TAGS.indexOf((first ? "B-" : "I-") + ent); first = false; }
    }
  }
  return { arg, byteOfToken };
}

// "你好 a@b.co 😀!" — CJK(3B,1u) x2, space, ascii email, space, astral emoji(4B,2u), bang.
const T = "你好 a@b.co 😀!";
const cb = charBoundsByByte(T);
eq(cb.totalUtf16, T.length, "totalUtf16 == string.length (13)");
eq(cb.startOf[7], 3, "byte 7 ('a') -> utf16 start 3");    // after 你好<space> = 3 units
eq(cb.endOf[12], 9, "byte 12 ('o') -> utf16 end 9");
eq(cb.startOf[14], 10, "byte 14 (emoji) -> utf16 start 10");
eq(cb.endOf[17], 12, "byte 17 (emoji last byte) -> utf16 end 12 (astral = 2 units)");

// EMAIL over bytes 7..12, PHONE-like over the emoji (astral redaction check)
{
  const { arg, byteOfToken } = tagBytes(T, [{ b0: 7, b1: 13, ent: "EMAIL" }, { b0: 14, b1: 18, ent: "PHONE" }]);
  const spans = piiSpans(arg, byteOfToken, TAGS, T);
  eq(spans.map((s) => [s.entity, s.text]), [["EMAIL", "a@b.co"], ["PHONE", "😀"]], "spans map to exact substrings");
  eq(spans[0].utf16Start + "," + spans[0].utf16End, "3,9", "email utf16 range 3..9");
  eq(redact(T, spans), "你好 ██████ █!", "redaction masks whole chars incl. astral emoji");
}

// pure-ASCII sanity: byte offset == utf16 offset
{
  const A = "email me: joe@x.io ok";
  const { arg, byteOfToken } = tagBytes(A, [{ b0: 10, b1: 18, ent: "EMAIL" }]);
  const spans = piiSpans(arg, byteOfToken, TAGS, A);
  eq(spans[0].text, "joe@x.io", "ascii email extracted");
  eq(redact(A, spans), "email me: ████████ ok", "ascii redaction");
}

// toxicity thresholding
{
  const flags = toxicity([2.5, -3, -1, -5, 0.1, -2], ["toxic", "severe_toxic", "obscene", "threat", "insult", "identity_hate"],
    { toxic: 0.9, insult: 0.87 });
  eq(flags.toxic.flagged, true, "toxic flagged (sigmoid(2.5)=0.92 >= 0.9)");
  eq(flags.insult.flagged, false, "insult not flagged (sigmoid(0.1)=0.52 < 0.87)");
}

console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
