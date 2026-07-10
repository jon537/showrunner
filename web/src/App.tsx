import { useEffect, useState } from "react";
import { supabase } from "./lib/supabase";
import { BiblePage } from "./pages/BiblePage";
import { ScriptPage } from "./pages/ScriptPage";
import { BoardPage } from "./pages/BoardPage";

type Tab = "bible" | "script" | "board";

export function App() {
  const [session, setSession] = useState<unknown>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("bible");
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <Shell><p className="opacity-60">Loading…</p></Shell>;

  if (!session) {
    return (
      <Shell>
        <div className="max-w-sm mx-auto mt-24 space-y-3">
          <h1 className="text-2xl font-semibold">Showrunner</h1>
          <p className="text-sm opacity-60">Sign in with a magic link.</p>
          {sent ? (
            <p className="text-emerald-400 text-sm">Check your email for the link.</p>
          ) : (
            <>
              <input
                className="w-full bg-white/5 rounded px-3 py-2 outline-none"
                placeholder="you@email.com" value={email}
                onChange={e => setEmail(e.target.value)} />
              <button
                className="w-full bg-emerald-600 hover:bg-emerald-500 rounded px-3 py-2"
                onClick={async () => {
                  await supabase.auth.signInWithOtp({ email });
                  setSent(true);
                }}>Send magic link</button>
            </>
          )}
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
