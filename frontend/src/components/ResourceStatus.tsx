import { RefreshCw } from "lucide-react";
import type { LoadState } from "../hooks/useLoadState";

export function ResourceStatus({ state, label, announce = true }: { state: LoadState; label: string; announce?: boolean }) {
  if (state.error) return <div className="resource-error" role={announce ? "alert" : undefined}>
    <div><strong>Could not load {label}.</strong><p>{state.error}</p></div>
    <button className="secondary-button compact" type="button" onClick={() => state.retry().catch(() => null)} disabled={state.loading}>
      <RefreshCw className={state.loading ? "refresh-spin" : undefined} size={16} /> {state.loading ? "Retrying…" : "Retry"}
    </button>
  </div>;
  if (state.loading && !state.loaded) return <p className="resource-loading" role={announce ? "status" : undefined}><RefreshCw className="refresh-spin" size={16} /> Loading {label}…</p>;
  return null;
}
