import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { ProjectProvider, useProjectContext } from "./lib/project";
import { StoryPage } from "./pages/StoryPage";
import { StylePage } from "./pages/StylePage";
import { BiblePage } from "./pages/BiblePage";
import { ScriptPage } from "./pages/ScriptPage";
import { BoardPage } from "./pages/BoardPage";
import { LibraryPage } from "./pages/LibraryPage";

type Tab = "story" | "style" | "bible" | "script" | "board" | "library";

export function App() {
  const [session, setSession] = useState<unknown>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPass, setNewPass] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!supabaseConfigured) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!supabaseConfigured) {
    return (
      <Shell>
        <div className="max-w-md mx-auto mt-24 space-y-3">
          <h1 className="text-2xl font-semibold">Showrunner — not configured</h1>
          <p className="text-sm opacity-70">
            Set <code className="mx-1 px-1 bg-white/10 rounded">VITE_SUPABASE_URL</code> and
            <code className="mx-1 px-1 bg-white/10 rounded">VITE_SUPABASE_ANON_KEY</code> in
            Vercel (Production), then Redeploy.
          </p>
        </div>
      </Shell>
    );
  }

  if (!ready) return <Shell><p className="opacity-60">Loading…</p></Shell>;

  // Arrived via a password-reset link → set a new password.
  if (recovery) {
    async function setNewPassword() {
      setBusy(true); setMsg(null);
      const { error } = await supabase.auth.updateUser({ password: newPass });
      if (error) setMsg(error.message);
      else { setRecovery(false); setNewPass(""); setMsg(null); }
      setBusy(false);
    }
    return (
      <Shell>
        <div className="max-w-sm mx-auto mt-24 space-y-3">
          <h1 className="text-2xl font-semibold">Set a new password</h1>
          <input className="w-full bg-white/5 rounded px-3 py-2 outline-none" type="password"
            placeholder="new password" autoComplete="new-password" value={newPass}
            onChange={e => setNewPass(e.target.value)} />
          {msg && <p className="text-amber-400 text-sm">{msg}</p>}
          <button disabled={busy || newPass.length < 6} onClick={setNewPassword}
            className="w-full bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-2 disabled:opacity-40">
            Save new password
          </button>
        </div>
      </Shell>
    );
  }

  if (!session) {
    async function signIn() {
      setBusy(true); setMsg(null);
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg(error.message);
      setBusy(false);
    }
    async function signUp() {
      setBusy(true); setMsg(null);
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg(error.message);
      else if (!data.session) setMsg("Account created. Check your email to confirm, then Sign in.");
      setBusy(false);
    }
    async function forgotPassword() {
      if (!email) { setMsg("Enter your email above first, then click Forgot password."); return; }
      setBusy(true); setMsg(null);
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
      setMsg(error ? error.message : "Reset email sent — open the link, then set a new password.");
      setBusy(false);
    }
    return (
      <Shell>
        <div className="max-w-sm mx-auto mt-24 space-y-3">
          <h1 className="text-2xl font-semibold">Showrunner</h1>
          <p className="text-sm opacity-60">Sign in, or create an account.</p>
          <input className="w-full bg-white/5 rounded px-3 py-2 outline-none"
            placeholder="you@email.com" autoComplete="email" value={email}
            onChange={e => setEmail(e.target.value)} />
          <input className="w-full bg-white/5 rounded px-3 py-2 outline-none" type="password"
            placeholder="password" autoComplete="current-password" value={password}
            onChange={e => setPassword(e.target.value)} />
          {msg && <p className="text-amber-400 text-sm">{msg}</p>}
          <div className="flex gap-2">
            <button disabled={busy} onClick={signIn}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-2 disabled:opacity-40">
              Sign in
            </button>
            <button disabled={busy} onClick={signUp}
              className="flex-1 bg-white/10 hover:bg-white/20 rounded px-3 py-2 disabled:opacity-40">
              Create account
            </button>
          </div>
          <button disabled={busy} onClick={forgotPassword}
            className="text-xs opacity-60 hover:opacity-100 underline">
            Forgot password?
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <ProjectProvider>
      <Workspace />
    </ProjectProvider>
  );
}

// Which tabs a project shows depends on its pipeline:
//   microdrama   = full creation engine + (later) publish
//   distribution = bring finished video; publish half only
const PIPELINE_TABS: Record<string, Tab[]> = {
  microdrama: ["story", "style", "bible", "script", "board"],
  distribution: ["library"],
};

function PipelinePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const opts = [
    { id: "microdrama", icon: "🎬", label: "Microdrama", desc: "Full engine: story → style → bible → script → render → publish" },
    { id: "distribution", icon: "📤", label: "Distribute only", desc: "You bring finished video; thumbnails, metadata & publishing only" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2">
      {opts.map(o => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`text-left rounded p-3 border ${value === o.id ? "border-emerald-500 bg-emerald-600/10" : "border-white/10 bg-white/5 hover:bg-white/10"}`}>
          <div className="text-sm font-medium">{o.icon} {o.label}</div>
          <div className="text-xs opacity-60 mt-1">{o.desc}</div>
        </button>
      ))}
    </div>
  );
}

// HOME — the front door, shown on every load: all projects as cards + create-new
// with the inputs/outputs (pipeline) chooser.
function Home({ onOpen }: { onOpen: (id: string) => void }) {
  const { projects, createProject } = useProjectContext();
  const [newName, setNewName] = useState("");
  const [newPipeline, setNewPipeline] = useState("microdrama");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const p = await createProject(newName.trim(), newPipeline);
      if (p) onOpen(p.id);
    } catch (e) { alert(String(e)); }
    finally { setBusy(false); }
  }

  return (
    <Shell>
      <div className="max-w-2xl mx-auto mt-12 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Showrunner</h1>
          <p className="text-sm opacity-60">Pick a project, or start a new one by choosing its inputs and outputs.</p>
        </div>

        {projects.length > 0 && (
          <div className="grid md:grid-cols-2 gap-3">
            {projects.map(p => (
              <button key={p.id} onClick={() => onOpen(p.id)}
                className="text-left rounded p-4 border border-white/10 bg-white/5 hover:bg-white/10 space-y-1">
                <div className="font-medium">{p.name}</div>
                <div className="text-xs opacity-60">
                  {p.pipeline === "distribution" ? "📤 distribute-only" : "🎬 microdrama"}
                  {p.pipeline !== "distribution" && (p.style_locked ? " · style locked" : " · style not set")}
                </div>
              </button>
            ))}
          </div>
        )}

        <div className="bg-white/5 rounded p-4 space-y-3">
          <div className="text-sm font-medium">＋ New project</div>
          <PipelinePicker value={newPipeline} onChange={setNewPipeline} />
          <div className="flex gap-2">
            <input className="flex-1 bg-black/40 rounded px-3 py-2" placeholder="project name"
              value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") create(); }} />
            <button disabled={busy || !newName.trim()} onClick={create}
              className="bg-emerald-600 hover:bg-emerald-500 rounded px-4 py-2 disabled:opacity-40">
              Create
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Workspace() {
  const { projects, project, loading, selectProject, renameProject } = useProjectContext();
  const [view, setView] = useState<"home" | "project">("home");
  const [tab, setTab] = useState<Tab>("story");
  const [renaming, setRenaming] = useState(false);

  const tabs = PIPELINE_TABS[project?.pipeline ?? "microdrama"] ?? PIPELINE_TABS.microdrama;
  const activeTab = tabs.includes(tab) ? tab : tabs[0];

  if (loading) return <Shell><p className="opacity-60">Loading projects…</p></Shell>;

  // The app ALWAYS starts on Home — the overview where you choose a project
  // (or create one by picking its inputs/outputs).
  if (view === "home" || !project) {
    return (
      <Home onOpen={(id) => {
        selectProject(id);
        const p = projects.find(x => x.id === id);
        setTab(p?.pipeline === "distribution" ? "library" : "story");
        setView("project");
      }} />
    );
  }

  return (
    <Shell>
      {/* Project bar */}
      <div className="flex items-center gap-2 mb-4 text-sm">
        <button onClick={() => setView("home")} title="all projects"
          className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">⌂ Home</button>
        <span className="opacity-40">Project</span>
        {renaming ? (
          <input autoFocus defaultValue={project.name}
            className="bg-white/10 rounded px-2 py-1"
            onKeyDown={e => {
              if (e.key === "Enter") { renameProject(project.id, (e.target as HTMLInputElement).value.trim()); setRenaming(false); }
              if (e.key === "Escape") setRenaming(false);
            }}
            onBlur={() => setRenaming(false)} />
        ) : (
          <>
            <select value={project.id} onChange={e => selectProject(e.target.value)}
              className="bg-white/10 rounded px-2 py-1">
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={() => setRenaming(true)} title="rename"
              className="opacity-50 hover:opacity-100">✎</button>
          </>
        )}
        <span className="text-xs opacity-40">{project.pipeline === "distribution" ? "📤 distribute-only" : "🎬 microdrama"}</span>
        <button className="ml-auto px-3 py-1.5 rounded bg-white/5 hover:bg-white/10"
          onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 mb-6 text-sm">
        {tabs.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded capitalize ${activeTab === t ? "bg-emerald-600" : "bg-white/5 hover:bg-white/10"}`}>
            {t}
          </button>
        ))}
      </nav>

      {activeTab === "story" && <StoryPage goStyle={() => setTab("style")} />}
      {activeTab === "style" && <StylePage onApprove={() => setTab("bible")} />}
      {activeTab === "bible" && <BiblePage />}
      {activeTab === "script" && <ScriptPage />}
      {activeTab === "board" && <BoardPage />}
      {activeTab === "library" && <LibraryPage />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen max-w-5xl mx-auto p-6">{children}</div>;
}
