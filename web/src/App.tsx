import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "./lib/supabase";
import { BiblePage } from "./pages/BiblePage";
import { ScriptPage } from "./pages/ScriptPage";
import { BoardPage } from "./pages/BoardPage";

type Tab = "bible" | "script" | "board";

export function App() {
  const [session, setSession] = useState<unknown>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("bible");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // All hooks run unconditionally (Rules of Hooks); branch on config inside.
  useEffect(() => {
    if (!supabaseConfigured) { setReady(true); return; }
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
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
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <nav className="flex gap-1 mb-6 text-sm">
        {(["bible", "script", "board"] as Tab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded capitalize ${tab === t ? "bg-emerald-600" : "bg-white/5 hover:bg-white/10"}`}>
            {t}
          </button>
        ))}
        <button className="ml-auto px-3 py-1.5 rounded bg-white/5 hover:bg-white/10"
          onClick={() => supabase.auth.signOut()}>Sign out</button>
      </nav>
      {tab === "bible" && <BiblePage />}
      {tab === "script" && <ScriptPage />}
      {tab === "board" && <BoardPage />}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen max-w-5xl mx-auto p-6">{children}</div>;
}
