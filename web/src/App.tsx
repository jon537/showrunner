import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { ProjectProvider, useProjectContext } from "./lib/project";
import { StylePage } from "./pages/StylePage";
import { BiblePage } from "./pages/BiblePage";
import { ScriptPage } from "./pages/ScriptPage";
import { BoardPage } from "./pages/BoardPage";

type Tab = "style" | "bible" | "script" | "board";

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

function Workspace() {
  const { projects, project, loading, selectProject, createProject, renameProject } = useProjectContext();
  const [tab, setTab] = useState<Tab>("style");
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState(false);

  if (loading) return <Shell><p className="opacity-60">Loading projects…</p></Shell>;

  // No projects yet → name your first one.
  if (!project) {
    return (
      <Shell>
        <div className="max-w-sm mx-auto mt-24 space-y-3">
          <h1 className="text-2xl font-semibold">Name your first project</h1>
          <p className="text-sm opacity-60">A project is one series — its own style, bible and episodes.</p>
          <input className="w-full bg-white/5 rounded px-3 py-2" placeholder="e.g. Midnight Diner"
            value={newName} onChange={e => setNewName(e.target.value)} />
          <button disabled={!newName.trim()} onClick={() => createProject(newName.trim())}
            className="w-full bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-2 disabled:opacity-40">
            Create project
          </button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {/* Project bar */}
      <div className="flex items-center gap-2 mb-4 text-sm">
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
        {creating ? (
          <input autoFocus placeholder="new project name…"
            className="bg-white/10 rounded px-2 py-1"
            value={newName} onChange={e => setNewName(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter" && newName.trim()) { createProject(newName.trim()); setNewName(""); setCreating(false); setTab("style"); }
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }} />
        ) : (
          <button onClick={() => setCreating(true)}
            className="px-2 py-1 rounded bg-white/5 hover:bg-white/10">＋ New</button>
        )}
        <button className="ml-auto px-3 py-1.5 rounded bg-white/5 hover:bg-white/10"
          onClick={() => supabase.auth.signOut()}>Sign out</button>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1 mb-6 text-sm">
        {(["style", "bible", "script", "board"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded capitalize ${tab === t ? "bg-emerald-600" : "bg-white/5 hover:bg-white/10"}`}>
            {t}
          </button>
        ))}
      </nav>

      {tab === "style" && <StylePage onApprove={() => setTab("bible")} />}
      {tab === "bible" && <BiblePage />}
      {tab === "script" && <ScriptPage />}
      {tab === "board" && <BoardPage />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen max-w-5xl mx-auto p-6">{children}</div>;
}
