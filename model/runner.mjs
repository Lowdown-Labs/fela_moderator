












import { MAX_LEN, encodeText, piiSpans, toxicity as toxicityFlags } from "../reference/moderate.mjs";


const SCALAR_HEADS = [{ out: "spam", key: "spam_ml", labels: "spam_labels", thr: "spam" }];

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export async function createModerator({ ort, model, config, dtype = "int64" }) {
  const session = await ort.InferenceSession.create(model);
  const inputName = session.inputNames[0]; 
  const JIG = config.jigsaw_labels;
  const PII_TAGS = config.pii_tags;
  const THRESH = config.toxicity_thresholds || {};
  const HT = config.head_thresholds || {};

  return async function moderate(text) {
    const { ids, byteOfToken } = encodeText(text, MAX_LEN);
    const input =
      dtype === "int32"
        ? new ort.Tensor("int32", Int32Array.from(ids), [1, MAX_LEN])
        : new ort.Tensor("int64", BigInt64Array.from(ids, (v) => BigInt(v)), [1, MAX_LEN]);
    const out = await session.run({ [inputName]: input });

    const result = { toxicity: {}, pii: [] };

    
    if (out.jigsaw && JIG) result.toxicity = toxicityFlags(out.jigsaw.data, JIG, THRESH);

    
    for (const h of SCALAR_HEADS) {
      const o = out[h.out];
      const labels = config[h.labels];
      if (!o || !labels) continue;
      const thr = HT[h.thr] || {};
      let maxP = 0,
        top = 0,
        flagged = false;
      for (let i = 0; i < labels.length; i++) {
        const p = sigmoid(o.data[i]);
        if (p > maxP) {
          maxP = p;
          top = i;
        }
        if (p >= (thr[labels[i]] ?? 0.5)) flagged = true;
      }
      result[h.key] = { prob: maxP, flagged, label: labels[top] };
    }

    
    if (out.pii && PII_TAGS) {
      const L = out.pii.dims[1],
        C = out.pii.dims[2];
      const arg = new Array(L);
      for (let t = 0; t < L; t++) {
        let best = 0,
          bv = -Infinity;
        for (let c = 0; c < C; c++) {
          const v = out.pii.data[t * C + c];
          if (v > bv) {
            bv = v;
            best = c;
          }
        }
        arg[t] = best;
      }
      result.pii = piiSpans(arg, byteOfToken, PII_TAGS, text);
    }

    return result;
  };
}
