import type { Finding, Decision } from "@lowdown/moderate/react";

const LABEL: Record<string, string> = {
  PHONE: "a phone number", EMAIL: "an email address", SSN: "a social security number",
  CREDITCARD: "a card number", IP: "an IP address", URL: "a link",
};
const friendly = (type: string) => LABEL[type] ?? type.toLowerCase();

export function SendDialog({ findings, onDecide }: { findings: Finding[]; onDecide: (d: Decision) => void }) {
  const types = [...new Set(findings.filter((f) => f.severity !== "off").map((f) => friendly(f.type)))];
  return (
    <div className="absolute inset-0 z-10 flex items-end justify-center bg-black/30 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl ring-1 ring-black/5">
        <h2 className="text-base font-semibold text-slate-900">Hold on — that looks personal</h2>
        <p className="mt-1 text-sm text-slate-500">
          We spotted {types.join(", ")} in your message. Sharing it here could put you at risk.
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button onClick={() => onDecide("redact")} className="rounded-lg bg-slate-900 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800">
            Redact &amp; send
          </button>
          <button onClick={() => onDecide("send")} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
            Send anyway
          </button>
          <button onClick={() => onDecide("block")} className="rounded-lg px-3 py-2 text-sm font-medium text-slate-400 hover:text-slate-600">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
