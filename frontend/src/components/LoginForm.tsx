import React from "react";
import { Shield } from "lucide-react";

export function LoginForm({
  oidcEnabled,
  loginError,
  loading,
  oidcLoginUrl,
  onSubmit,
}: {
  oidcEnabled: boolean;
  loginError: string | null;
  loading: boolean;
  oidcLoginUrl: string;
  onSubmit: (username: string, password: string) => Promise<void>;
}) {
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    await onSubmit(username, password);
    setPassword("");
  }

  return (
    <form className="login-form" onSubmit={handleSubmit}>
      <label>
        Username
        <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
      </label>
      <label>
        Password
        <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
      </label>
      {loginError && <div className="error-box">{loginError}</div>}
      <button className="primary-button" disabled={loading || !username.trim() || !password}>
        <Shield size={18} />
        Sign in
      </button>
      {oidcEnabled && (
        <button className="secondary-button" onClick={() => window.location.assign(oidcLoginUrl)} disabled={loading} type="button">
          <Shield size={18} />
          Sign in with OIDC
        </button>
      )}
    </form>
  );
}
