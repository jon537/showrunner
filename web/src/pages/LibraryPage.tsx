import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useProjectContext } from "../lib/project";

interface Episode {
  id: string; seq: number | null; working_title: string | null;
  status: string; final_video_url: string | null; created_at: string;
}

// The entry point of the DISTRIBUTION half: finished videos come in here
// (uploaded directly, or handed back by the editor on microdrama projects),
// then flow into metadata -> thumbnail -> approval -> scheduled publish (Phase 2).
export function LibraryPage() {
  const { project } = useProjectContext();
  const [eps, setEps] = useState<Episode[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    if (!project) return;
    const { data } = await supabase.from("sr_episodes")
      .select("id,seq,working_title,status,final_video_url,created_at")
      .eq("project_id", project.id).not("final_video_url", "is", null)
      .order("created_at", { ascending: false });
    setEps((data as Episode[]) ?? []);
  }
  useEffect(() => { load(); }, [project?.id]);

  async function upload(file: File) {
    if (!project) return;
    setBusy(true); setErr(null);
    try {
      const ext = (file.name.split(".").pop() || "mp4").toLowerCase();
      const path = `${project.id}/library/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("showrunner")
        .upload(path, file, { upsert: true, contentType: file.type || "video/mp4" });
      if (error) throw error;
      const url = supabase.storage.from("showrunner").getPublicUrl(path).data.publicUrl;
      const { count } = await supabase.from("sr_episodes")
        .select("id", { count: "exact", head: true }).eq("project_id", project.id);
      const { error: ie } = await supabase.from("sr_episodes").insert({
        project_id: project.id, seq: (count ?? 0) + 1,
        working_title: file.name.replace(/\.[^.]+$/, ""),
        status: "editor_returned", final_video_url: url,
      });
      if (ie) throw ie;
      await load();
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Library — {project?.name}</h2>
        <p className="text-sm opacity-60">Finished videos land here, then flow to metadata → thumbnail → approval → scheduled publish (the distribution engine — Phase 2, being built next).</p>
      </div>

      <label className={`inline-block bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 cursor-pointer ${busy ? "opacity-40 pointer-events-none" : ""}`}>
        {busy ? "uploading…" : "⤴ Upload finished video"}
        <input type="file" accept="video/*" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.currentTarget.value = ""; }} />
      </label>
      {err && <p className="text-amber-400 text-sm">{err}</p>}

      <div className="grid md:grid-cols-2 gap-4">
        {eps.map(ep => (
          <div key={ep.id} className="bg-white/5 rounded p-3 space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <b>{ep.working_title ?? "(untitled)"}</b>
              <span className="ml-auto text-xs px-2 py-0.5 rounded bg-black/40 opacity-70">{ep.status}</span>
            </div>
            {ep.final_video_url && (
              <video src={ep.final_video_url} controls className="w-full rounded max-h-96 bg-black" />
            )}
          </div>
        ))}
        {!eps.length && <p className="text-sm opacity-40">No videos yet — upload the first one.</p>}
      </div>
    </div>
  );
}
