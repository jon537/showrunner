import { useEffect, useState } from "react";
import { supabase, invoke } from "../lib/supabase";
import { useProjectContext } from "../lib/project";

interface Concept {
  title: string; logline: string; engine: string;
  why_it_works: string; core_cast: string[]; tone: string;
}
interface MapEntry { ep: number; logline: string; cliff: string; }

const MARKETS = ["South Africa", "Nigeria", "Kenya", "Pan-African"];

// STEP 0 — pitch 3 concepts, choose a direction, then (post-Style) map the season
// + manifest the whole world into the Bible.
export function StoryPage({ goStyle }: { goStyle: () => void }) {
  const { project, reload } = useProjectContext();
  const [market, setMarket] = useState("South Africa");
  const [notes, setNotes] = useState("");
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [chosen, setChosen] = useState<Concept | null>(null);
  const [seasonMap, setSeasonMap] = useState<MapEntry[]>([]);
  const [epCount, setEpCount] = useState(100);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [planned, setPlanned] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!project) return;
      const { data } = await supabase.from("sr_projects")
        .select("market,premise,concept,season_map").eq("id", project.id).single();
      if (data?.market) setMarket(data.market);
      if (data?.concept) setChosen(data.concept as Concept);
      if (Array.isArray(data?.season_map)) setSeasonMap(data.season_map as MapEntry[]);
    })();
  }, [project?.id]);

  async function pitch() {
    if (!project) return;
    setBusy("pitch"); setErr(null);
    try {
      await supabase.from("sr_projects").update({ market }).eq("id", project.id);
      const res = await invoke<{ concepts: Concept[] }>("sr-pitch-concepts",
        { project_id: project.id, market, research_notes: notes });
      setConcepts(res.concepts);
    } catch (e) { setErr(String(e)); }
    finally { setBusy(null); }
  }

  async function choose(c: Concept) {
    if (!project) return;
    setBusy("choose"); setErr(null);
    try {
      const premise =
        `${c.title} — ${c.logline}\n\nSERIAL ENGINE: ${c.engine}\nTONE: ${c.tone}\n` +
        `CORE CAST: ${c.core_cast?.join("; ")}`;
      const { error } = await supabase.from("sr_projects").update({
        name: c.title, premise, concept: c as unknown as Record<string, unknown>, market,
      }).eq("id", project.id);
      if (error) throw new Error(`Could not save the concept: ${error.message}`);
      setChosen(c); setConcepts([]);
      await reload();
    } catch (e) { setErr(String(e)); }
    finally { setBusy(null); }
  }

  async function plan() {
    if (!project) return;
    setBusy("plan"); setErr(null); setPlanned(null);
    try {
      const res = await invoke<{ episodes: number; characters: number; props: number; locations: number }>(
        "sr-plan-series", { project_id: project.id, episodes: epCount });
      setPlanned(`Mapped ${res.episodes} episodes · ${res.characters} characters · ${res.props} props · ${res.locations} locations → all in the Bible.`);
      const { data } = await supabase.from("sr_projects").select("season_map").eq("id", project.id).single();
      if (Array.isArray(data?.season_map)) setSeasonMap(data.season_map as MapEntry[]);
    } catch (e) { setErr(String(e)); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Step 0 — Story</h2>
        <p className="text-sm opacity-60">Pick a market, get 3 pitched directions (seed with your own research if you have it), choose one — then map the whole series.</p>
      </div>

      {/* Concept picker */}
      {!chosen && (
        <div className="bg-white/5 rounded p-4 space-y-3">
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-sm opacity-70">Market</label>
            <select value={market} onChange={e => setMarket(e.target.value)}
              className="bg-black/40 rounded px-2 py-1.5 text-sm">
              {MARKETS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)}
            placeholder="Optional — paste your own research / format thinking / a direction you're leaning toward. It will be weighed heavily."
            className="w-full bg-black/40 rounded px-3 py-2 text-sm" />
          <button disabled={busy === "pitch"} onClick={pitch}
            className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 disabled:opacity-40">
            {busy === "pitch" ? "pitching…" : concepts.length ? "Pitch 3 fresh concepts" : "Pitch me 3 concepts"}
          </button>
        </div>
      )}

      {concepts.map((c, i) => (
        <div key={i} className="bg-white/5 rounded p-4 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{c.title}</h3>
            <span className="text-xs opacity-50">{c.tone}</span>
            <button disabled={busy === "choose"} onClick={() => choose(c)}
              className="ml-auto bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1.5 text-sm disabled:opacity-40">
              Choose this →
            </button>
          </div>
          <p className="text-sm opacity-90">{c.logline}</p>
          <p className="text-sm opacity-70"><b>Engine:</b> {c.engine}</p>
          <p className="text-sm opacity-70"><b>Why it works:</b> {c.why_it_works}</p>
          {c.core_cast?.length > 0 && (
            <p className="text-xs opacity-50">Cast: {c.core_cast.join(" · ")}</p>
          )}
        </div>
      ))}

      {/* Chosen direction */}
      {chosen && (
        <div className="bg-emerald-600/10 border border-emerald-600/30 rounded p-4 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">✓ {chosen.title}</h3>
            <button onClick={() => { setChosen(null); setConcepts([]); }}
              className="ml-auto text-xs bg-white/10 hover:bg-white/20 rounded px-2 py-1">change direction</button>
          </div>
          <p className="text-sm opacity-80">{chosen.logline}</p>
          {!project?.style_locked ? (
            <button onClick={goStyle}
              className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 text-sm">
              Next: lock the Style →
            </button>
          ) : (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-2">
                <label className="text-sm opacity-70">Map</label>
                <input type="number" min={10} max={100} value={epCount}
                  onChange={e => setEpCount(Math.max(10, Math.min(100, Number(e.target.value) || 100)))}
                  className="bg-black/40 rounded px-2 py-1.5 w-20 text-sm" />
                <label className="text-sm opacity-70">episodes</label>
                <button disabled={busy === "plan"} onClick={plan}
                  className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 text-sm disabled:opacity-40">
                  {busy === "plan" ? "mapping season + casting world… (~1 min)" : seasonMap.length ? "Re-map the series" : "Map the series + build the world →"}
                </button>
              </div>
              {planned && <p className="text-emerald-400 text-sm">{planned} Head to the <b>Bible</b> to cast + sheet them.</p>}
            </div>
          )}
        </div>
      )}

      {/* Season map */}
      {seasonMap.length > 0 && (
        <div className="bg-white/5 rounded p-4 space-y-1">
          <div className="text-xs opacity-40 mb-2">SEASON MAP · {seasonMap.length} episodes</div>
          <div className="max-h-80 overflow-y-auto space-y-1 pr-2">
            {seasonMap.map(m => (
              <p key={m.ep} className="text-xs opacity-75">
                <b className="opacity-60">EP {m.ep}</b> {m.logline} <span className="text-amber-300/70">⚡ {m.cliff}</span>
              </p>
            ))}
          </div>
        </div>
      )}

      {err && <p className="text-amber-400 text-sm">{err}</p>}
    </div>
  );
}
