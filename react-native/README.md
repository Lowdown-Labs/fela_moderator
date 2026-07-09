# React Native

RN runs JavaScript, so the SDK reuses the **same tested JS**, no separate native port. The regex gate
(`reference/checkers.mjs` + `validate.mjs`) runs in pure JS instantly; the neural model runs through
`onnxruntime-react-native` (same `ort` API as web/node) or `react-native-fast-tflite`.

## Install

```sh
npm i @lowdown-labs/moderate onnxruntime-react-native
# download moderator.onnx (or .tflite) from the Lowdown CDN and bundle it as an asset (android/app/src/main/assets/)
```

## Use, same runner as web/node

```js
import * as ort from "onnxruntime-react-native";
import { createModerator } from "@lowdown-labs/moderate/model/runner.mjs";
import { check } from "@lowdown-labs/moderate";
import config from "@lowdown-labs/moderate/config.json";

// once (app start): load the model asset, then keep `moderate` around
const moderate = await createModerator({ ort, model: modelUri, config });

// on form submit:
const neural = await moderate(text);            // { toxicity, pii }
const gate = check(text, { neural });           // hybrid: + regex structured PII
if (gate.blocked) {
  setError(gate.reasons.join("; "));            // e.g. "PII: EMAIL, PHONE; obscene/toxic: insult"
  return;                                        // don't save to backend
}
```

## A ready component

`react/ModeratedTextarea` works in RN too (swap the `<textarea>` for `<TextInput>`); pass the neural
runner as the `neural` prop and read the gate through the `onBlocked` / `onWarn` / `onClean` callbacks:

```jsx
<ModeratedTextarea
  neural={moderate}
  policy={{ pii: "block", toxicity: "warn" }}
  onBlocked={(findings) => setCanSave(false)}
  onWarn={(findings) => setCanSave(true)}
  onClean={() => setCanSave(true)}
/>
```

For submit-time gating, hold a ref and call `guardSubmit()` (returns `"send" | "block" | "redact"`), or pass
`onFlagged` to decide per submit. Style through the `classNames` slots (`root` / `input` / `banner`).

## Notes

- **Byte-level = no tokenizer** to bundle, the input is just the UTF-8 bytes of the string.
- The regex gate needs **no model** and works before the model finishes loading (structured PII is caught
  immediately); the neural result refines it (obscenity + names/addresses) when ready.
- TFLite path: use `react-native-fast-tflite` and feed the same `input_ids int32[1,512]`; post-process
  with `reference/moderate.mjs` (`toxicity`, `piiSpans`) exactly as `model/runner.mjs` does for ONNX.
- Model bytes never leave the device; all inference is local.

Reference ports for fully-native apps (no RN): [`../android/Moderator.kt`](../android/Moderator.kt),
[`../ios/Moderator.swift`](../ios/Moderator.swift).
