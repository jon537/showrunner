import { useEffect, useState } from "react";
import { supabase, invoke } from "../lib/supabase";
import { useProjectContext } from "../lib/project";

interface Series {
  premise: string; market: string; series_notes: string;
  story_state: string | null; next_cliffhanger: string | null; shots_per_episode: number;
}
interface Episode { id: string; seq: number; working_title: string | null; status: string; metadata: { caption?: string; cliffhanger?: string } | null; }

const MARKETS = ["South Africa", "Nigeria", "Kenya", "Pan-African"];

export function ScriptPage() {
  const { project } = useProjectContext();
  const [s, setS] = useState<Series | null>(null);
  const [eps, setEps] = useState<Episode[]>([]);
  const [busy, setBusy] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!project) return;
    const { data: p } = await supabase.from("sr_projects")
      .select("premise,market,series_notes,story_state,next_cliffhanger,shots_per_episode")
      .eq("id", project.id).single();
    if (p) setS({
      premise: p.premise ?? "", market: p.market ?? "South Africa", series_notes: p.series_notes ?? "",
      story_state: p.story_state, next_cliffhanger: p.next_cliffhanger, shots_per_episode: p.shots_per_episode ?? 4,
    });
    const { data: e } = await supabase.from("sr_episodes")
      .select("id,seq,working_title,status,metadata").eq("project_id", project.id).order("seq");
    setEps((e as Episode[]) ?? []);
  }
  useEffect(() => { load(); }, [project?.id]);

  async function saveSeries() {
    if (!project || !s) return;
    setSavedMsg(null);
    await supabase.from("sr_projects").update({
      premise: s.premise, market: s.market, series_notes: s.series_notes, shots_per_episode: s.shots_per_episode,
    }).eq("id", project.id);
    setSavedMsg("Saved.");
  }

  async function writeNext(times = 1) {
    if (!project) return;
    setBusy(true); setErr(null);
    try {
      for (let i = 0; i < times; i++) {
        await invoke("sr-write-episode", { project_id: project.id });
        await load();
      }
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }

  if (project && !project.style_locked) {
    return (
      <div className="max-w-md mt-10 space-y-2">
        <h2 className="text-lg font-semibold">Set your Style first</h2>
        <p className="text-sm opacity-70">The script engine writes in your locked style. Do the Style tab, then come back.</p>
      </div>
    );
  }
  if (!s) return <p className="opacity-60 text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Series — {project?.name}</h2>
        <p className="text-sm opacity-60">Agree the premise once. Claude writes each 60s episode as {s.shots_per_episode} × 15s shots (hook → escalate → turn → cliff), advancing the story forever.</p>
      </div>

      {/* Series setup */}
      <div className="bg-white/5 rounded p-4 space-y-3">
        <label className="text-sm opacity-70">Premise (the setup you agree on — logline, world, core conflict, main characters)</label>
        <textarea rows={5} value={s.premise} onChange={e => setS({ ...s, premise: e.target.value })}
          placeholder="e.g. BLOOD & LOBOLA — At her husband's funeral, a woman written off as a gold-digger is publicly humiliated by his mother… then the will names her sole heir. A lobola-and-inheritance war for a Joburg dynasty."
          className="w-full bg-black/40 rounded px-3 py-2 text-sm" />
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-sm opacity-70">Market</label>
          <select value={s.market} onChange={e => setS({ ...s, market: e.target.value })}
            className="bg-black/40 rounded px-2 py-1.5 text-sm">
            {MARKETS.map(m => <option key={m}>{m}</option>)}
          </select>
          <label className="text-sm opacity-70">Shots / episode</label>
          <input type="number" min={2} max={6} value={s.shots_per_episode}
            onChange={e => setS({ ...s, shots_per_episode: Math.max(2, Math.min(6, Number(e.target.value) || 4)) })}
            className="bg-black/40 rounded px-2 py-1.5 w-16 text-sm" />
        </div>
        <textarea rows={2} value={s.series_notes} onChange={e => setS({ ...s, series_notes: e.target.value })}
          placeholder="Optional notes — tone, do's & don'ts, cultural specifics…"
          className="w-full bg-black/40 rounded px-3 py-2 text-sm" />
        <div className="flex items-center gap-3">
          <button onClick={saveSeries} className="bg-white/10 hover:bg-white/20 rounded px-3 py-1.5 text-sm">Save premise</button>
          {savedMsg && <span className="text-emerald-400 text-sm">{savedMsg}</span>}
        </div>
      </div>

      {/* Story memory */}
      {(s.story_state || s.next_cliffhanger) && (
        <div className="bg-white/5 rounded p-4 space-y-2 text-sm">
          <div className="text-xs opacity-40">STORY SO FAR (rolling memory)</div>
          <p className="opacity-80 whitespace-pre-wrap">{s.story_state}</p>
          {s.next_cliffhanger && <p className="text-amber-300">↪ Live cliffhanger: {s.next_cliffhanger}</p>}
        </div>
      )}

      {/* Generate */}
      <div className="flex flex-wrap gap-2 items-center">
        <button disabled={busy || !s.premise} onClick={() => writeNext(1)}
          className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 disabled:opacity-40">
          {busy ? "writing…" : eps.length ? `Write episode ${eps.length + 1} →` : "Write the pilot →"}
        </button>
        <button disabled={busy || !s.premise} onClick={() => writeNext(5)}
          className="bg-white/10 hover:bg-white/20 rounded px-4 py-2 disabled:opacity-40">
          Write 5 episodes
        </button>
        {err && <span className="text-amber-400 text-sm">{err}</span>}
      </div>

      {/* Episodes */}
      <div className="space-y-2">
        {eps.map(ep => (
          <div key={ep.id} className="bg-white/5 rounded p-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="opacity-40">EP {ep.seq}</span>
              <b>{ep.working_title}</b>
              <span className="ml-auto text-xs px-2 py-0.5 rounded bg-black/40 opacity-70">{ep.status}</span>
            </div>
            {ep.metadata?.cliffhanger && <p className="text-amber-300/80 text-xs mt-1">cliff: {ep.metadata.cliffhanger}</p>}
          </div>
        ))}
        {eps.length > 0 && <p className="text-xs opacity-50">→ Go to the <b>Board</b> to render each episode's shots into clips.</p>}
      </div>
    </div>
  );
}
