import { check, redactText } from "../reference/validate.mjs";

class FelaModeratedInput extends HTMLElement {
  connectedCallback() {
    const ph = this.getAttribute("placeholder") || "";
    this.innerHTML = `
      <textarea part="input" placeholder="${ph}" style="width:100%;min-height:5rem;font:inherit;padding:.5rem"></textarea>
      <p part="banner" class="fela-banner" role="alert" hidden style="margin:.25rem 0 0"></p>`;
    const ta = this.querySelector("textarea");
    const banner = this.querySelector(".fela-banner");
    let timer;
    ta.addEventListener("input", () => {
      clearTimeout(timer);
      timer = setTimeout(
        async () => {
          let neural = null;
          if (this.moderator && ta.value.trim()) {
            try {
              neural = await this.moderator(ta.value);
            } catch {}
          }
          const g = check(ta.value, { neural, policy: this.policy });
          this.value = ta.value;
          this.blocked = g.blocked;
          this.warned = g.warned;
          const types = [...new Set(g.findings.filter((f) => f.severity !== "off").map((f) => f.type))];
          banner.hidden = !(g.blocked || g.warned);
          banner.dataset.severity = g.blocked ? "block" : "warn";
          banner.textContent = banner.hidden
            ? ""
            : `${g.blocked ? "🚫 Can't send" : "⚠️ Heads up"}: ${types.join(", ")}`;
          ta.setAttribute("aria-invalid", String(g.blocked));

          const decide = (decision) => {
            if (decision === "redact") {
              ta.value = redactText(ta.value, g.findings);
              ta.dispatchEvent(new Event("input"));
            }
            return decision;
          };
          this.dispatchEvent(new CustomEvent("flagged", { detail: { ...g, decide } }));
          this.dispatchEvent(new CustomEvent("gate", { detail: { blocked: g.blocked, reasons: types } }));
        },
        Number(this.getAttribute("debounce") || 200),
      );
    });
  }
}
customElements.define("fela-moderated-input", FelaModeratedInput);
