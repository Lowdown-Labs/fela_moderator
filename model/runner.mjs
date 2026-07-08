// Portable ONNX runner: turns the shipped model into the `neural` object check()/ModeratedTextarea
// expect. Works in the browser (onnxruntime-web) and Node (onnxruntime-node) — same API; you inject
// `ort` and the model source, so this file has no hard dependency and bundles anywhere.
//
//   import * as ort from "onnxruntime-web";
//   const moderate = await createModerator({ ort, model: "/moderator.onnx", config });
//   const neural = await moderate(text);            // { toxicity, pii }
//   if (check(text, { neural }).blocked) reject();
//
import { MAX_LEN, encodeText, piiSpans, toxicity as toxicityFlags } from "../reference/moderate.mjs";

export async function createModerator({ ort, model, config }) {
  const session = await ort.InferenceSession.create(model);
  const inputName = session.inputNames[0]; // "input_ids"
  const JIG = config.jigsaw_labels;
  const PII_TAGS = config.pii_tags;
  const THRESH = config.toxicity_thresholds;

  const byLastDim = (out, d) => Object.values(out).find((t) => t.dims[t.dims.length - 1] === d);

  return async function moderate(text) {
    const { ids, byteOfToken } = encodeText(text, MAX_LEN);
    const input = new ort.Tensor("int32", Int32Array.from(ids), [1, MAX_LEN]);
    const out = await session.run({ [inputName]: input });

    const jig = byLastDim(out, JIG.length).data; // Float32Array[6] logits
    const toxicity = toxicityFlags(jig, JIG, THRESH);

    const piiT = byLastDim(out, PII_TAGS.length); // [1, 512, 113] logits
    const L = piiT.dims[1], C = piiT.dims[2];
    const arg = new Array(L);
    for (let t = 0; t < L; t++) {
      let best = 0, bv = -Infinity;
      for (let c = 0; c < C; c++) {
        const v = piiT.data[t * C + c];
        if (v > bv) { bv = v; best = c; }
      }
      arg[t] = best;
    }
    const pii = piiSpans(arg, byteOfToken, PII_TAGS, text);
    return { toxicity, pii };
  };
}
