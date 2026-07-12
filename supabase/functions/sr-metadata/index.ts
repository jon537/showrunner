// sr-metadata — first stage of the DISTRIBUTION engine. For a finished episode,
// one Claude call produces the per-platform publish package (YouTube title/
// description/tags, TikTok + Instagram captions/hashtags, thumbnail headline),
// stored in episode.metadata.social. Works for both pipelines: microdrama
// episodes (uses premise/series context) and distribute-only uploads.
//
// POST { episode_id, notes? }  ->  { social }
import { CORS, json, preflight, serviceClient, claude, extractJson } from "../_shared/util.ts";

interface Social {
  youtube: { title: string; description: string; tags: string[] };
  tiktok: { caption: string; hashtags: string[] };
  instagram: { caption: string; hashtags: string[] };
  thumbnail: { headline: string };
}

Deno.serve(async (req) => {
  const pf = preflight(req); if (pf) return pf;
  try {
    const { episode_id, notes } = await req.json();
    if (!episode_id) return json({ error: "episode_id required" }, 400);

    const sb = serviceClient();
    const { data: ep, error } = await sb.from("sr_episodes")
      .select("*, sr_projects(name, pipeline, premise, market)")
      .eq("id", episode_id).single();
    if (error || !ep) return json({ error: "episode not found" }, 404);
    const proj = ep.sr_projects;

    const context =
      `PROJECT: ${proj?.name}\n` +
      (proj?.premise ? `SERIES PREMISE: ${proj.premise}\nMARKET: ${proj.market}\n` : "") +
      `EPISODE ${ep.seq ?? ""}: ${ep.working_title ?? "(untitled)"}\n` +
      (ep.metadata?.caption ? `EPISODE CAPTION: ${ep.metadata.caption}\n` : "") +
      (ep.metadata?.cliffhanger ? `ENDS ON CLIFFHANGER: ${ep.metadata.cliffhanger}\n` : "") +
      (notes ? `NOTES: ${notes}\n` : "");

    const out = await claude({
      system:
        "You write publish metadata for a serialized vertical micro-drama episode " +
        "posted free on YouTube Shorts, TikTok and Instagram Reels. Rules: " +
        "YouTube — searchable episodic title that includes the series name and " +
        "episode number (e.g. 'Series Name — EP.7: hook phrase'), a description " +
        "with a 1-2 line teaser (never spoil the cliff), binge prompt to the " +
        "playlist, and hashtags; 10-15 tags. TikTok — a short punchy hook caption " +
        "written to stop a cold scroller + 4-6 hashtags mixing broad (#microdrama) " +
        "and local market tags. Instagram — similar but slightly warmer, 5-8 " +
        "hashtags. Thumbnail — a 3-5 word emotional hook headline in caps. Never " +
        "reveal the cliffhanger's resolution. Return ONLY JSON.",
      user:
        context +
        `\nReturn JSON: {"youtube":{"title":str,"description":str,"tags":[str]},` +
        `"tiktok":{"caption":str,"hashtags":[str]},` +
        `"instagram":{"caption":str,"hashtags":[str]},` +
        `"thumbnail":{"headline":str}}`,
      maxTokens: 1200,
    });
    const social = extractJson<Social>(out);

    await sb.from("sr_episodes").update({
      metadata: { ...(ep.metadata ?? {}), social },
      status: "awaiting_approval",
    }).eq("id", episode_id);

    return json({ social });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
