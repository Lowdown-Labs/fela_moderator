import { useRef, useState } from "react";
import { ModeratedTextarea, type ModeratedTextareaHandle, type Finding, type Decision } from "@lowdown/moderate/react";
import { SEED, type Msg } from "./data";
import { SendDialog } from "./SendDialog";

export function App() {
  const [msgs, setMsgs] = useState<Msg[]>(SEED);
  const [text, setText] = useState("");
  const [dialog, setDialog] = useState<{ findings: Finding[]; resolve: (d: Decision) => void } | null>(null);
  const ref = useRef<ModeratedTextareaHandle>(null);

  const onFlagged = (findings: Finding[]) =>
    new Promise<Decision>((resolve) => setDialog({ findings, resolve }));

  const send = async () => {
    if (!text.trim()) return;
    const decision = await ref.current!.guardSubmit();
    if (decision === "block") return;
    const finalText = decision === "redact" ? ref.current!.redact() : text;
    setMsgs((m) => [...m, { from: "me", text: finalText }]);
    setText("");
  };

  return (
    <div className="mx-auto flex h-screen max-w-md flex-col bg-slate-50">
      <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
        <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-500 text-sm font-bold text-white">C</div>
        <div>
          <div className="text-sm font-semibold text-slate-900">Courier · Alex</div>
          <div className="text-xs text-emerald-600">● online</div>
        </div>
      </header>

      <main className="flex-1 space-y-2 overflow-y-auto p-4">
        {msgs.map((m, i) => (
          <div key={i} className={m.from === "me" ? "flex justify-end" : "flex justify-start"}>
            <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${m.from === "me" ? "bg-emerald-500 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200"}`}>
              {m.text}
            </div>
          </div>
        ))}
      </main>

      <footer className="relative border-t border-slate-200 bg-white p-3">
        {dialog && (
          <SendDialog
            findings={dialog.findings}
            onDecide={(d) => { dialog.resolve(d); setDialog(null); }}
          />
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <ModeratedTextarea
              ref={ref}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFlagged={onFlagged}
              debounceMs={120}
              placeholder="Message the courier…"
              rows={2}
              classNames={{ input: "resize-none rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-400" }}
            />
          </div>
          <button onClick={send} className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-600">
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
