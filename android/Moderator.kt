package com.lowdown.moderate

object Bytes { const val PAD = 256; const val CLS = 257; const val MAX_LEN = 512 }

data class ModConfig(
    val jigsawLabels: List<String>,
    val piiTags: List<String>,
    val toxThresholds: Map<String, Float>,
)

data class ModelOutput(val jigsaw: FloatArray, val piiArgmax: IntArray)

data class PiiSpan(val entity: String, val start: Int, val end: Int, val source: String)

data class GateResult(val blocked: Boolean, val reasons: List<String>, val pii: List<PiiSpan>, val toxic: List<String>)

class Moderator(private val cfg: ModConfig, private val runModel: (IntArray) -> ModelOutput) {

    private fun encode(text: String): Pair<IntArray, IntArray> {
        val raw = text.toByteArray(Charsets.UTF_8)
        val ids = IntArray(Bytes.MAX_LEN) { Bytes.PAD }
        val byteOf = IntArray(Bytes.MAX_LEN) { -1 }
        ids[0] = Bytes.CLS
        val n = minOf(raw.size, Bytes.MAX_LEN - 1)
        for (j in 0 until n) { ids[j + 1] = raw[j].toInt() and 0xFF; byteOf[j + 1] = j }
        return ids to byteOf
    }

    private fun charBoundsByByte(text: String): Pair<IntArray, IntArray> {
        val starts = ArrayList<Int>(); val ends = ArrayList<Int>()
        var u = 0; var i = 0
        while (i < text.length) {
            val cp = text.codePointAt(i)
            val units = Character.charCount(cp)
            val bl = String(Character.toChars(cp)).toByteArray(Charsets.UTF_8).size
            repeat(bl) { starts.add(u); ends.add(u + units) }
            u += units; i += units
        }
        return starts.toIntArray() to ends.toIntArray()
    }

    private fun modelPii(argmax: IntArray, byteOf: IntArray, text: String): List<PiiSpan> {
        val (starts, ends) = charBoundsByByte(text)
        val out = ArrayList<PiiSpan>()
        var entity: String? = null; var b0 = 0; var b1 = 0
        fun flush() { entity?.let { out.add(PiiSpan(it, starts[b0], ends[b1 - 1], "model")) }; entity = null }
        for (t in 1 until byteOf.size) {
            val b = byteOf[t]; if (b < 0) continue
            val tag = cfg.piiTags[argmax[t]]
            if (tag == "O") { flush(); continue }
            val dash = tag.indexOf('-'); val bio = tag.substring(0, dash); val ent = tag.substring(dash + 1)
            if (bio == "B" || entity != ent) { flush(); entity = ent; b0 = b; b1 = b + 1 } else b1 = b + 1
        }
        flush()
        return out.filter { it.entity in MODEL_OWNED }
    }

    fun check(text: String): GateResult {
        val (ids, byteOf) = encode(text)
        val out = runModel(ids)
        val toxic = cfg.jigsawLabels.indices.filter { sigmoid(out.jigsaw[it]) >= (cfg.toxThresholds[cfg.jigsawLabels[it]] ?: 0.5f) }
            .map { cfg.jigsawLabels[it] }
        val pii = Checkers.structuredPII(text) + modelPii(out.piiArgmax, byteOf, text)
        val reasons = ArrayList<String>()
        if (pii.isNotEmpty()) reasons.add("PII: " + pii.map { it.entity }.distinct().joinToString(", "))
        if (toxic.isNotEmpty()) reasons.add("obscene/toxic: " + toxic.joinToString(", "))
        return GateResult(reasons.isNotEmpty(), reasons, pii, toxic)
    }

    fun redact(text: String, spans: List<PiiSpan>, mask: Char = '█'): String {
        var out = text
        for (s in spans.sortedByDescending { it.start })
            out = out.substring(0, s.start) + mask.toString().repeat(s.end - s.start) + out.substring(s.end)
        return out
    }

    companion object {
        private fun sigmoid(x: Float) = (1.0 / (1.0 + Math.exp(-x.toDouble()))).toFloat()
        val MODEL_OWNED = setOf(
            "FIRSTNAME", "LASTNAME", "MIDDLENAME", "PREFIX", "USERNAME", "ACCOUNTNAME",
            "STREET", "CITY", "STATE", "COUNTY", "ZIPCODE", "BUILDINGNUMBER", "SECONDARYADDRESS",
            "JOBTITLE", "JOBAREA", "JOBTYPE", "COMPANYNAME", "AGE", "DOB", "GENDER", "SEX", "EYECOLOR", "HEIGHT",
        )
    }
}

object Checkers {
    private val RE = linkedMapOf(
        "EMAIL" to Regex("[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", RegexOption.IGNORE_CASE),
        "URL" to Regex("https?://\\S+", RegexOption.IGNORE_CASE),
        "IPV4" to Regex("\\b(?:\\d{1,3}\\.){3}\\d{1,3}\\b"),
        "SSN" to Regex("\\b\\d{3}-\\d{2}-\\d{4}\\b"),
        "CREDITCARD" to Regex("\\b(?:\\d[ -]?){13,19}\\b"),
        "PHONE" to Regex("\\+?\\d[\\d\\-\\s().]{7,}\\d"),
    )
    private fun luhn(s: String): Boolean {
        val d = s.filter { it.isDigit() }; if (d.length !in 13..19) return false
        var sum = 0; var alt = false
        for (i in d.length - 1 downTo 0) { var n = d[i] - '0'; if (alt) { n *= 2; if (n > 9) n -= 9 }; sum += n; alt = !alt }
        return sum % 10 == 0
    }
    fun structuredPII(text: String): List<PiiSpan> {
        val hits = ArrayList<PiiSpan>()
        for ((type, re) in RE) for (m in re.findAll(text)) {
            val v = m.value
            if (type == "CREDITCARD" && !luhn(v)) continue
            if (type == "PHONE" && v.count { it.isDigit() } < 7) continue
            hits.add(PiiSpan(type, m.range.first, m.range.last + 1, "regex"))
        }
        val sorted = hits.sortedWith(compareBy({ it.start }, { -(it.end - it.start) }))
        val kept = ArrayList<PiiSpan>()
        for (h in sorted) if (kept.none { h.start < it.end && it.start < h.end }) kept.add(h)
        return kept
    }
}
