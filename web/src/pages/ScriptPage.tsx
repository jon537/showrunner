import { useState } from "react";
import { supabase, invoke } from "../lib/supabase";
import { useProjectContext } from "../lib/project";

interface Shot { seq: number; beat_text: string; seedance_prompt: string; }

export function ScriptPage() {
  const { project } = useProjectContext();
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ working_title: string; shots: Shot[] } | null>(null);

  async function run() {
    if (!project || !text.trim()) return;
    setBusy(true); setResult(null);
    try {
      const { data: script } = await supabase.from("sr_scripts")
        .insert({ project_id: project.id, title, raw_text: text }).select().single();
      const res = await invoke<{ working_title: string; shots: Shot[] }>(
        "sr-breakdown", { script_id: script!.id });
      setResult(res);
    } catch (e) { alert("Breakdown failed: " + String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Script → 4 beats</h2>
        <p className="text-sm opacity-60">Paste a ~60s microdrama. Claude splits it into 4 × 15s beats and binds your Bible characters/props/locations to each.</p>
      </div>
      <input placeholder="episode title" value={title} onChange={e => setTitle(e.target.value)}
        className="w-full bg-white/5 rounded px-3 py-2" />
      <textarea placeholder="Paste the 60-second script here…" value={text}
        onChange={e => setText(e.target.value)} rows={10}
        className="w-full bg-white/5 rounded px-3 py-2 font-mono text-sm" />
      <button disabled={busy} onClick={run}
        className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 disabled:opacity-40">
        {busy ? "breaking down…" : "Break into 4 beats"}
      </button>

      {result && (
        <div className="space-y-3 mt-4">
          <h3 className="font-semibold">{result.working_title}</h3>
          {result.shots.map(s => (
            <div key={s.seq} className="bg-white/5 rounded p-3">
              <div className="text-xs opacity-40 mb-1">BEAT {s.seq} · 15s</div>
              <div className="text-sm mb-2">{s.beat_text}</div>
              <div className="text-xs opacity-70 font-mono bg-black/40 rounded p-2">{s.seedance_prompt}</div>
            </div>
          ))}
          <p className="text-sm opacity-60">→ Go to <b>Board</b> to render these into clips.</p>
        </div>
      )}
    </div>
  );
}
