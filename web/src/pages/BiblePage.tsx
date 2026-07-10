import { useEffect, useState } from "react";
import { supabase, invoke } from "../lib/supabase";
import { useProject } from "../lib/useProject";

type Kind = "character" | "prop" | "location";
interface Asset {
  id: string; kind: Kind; name: string; description: string | null;
  ref_slot: number | null; status: string; reference_image_urls: string[];
}

export function BiblePage() {
  const project = useProject();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [kind, setKind] = useState<Kind>("character");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    if (!project) return;
    const { data } = await supabase.from("sr_assets")
      .select("*").eq("project_id", project.id).order("kind").order("ref_slot");
    setAssets((data as Asset[]) ?? []);
  }
  useEffect(() => { load(); }, [project?.id]);

  async function add() {
    if (!project || !name) return;
    const slot = assets.filter(a => a.kind === kind).length + 1;
    await supabase.from("sr_assets").insert({
      project_id: project.id, kind, name, description: desc, ref_slot: slot, status: "draft",
    });
    setName(""); setDesc(""); load();
  }

  async function generate(id: string) {
    setBusy(id);
    try { await invoke("sr-generate-asset", { asset_id: id }); await load(); }
    catch (e) { alert("Generate failed: " + String(e)); }
    finally { setBusy(null); }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Bible — {project?.name ?? "…"}</h2>
        <p className="text-sm opacity-60">Build character, prop &amp; location reference sheets. Claude writes the prompt → Nano Banana renders the sheet.</p>
      </div>

      <div className="flex flex-wrap gap-2 items-end bg-white/5 p-3 rounded">
        <select value={kind} onChange={e => setKind(e.target.value as Kind)}
          className="bg-black/40 rounded px-2 py-1.5">
          <option value="character">character</option>
          <option value="prop">prop</option>
          <option value="location">location</option>
        </select>
        <input placeholder="name" value={name} onChange={e => setName(e.target.value)}
          className="bg-black/40 rounded px-2 py-1.5" />
        <input placeholder="wardrobe / details" value={desc} onChange={e => setDesc(e.target.value)}
          className="bg-black/40 rounded px-2 py-1.5 flex-1 min-w-[200px]" />
        <button onClick={add} className="bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1.5">Add</button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {assets.map(a => (
          <div key={a.id} className="bg-white/5 rounded p-3 space-y-2">
            <div className="aspect-square bg-black/40 rounded overflow-hidden flex items-center justify-center">
              {a.reference_image_urls?.[0]
                ? <img src={a.reference_image_urls[0]} className="w-full h-full object-cover" />
                : <span className="text-xs opacity-40">no sheet yet</span>}
            </div>
            <div className="text-sm">
              <span className="opacity-40">[{a.kind} · slot {a.ref_slot}]</span><br />
              <b>{a.name}</b>
            </div>
            <button disabled={busy === a.id} onClick={() => generate(a.id)}
              className="w-full text-sm bg-white/10 hover:bg-white/20 rounded px-2 py-1 disabled:opacity-40">
              {busy === a.id ? "generating…" : a.status === "ready" ? "regenerate" : "generate sheet"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
