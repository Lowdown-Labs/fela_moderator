import "@lowdown-labs/moderate/web";

const MODEL_BASE = "https://d1ruypri5fhwvl.cloudfront.net/moderator/v1/";
const ORT_WASM = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/";
const SPAM_LABELS = ["spam", "scam", "phishing"];

const app = document.getElementById("app");

app.innerHTML = `
  <header class="head">
    <div>
      <h1>FELA moderate</h1>
      <p>On-device submit gate. Runs in your browser, no server.</p>
    </div>
    <span class="pill" id="model-status" data-state="off">model: off</span>
  </header>

  <section class="chat">
    <div class="bubble" id="peer">
      <span class="who" id="peer-who">Dasher</span>
      <span id="peer-msg">Hey, I'm outside - can you text me your number so I can find you?</span>
    </div>

    <div class="reply">
      <label class="who" for="reply">Your reply</label>
      <div class="reply-row">
        <fela-moderated-input id="reply" placeholder="Type a reply..."></fela-moderated-input>
        <button class="send" id="send" type="button">Send</button>
      </div>
    </div>
  </section>

  <section class="findings">
    <h2>What the gate saw</h2>
    <div id="findings-body"><p class="empty">Nothing flagged. Start typing.</p></div>
  </section>

  <p class="note">
    Phone numbers and other PII are caught by deterministic rules with zero model.
    Turn the model on and it also catches scam and phishing wording that no rule can.
  </p>
`;

const input = document.getElementById("reply");
const sendBtn = document.getElementById("send");
const findingsBody = document.getElementById("findings-body");
const pill = document.getElementById("model-status");

let lastNeural = null;

function scoreFor(f) {
  if (f.source !== "model" || !lastNeural) return null;
  if (SPAM_LABELS.includes(f.type) && lastNeural.spam_ml) return lastNeural.spam_ml.prob;
  if (lastNeural.toxicity && lastNeural.toxicity[f.type]) return lastNeural.toxicity[f.type].prob;
  if (Array.isArray(lastNeural.pii)) {
    const hit = lastNeural.pii.find((p) => p.entity === f.type);
    if (hit && typeof hit.score === "number") return hit.score;
  }
  return null;
}

function render(detail) {
  const findings = detail && detail.findings ? detail.findings.filter((f) => f.severity !== "off") : [];
  if (!findings.length) {
    findingsBody.innerHTML = '<p class="empty">Nothing flagged. Start typing.</p>';
    return;
  }
  const items = findings.map((f) => {
    const src = f.source === "model" ? "model" : "rule";
    const s = scoreFor(f);
    const meta = s == null ? src : `${src} ${s.toFixed(2)}`;
    return `<li><span class="tag">${f.type}</span><span class="meta">${meta}</span></li>`;
  });
  findingsBody.innerHTML = `<ul>${items.join("")}</ul>`;
}

input.addEventListener("gate", (e) => {
  sendBtn.disabled = e.detail.blocked;
});

input.addEventListener("flagged", (e) => {
  render(e.detail);
});

async function loadModel() {
  pill.textContent = "model: loading";
  try {
    const ort = await import("onnxruntime-web");
    ort.env.wasm.wasmPaths = ORT_WASM;
    const config = await (await fetch(MODEL_BASE + "config.json")).json();
    const { createModerator } = await import("@lowdown-labs/moderate/model/runner.mjs");
    const moderate = await createModerator({ ort, model: MODEL_BASE + "moderator.onnx", config });
    input.moderator = async (text) => {
      lastNeural = await moderate(text);
      return lastNeural;
    };
    pill.textContent = "model: ready";
    pill.dataset.state = "ready";
  } catch (err) {
    pill.textContent = "model: off (rules only)";
    pill.dataset.state = "off";
    console.warn("model load failed, rules still active", err);
  }
}

loadModel();
