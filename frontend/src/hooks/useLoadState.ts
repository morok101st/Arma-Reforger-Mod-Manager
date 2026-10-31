import React from "react";

export type LoadState = {
  loading: boolean;
  loaded: boolean;
  error: string | null;
  retry: () => Promise<void>;
};

/** Tracks the latest request only, including its scope and retry arguments. */
export function useLoadState(scope: string | null) {
  const mounted = React.useRef(true);
  const latestScope = React.useRef(scope);
  const requestId = React.useRef(0);
  const retryRef = React.useRef<(() => Promise<void>) | null>(null);
  if (latestScope.current !== scope) {
    latestScope.current = scope;
    requestId.current++;
    retryRef.current = null;
  }
  const [state, setState] = React.useState({ scope, loading: false, loaded: false, error: null as string | null });
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; requestId.current++; }; }, []);

  const run = React.useCallback(<T,>(fetchData: () => Promise<T>, apply: (data: T) => void): Promise<T> => {
    async function execute(): Promise<T> {
      if (!mounted.current || latestScope.current !== scope) throw new DOMException("The view changed.", "AbortError");
      const request = ++requestId.current;
      setState(previous => ({ scope, loading: true, loaded: previous.scope === scope && previous.loaded, error: previous.scope === scope ? previous.error : null }));
      try {
        const data = await fetchData();
        if (request === requestId.current && latestScope.current === scope) {
          apply(data);
          setState({ scope, loading: false, loaded: true, error: null });
        }
        return data;
      } catch (error) {
        if (request === requestId.current && latestScope.current === scope) {
          setState(previous => ({ scope, loading: false, loaded: previous.scope === scope && previous.loaded,
            error: error instanceof Error ? error.message : "The request failed." }));
        }
        throw error;
      }
    }
    if (mounted.current && latestScope.current === scope) retryRef.current = async () => { if (latestScope.current === scope) await execute(); };
    return execute();
  }, [scope]);
  const retry = React.useCallback(async () => { await retryRef.current?.(); }, []);
  const current = state.scope === scope ? state : { loading: false, loaded: false, error: null };
  return { run, retry, error: current.error, loaded: scope === null || current.loaded,
    loading: scope !== null && (current.loading || (!current.loaded && !current.error)) };
}
