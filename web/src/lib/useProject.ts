import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface Project {
  id: string;
  name: string;
  style_brief: string | null;
  style_guide: string | null;
  style_image_url: string | null;
  aspect_ratio: string | null;
  style_locked: boolean;
}

const COLS = "id,name,style_brief,style_guide,style_image_url,aspect_ratio,style_locked";

// Loads the project (creates a default if none). Returns it plus a reload().
export function useProject() {
  const [project, setProject] = useState<Project | null>(null);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("sr_projects").select(COLS).limit(1);
    if (data && data.length) { setProject(data[0] as Project); return; }
    const { data: created } = await supabase.from("sr_projects")
      .insert({ name: "My Microdrama", instance: "personal", kind: "animation" })
      .select(COLS).single();
    setProject((created as Project) ?? null);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  return { project, reload };
}
