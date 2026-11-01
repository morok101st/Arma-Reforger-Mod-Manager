import React from "react";
import type { ModRefreshJob } from "../types";

export function useRefreshJobs(api: {
  listRefreshJobs: (modsetId: number) => Promise<ModRefreshJob[]>;
  refreshMod: (id: string, modsetId: number) => Promise<ModRefreshJob>;
}, scope: string | null, modsetId: number | null, onCompleted: () => Promise<unknown>) {
  const currentScope = React.useRef(scope);
  currentScope.current = scope;
  const [snapshot, setSnapshot] = React.useState({ scope, jobs: [] as ModRefreshJob[], error: null as string | null, loaded: false });
  const [pending, setPending] = React.useState<{ scope: string | null; ids: Set<string> }>({ scope, ids: new Set() });
  const completed = React.useRef(new Set<string>());
  const mutationVersion = React.useRef(0);
  const onCompletedRef = React.useRef(onCompleted);
  onCompletedRef.current = onCompleted;
  const pollRef = React.useRef<(() => Promise<void>) | null>(null);

  React.useEffect(() => {
    if (!scope || !modsetId) return;
    let disposed = false;
    let timer: number | undefined;
    let inFlight = false;
    completed.current = new Set();
    const poll = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      const version = mutationVersion.current;
      window.clearTimeout(timer);
      try {
        const jobs = await api.listRefreshJobs(modsetId);
        if (disposed || currentScope.current !== scope || version !== mutationVersion.current) return;
        setSnapshot({ scope, jobs, error: null, loaded: true });
        const newlyCompleted = jobs.filter(job => ["succeeded", "failed"].includes(job.state) && !completed.current.has(job.attempt));
        newlyCompleted.forEach(job => completed.current.add(job.attempt));
        if (newlyCompleted.length) await onCompletedRef.current();
      } catch (error) {
        if (!disposed && currentScope.current === scope) setSnapshot(previous => ({
          scope, jobs: previous.scope === scope ? previous.jobs : [], loaded: previous.scope === scope && previous.loaded,
          error: error instanceof Error ? error.message : "Could not load update check status.",
        }));
      } finally {
        inFlight = false;
        if (!disposed) timer = window.setTimeout(poll, 2000);
      }
    };
    pollRef.current = poll;
    const reconnect = () => { void poll(); };
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    void poll();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      pollRef.current = null;
    };
  }, [api, scope, modsetId]);

  const refreshMod = React.useCallback(async (id: string) => {
    if (!scope || !modsetId) return;
    mutationVersion.current++;
    setPending(previous => ({ scope, ids: new Set(previous.scope === scope ? previous.ids : []).add(id) }));
    try {
      const job = await api.refreshMod(id, modsetId);
      if (currentScope.current !== scope) return;
      mutationVersion.current++;
      setSnapshot(previous => ({ scope, loaded: true, error: null,
        jobs: [...(previous.scope === scope ? previous.jobs : []).filter(item => item.mod_id !== id), job] }));
    } finally {
      if (currentScope.current === scope) {
        setPending(previous => { const ids = new Set(previous.ids); ids.delete(id); return { scope, ids }; });
        // Also reconcile ambiguous network failures: the server may have accepted the job.
        void pollRef.current?.();
      }
    }
  }, [api, scope, modsetId]);

  const getModRefreshState = (id: string): "idle" | "checking" | "completed" | "failed" | "loading" | "unavailable" => {
    const current = snapshot.scope === scope ? snapshot : null;
    const job = current?.jobs.find(item => item.mod_id === id);
    if ((pending.scope === scope && pending.ids.has(id)) || job?.state === "queued" || job?.state === "running") return "checking";
    if (current?.error) return "unavailable";
    if (!current?.loaded) return "loading";
    if (job?.state === "failed") return "failed";
    if (job?.state === "succeeded" && job.completed_at && Date.now() - Date.parse(job.completed_at) < 5000) return "completed";
    return "idle";
  };
  return { refreshMod, getModRefreshState };
}
