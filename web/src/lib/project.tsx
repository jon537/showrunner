import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase } from "./supabase";

export interface Project {
  id: string;
  name: string;
  pipeline: "microdrama" | "distribution";
  style_brief: string | null;
  style_guide: string | null;
  style_image_url: string | null;
  aspect_ratio: string | null;
  style_locked: boolean;
}

const COLS = "id,name,pipeline,style_brief,style_guide,style_image_url,aspect_ratio,style_locked";
const KEY = "sr_active_project";

interface Ctx {
  projects: Project[];
  project: Project | null;
  loading: boolean;
  reload: () => Promise<void>;
  selectProject: (id: string) => void;
  createProject: (name: string, pipeline?: string) => Promise<void>;
  renameProject: (id: string, name: string) => Promise<void>;
}

const ProjectCtx = createContext<Ctx>(null!);
export const useProjectContext = () => useContext(ProjectCtx);

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(KEY));
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const { data } = await supabase.from("sr_projects").select(COLS).order("created_at");
    const list = (data as Project[]) ?? [];
    setProjects(list);
    setActiveId(prev => {
      const next = prev && list.some(p => p.id === prev) ? prev : (list[0]?.id ?? null);
      if (next) localStorage.setItem(KEY, next);
      return next;
    });
    setLoading(false);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const selectProject = useCallback((id: string) => {
    localStorage.setItem(KEY, id);
    setActiveId(id);
  }, []);

  const createProject = useCallback(async (name: string, pipeline: string = "microdrama") => {
    const { data } = await supabase.from("sr_projects")
      .insert({ name, instance: "personal", kind: "animation", pipeline }).select(COLS).single();
    if (data) {
      setProjects(p => [...p, data as Project]);
      selectProject((data as Project).id);
    }
  }, [selectProject]);

  const renameProject = useCallback(async (id: string, name: string) => {
    await supabase.from("sr_projects").update({ name }).eq("id", id);
    await reload();
  }, [reload]);

  const project = projects.find(p => p.id === activeId) ?? null;

  return (
    <ProjectCtx.Provider
      value={{ projects, project, loading, reload, selectProject, createProject, renameProject }}>
      {children}
    </ProjectCtx.Provider>
  );
}
