import React from "react";
import { ArrowUpRight } from "lucide-react";
import type { createApiClient, ReleaseStatus } from "../lib/api";

export function ReleaseInfo({ api }: { api: Pick<ReturnType<typeof createApiClient>, "getReleaseStatus"> }) {
  const [status, setStatus] = React.useState<ReleaseStatus | null>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    api.getReleaseStatus(controller.signal)
      .then(value => {
        if (!controller.signal.aborted) setStatus(value);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [api]);

  if (!status) return null;
  const versionLabel = status.version === "dev"
    ? status.revision ? `Dev · ${status.revision.slice(0, 16)}` : "Dev"
    : `v${status.version}`;

  return (
    <footer className="sidebar-release" aria-label="ARMM release">
      <span>ARMM {versionLabel}</span>
      <a href={status.repository_url} target="_blank" rel="noreferrer">
        GitHub <ArrowUpRight size={13} aria-hidden="true" />
      </a>
      {status.update && (
        <a className="sidebar-release-update" href={status.update.url} target="_blank" rel="noreferrer">
          Update to v{status.update.version} available <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      )}
    </footer>
  );
}
