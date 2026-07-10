import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface Project { id: string; name: string; style_note: string | null; }

// Loads projects; creates a default one if none exist. Returns the active project.
export function useProject() {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("sr_projects").select("id,name,style_note").limit(1);
      if (data && data.length) { setProject(data[0]); return; }
      const { data: created } = await supabase.from("sr_projects")
        .insert({ name: "My Microdrama", instance: "personal", kind: "animation" })
        .select("id,name,style_note").single();
      setProject(created ?? null);
    })();
  }, []);

  return project;
}
