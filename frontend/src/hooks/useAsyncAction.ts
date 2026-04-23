import React from "react";

export function useAsyncAction() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async <T,>(action: () => Promise<T>, options?: { rethrow?: boolean; clearError?: boolean }) => {
    setLoading(true);
    if (options?.clearError !== false) {
      setError(null);
    }
    try {
      return await action();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error.";
      setError(message);
      if (options?.rethrow) {
        throw err;
      }
      return undefined as T;
    } finally {
      setLoading(false);
    }
  }, []);

  return {
    loading,
    error,
    setError,
    run,
  };
}
