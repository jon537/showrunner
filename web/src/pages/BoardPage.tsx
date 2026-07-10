import { useEffect, useState } from "react";
import { supabase, invoke } from "../lib/supabase";
import { useProject } from "../lib/useProject";

interface Episode { id: string; working_title: string | null; status: string; created_at: string; }
interface PrepShot { seq: number; mode: string; prompt?: string; slots?: string[]; beat?: string; }

export function BoardPage() {
  const project = useProject();
  const [eps, setEps] = useState<Episode[]>([]);
  const [prep, setPrep] = useState<Record<string, PrepShot[]>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!project) return;
    const { data } = await supabase.from("sr_episodes")
      .select("id,working_title,status,created_at")
      .eq("project_id", project.id).order("created_at", { ascending: false });
    setEps((data as Episode[]) ?? []);
  }
  useEffect(() => { load(); }, [project?.id]);

  async function render(id: string) {
    setBusy(id);
    try {
      const res = await invoke<{ mode: string; shots: PrepShot[] }>("sr-render", { episode_id: id });
      setPrep(p => ({ ...p, [id]: res.shots }));
      await load();
    } catch (e) { alert("Render failed: " + String(e)); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Board</h2>
      <p className="text-sm opacity-60">Each episode = 4 beats. Render to get the Seedance pack (prompt + reference slots) for each clip, then hand the clips to your editor.</p>

      {eps.map(ep => (
        <div key={ep.id} className="bg-white/5 rounded p-3 space-y-2">
          <div className="flex items-center gap-2">
            <b>{ep.working_title ?? "(untitled)"}</b>
            <span className="text-xs px-2 py-0.5 rounded bg-black/40 opacity-70">{ep.status}</span>
            <button disabled={busy === ep.id} onClick={() => render(ep.id)}
              className="ml-auto text-sm bg-white/10 hover:bg-white/20 rounded px-3 py-1 disabled:opacity-40">
              {busy === ep.id ? "…" : "Render / prep clips"}
            </button>
          </div>
          {prep[ep.id]?.map(s => (
            <div key={s.seq} className="bg-black/30 rounded p-2 text-xs">
              <div className="opacity-40 mb-1">CLIP {s.seq} · mode: {s.mode}</div>
              {s.prompt && <div className="font-mono mb-1">{s.prompt}</div>}
              {s.slots && s.slots.length > 0 && (
                <div className="flex gap-1">
                  {s.slots.map((u, i) => (
                    <img key={i} src={u} title={`slot ${i + 1}`}
                      className="w-12 h-12 object-cover rounded border border-white/10" />
                  ))}
                </div>
              )}
              {s.mode === "prep" && (
                <div className="opacity-50 mt-1">↑ load these into Seedance slots (image 1..N), paste the prompt, render.</div>
              )}
            </div>
          ))}
        </div>
      ))}
      {!eps.length && <p className="opacity-40 text-sm">No episodes yet — break down a script first.</p>}
    </div>
  );
}
