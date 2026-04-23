import React from "react";

import { createApiClient } from "../lib/api";

export function useApiClient(onUnauthorized: () => void) {
  return React.useMemo(() => createApiClient(onUnauthorized), [onUnauthorized]);
}
