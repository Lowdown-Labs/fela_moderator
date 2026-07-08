import Foundation

// iOS reference port of the submit-time gate — mirrors sdk/reference/*.mjs (unit-tested) and the
// Android Moderator.kt. Byte tokenization, byte->String.Index mapping for PII redaction, BIO span
// merging, thresholds, and the hybrid gate. The TFLite call is injected (no hard dependency).
//
// NOTE: reference code — reviewed by inspection against the tested JS, not yet built on-device.

private let PAD = 256, CLS = 257, MAX_LEN = 512

private let MODEL_OWNED: Set<String> = [
    "FIRSTNAME", "LASTNAME", "MIDDLENAME", "PREFIX", "USERNAME", "ACCOUNTNAME",
    "STREET", "CITY", "STATE", "COUNTY", "ZIPCODE", "BUILDINGNUMBER", "SECONDARYADDRESS",
    "JOBTITLE", "JOBAREA", "JOBTYPE", "COMPANYNAME", "AGE", "DOB", "GENDER", "SEX", "EYECOLOR", "HEIGHT",
]

public struct ModConfig { public let jigsawLabels: [String]; public let piiTags: [String]; public let toxThresholds: [String: Float] }
public struct ModelOutput { public let jigsaw: [Float]; public let piiArgmax: [Int] } // piiArgmax length 512
public struct PiiSpan { public let entity: String; public let range: Range<String.Index>; public let source: String }
public struct GateResult { public let blocked: Bool; public let reasons: [String]; public let pii: [PiiSpan]; public let toxic: [String] }

public final class Moderator {
    private let cfg: ModConfig
    private let runModel: ([Int]) -> ModelOutput
    public init(cfg: ModConfig, runModel: @escaping ([Int]) -> ModelOutput) { self.cfg = cfg; self.runModel = runModel }

    /// Byte-tokenize: [CLS, b0, ...] padded to 512; returns ids + the byte index per token.
    private func encode(_ text: String) -> (ids: [Int], byteOf: [Int]) {
        let raw = Array(text.utf8)
        var ids = Array(repeating: PAD, count: MAX_LEN); ids[0] = CLS
        var byteOf = Array(repeating: -1, count: MAX_LEN)
        let n = min(raw.count, MAX_LEN - 1)
        for j in 0..<n { ids[j + 1] = Int(raw[j]); byteOf[j + 1] = j }
        return (ids, byteOf)
    }

    /// For every UTF-8 byte offset, the containing Character's String.Index range (redaction unit).
    private func charBoundsByByte(_ text: String) -> (lo: [String.Index], hi: [String.Index]) {
        var lo: [String.Index] = [], hi: [String.Index] = []
        var idx = text.startIndex
        while idx < text.endIndex {
            let next = text.index(after: idx)
            for _ in 0..<text[idx].utf8.count { lo.append(idx); hi.append(next) }
            idx = next
        }
        return (lo, hi)
    }

    private func modelPii(_ argmax: [Int], _ byteOf: [Int], _ text: String) -> [PiiSpan] {
        let (lo, hi) = charBoundsByByte(text)
        var out: [PiiSpan] = []
        var entity: String? = nil, b0 = 0, b1 = 0
        func flush() {
            if let e = entity, MODEL_OWNED.contains(e) { out.append(PiiSpan(entity: e, range: lo[b0]..<hi[b1 - 1], source: "model")) }
            entity = nil
        }
        for t in 1..<byteOf.count {
            let b = byteOf[t]; if b < 0 { continue }
            let tag = cfg.piiTags[argmax[t]]
            if tag == "O" { flush(); continue }
            let parts = tag.split(separator: "-", maxSplits: 1)
            let bio = String(parts[0]); let ent = String(parts[1])
            if bio == "B" || entity != ent { flush(); entity = ent; b0 = b; b1 = b + 1 } else { b1 = b + 1 }
        }
        flush()
        return out
    }

    public func check(_ text: String) -> GateResult {
        let (ids, byteOf) = encode(text)
        let o = runModel(ids)
        let toxic = cfg.jigsawLabels.indices
            .filter { sigmoid(o.jigsaw[$0]) >= (cfg.toxThresholds[cfg.jigsawLabels[$0]] ?? 0.5) }
            .map { cfg.jigsawLabels[$0] }
        let pii = Checkers.structuredPII(text) + modelPii(o.piiArgmax, byteOf, text)
        var reasons: [String] = []
        if !pii.isEmpty { reasons.append("PII: " + Array(Set(pii.map { $0.entity })).joined(separator: ", ")) }
        if !toxic.isEmpty { reasons.append("obscene/toxic: " + toxic.joined(separator: ", ")) }
        return GateResult(blocked: !reasons.isEmpty, reasons: reasons, pii: pii, toxic: toxic)
    }

    public func redact(_ text: String, _ spans: [PiiSpan], mask: Character = "█") -> String {
        var out = text
        for s in spans.sorted(by: { $0.range.lowerBound > $1.range.lowerBound }) {
            let count = out.distance(from: s.range.lowerBound, to: s.range.upperBound)
            out.replaceSubrange(s.range, with: String(repeating: mask, count: count))
        }
        return out
    }
}

private func sigmoid(_ x: Float) -> Float { 1 / (1 + exp(-x)) }

/// FOSS structured-PII checkers (email/phone/SSN/card/IP) — mirroring checkers.mjs.
public enum Checkers {
    public static func structuredPII(_ text: String) -> [PiiSpan] {
        let patterns: [(String, String)] = [
            ("EMAIL", "[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}"),
            ("URL", "https?://\\S+"),
            ("IPV4", "\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b"),
            ("SSN", "\\b\\d{3}-\\d{2}-\\d{4}\\b"),
            ("CREDITCARD", "\\b(?:\\d[ -]?){13,19}\\b"),
            ("PHONE", "\\+?\\d[\\d\\-\\s().]{7,}\\d"),
        ]
        var hits: [PiiSpan] = []
        let ns = text as NSString
        for (type, pat) in patterns {
            guard let re = try? NSRegularExpression(pattern: pat, options: [.caseInsensitive]) else { continue }
            for m in re.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
                let v = ns.substring(with: m.range)
                if type == "CREDITCARD" && !luhn(v) { continue }
                if type == "PHONE" && v.filter(\.isNumber).count < 7 { continue }
                if let r = Range(m.range, in: text) { hits.append(PiiSpan(entity: type, range: r, source: "regex")) }
            }
        }
        let sorted = hits.sorted { $0.range.lowerBound < $1.range.lowerBound }
        var kept: [PiiSpan] = []
        for h in sorted where !kept.contains(where: { h.range.overlaps($0.range) }) { kept.append(h) }
        return kept
    }

    private static func luhn(_ s: String) -> Bool {
        let d = s.filter(\.isNumber); guard (13...19).contains(d.count) else { return false }
        var sum = 0, alt = false
        for c in d.reversed() { var n = c.wholeNumberValue ?? 0; if alt { n *= 2; if n > 9 { n -= 9 } }; sum += n; alt.toggle() }
        return sum % 10 == 0
    }
}
