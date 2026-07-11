import { useEffect, useState } from "react";
import { invoke } from "../lib/supabase";
import { useProject } from "../lib/useProject";

// STEP 1 — define the locked look for the whole series before anything else.
export function StylePage() {
  const { project, reload } = useProject();
  const [brief, setBrief] = useState("");
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (project?.style_brief) setBrief(project.style_brief);
    if (project?.aspect_ratio === "16:9" || project?.aspect_ratio === "9:16")
      setAspect(project.aspect_ratio);
  }, [project?.id]);

  async function generate() {
    if (!project || !brief.trim()) return;
    setBusy(true); setErr(null);
    try {
      await invoke("sr-generate-style", {
        project_id: project.id, style_brief: brief, aspect_ratio: aspect,
      });
      await reload();
    } catch (e) { setErr(String(e)); }
    finally { setBusy(false); }
  }

  const locked = project?.style_locked;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">Step 1 — Style</h2>
        <p className="text-sm opacity-60">
          Define the look ONCE. It's injected into every character, prop, location, and clip.
          {locked && <span className="text-emerald-400"> ✓ Style is locked.</span>}
        </p>
      </div>

      <div className="bg-white/5 rounded p-4 space-y-3">
        <label className="text-sm opacity-70">Describe the style you want</label>
        <textarea rows={4} value={brief} onChange={e => setBrief(e.target.value)}
          placeholder="e.g. gritty photorealistic noir, muted teal/amber grade, 35mm film grain, moody low-key lighting…"
          className="w-full bg-black/40 rounded px-3 py-2 text-sm" />

        <div className="flex items-center gap-3">
          <span className="text-sm opacity-70">Aspect ratio</span>
          {(["9:16", "16:9"] as const).map(a => (
            <button key={a} onClick={() => setAspect(a)}
              className={`px-3 py-1.5 rounded text-sm ${aspect === a ? "bg-emerald-600" : "bg-white/10 hover:bg-white/20"}`}>
              {a} {a === "9:16" ? "(vertical)" : "(landscape)"}
            </button>
          ))}
        </div>

        {err && <p className="text-amber-400 text-sm">{err}</p>}
        <button disabled={busy} onClick={generate}
          className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 disabled:opacity-40">
          {busy ? "enhancing + rendering style plate…" : locked ? "Regenerate style" : "Generate style"}
        </button>
      </div>

      {locked && (
        <div className="grid md:grid-cols-2 gap-4">
          <div className="bg-white/5 rounded p-3">
            <div className="text-xs opacity-40 mb-2">STYLE PLATE · {project?.aspect_ratio}</div>
            {project?.style_image_url
              ? <img src={project.style_image_url} className="w-full rounded" />
              : <span className="text-xs opacity-40">no plate</span>}
          </div>
          <div className="bg-white/5 rounded p-3">
            <div className="text-xs opacity-40 mb-2">STYLE GUIDE (injected everywhere)</div>
            <p className="text-sm whitespace-pre-wrap opacity-80">{project?.style_guide}</p>
          </div>
        </div>
      )}
    </div>
  );
}
