import { useEffect, useState } from "react";
import { supabase, invoke } from "../lib/supabase";
import { useProjectContext } from "../lib/project";
import { ZoomImg } from "../components/ZoomImg";

type Kind = "character" | "prop" | "location";
interface Asset {
  id: string; kind: Kind; name: string; description: string | null;
  ref_slot: number | null; status: string;
  options: string[]; chosen_image_url: string | null; reference_image_urls: string[];
}

export function BiblePage() {
  const { project } = useProjectContext();
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

  async function run(id: string, fn: () => Promise<unknown>) {
    setBusy(id);
    try { await fn(); await load(); }
    catch (e) { alert("Failed: " + String(e)); }
    finally { setBusy(null); }
  }

  const genOptions = (id: string) => run(id, () => invoke("sr-generate-options", { asset_id: id }));
  const genSheet = (id: string) => run(id, () => invoke("sr-generate-sheet", { asset_id: id }));
  const choose = (id: string, url: string) => run(id, async () => {
    await supabase.from("sr_assets").update({ chosen_image_url: url, status: "chosen" }).eq("id", id);
  });
  const recast = (id: string) => run(id, async () => {
    await supabase.from("sr_assets").update({ chosen_image_url: null, status: "casting" }).eq("id", id);
  });

  // Upload your own image (e.g. Midjourney) — it joins the options; choose it,
  // then the app builds the reference sheet from it just like a generated one.
  const uploadOwn = (a: Asset, file: File) => run(a.id, async () => {
    if (!project) return;
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `${project.id}/bible/${a.kind}/${a.id}/upload-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("showrunner")
      .upload(path, file, { upsert: true, contentType: file.type || "image/png" });
    if (error) throw error;
    const url = supabase.storage.from("showrunner").getPublicUrl(path).data.publicUrl;
    const opts = Array.isArray(a.options) ? a.options : [];
    await supabase.from("sr_assets").update({ options: [...opts, url], status: "casting" }).eq("id", a.id);
  });

  if (project && !project.style_locked) {
    return (
      <div className="max-w-md mt-10 space-y-2">
        <h2 className="text-lg font-semibold">Set your Style first</h2>
        <p className="text-sm opacity-70">
          Every character, prop and location must be generated in the series' locked style.
          Head to the <b>Style</b> tab (Step 1), define the look + aspect ratio, then come back here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Bible — {project?.name ?? "…"}</h2>
        <p className="text-sm opacity-60">Cast → pick a look → lock the reference sheet. Click any image to enlarge.</p>
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

      <div className="space-y-4">
        {assets.map(a => {
          const opts = Array.isArray(a.options) ? a.options : [];
          const working = busy === a.id;
          return (
            <div key={a.id} className="bg-white/5 rounded p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <span className="opacity-40">[{a.kind} · slot {a.ref_slot}]</span>
                <b>{a.name}</b>
                <span className="opacity-40">{a.description}</span>
                <span className="ml-auto text-xs px-2 py-0.5 rounded bg-black/40 opacity-70">{a.status}</span>
              </div>

              {/* READY — the locked reference sheet */}
              {a.status === "ready" && a.reference_image_urls?.[0] && (
                <div className="space-y-2">
                  <div className="text-xs opacity-40">REFERENCE SHEET (locked)</div>
                  <ZoomImg src={a.reference_image_urls[0]} className="max-h-72 rounded" />
                  <div className="flex gap-2">
                    <button disabled={working} onClick={() => genSheet(a.id)}
                      className="text-sm bg-white/10 hover:bg-white/20 rounded px-3 py-1 disabled:opacity-40">
                      {working ? "…" : "↻ Regenerate sheet"}
                    </button>
                    <button disabled={working} onClick={() => recast(a.id)}
                      className="text-sm bg-white/10 hover:bg-white/20 rounded px-3 py-1 disabled:opacity-40">
                      Re-cast
                    </button>
                  </div>
                </div>
              )}

              {/* CHOSEN — a look is locked, build the sheet */}
              {a.status !== "ready" && a.chosen_image_url && (
                <div className="space-y-2">
                  <div className="text-xs opacity-40">CHOSEN LOOK</div>
                  <ZoomImg src={a.chosen_image_url} className="max-h-64 rounded" />
                  <div className="flex gap-2">
                    <button disabled={working} onClick={() => genSheet(a.id)}
                      className="text-sm bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-1 disabled:opacity-40">
                      {working ? "building sheet…" : "Generate reference sheet →"}
                    </button>
                    <button disabled={working} onClick={() => recast(a.id)}
                      className="text-sm bg-white/10 hover:bg-white/20 rounded px-3 py-1 disabled:opacity-40">
                      Pick different
                    </button>
                  </div>
                </div>
              )}

              {/* CASTING — options to choose from */}
              {a.status !== "ready" && !a.chosen_image_url && (
                <div className="space-y-2">
                  {opts.length > 0 && (
                    <>
                      <div className="text-xs opacity-40">CASTING — pick a look</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                        {opts.map((url, i) => (
                          <div key={i} className="space-y-1">
                            <ZoomImg src={url} className="w-full aspect-square object-cover rounded" />
                            <button disabled={working} onClick={() => choose(a.id, url)}
                              className="w-full text-xs bg-emerald-600 hover:bg-emerald-500 rounded px-2 py-1 disabled:opacity-40">
                              Choose
                            </button>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                  <div className="flex flex-wrap gap-2 items-center">
                    <button disabled={working} onClick={() => genOptions(a.id)}
                      className="text-sm bg-white/10 hover:bg-white/20 rounded px-3 py-1.5 disabled:opacity-40">
                      {working ? "generating 2 options…" : opts.length ? "Generate 2 more" : "Generate 2 options"}
                    </button>
                    <label className={`text-sm bg-white/10 hover:bg-white/20 rounded px-3 py-1.5 cursor-pointer ${working ? "opacity-40 pointer-events-none" : ""}`}>
                      ⤴ Upload your own
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => { const f = e.target.files?.[0]; if (f) uploadOwn(a, f); e.currentTarget.value = ""; }} />
                    </label>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
