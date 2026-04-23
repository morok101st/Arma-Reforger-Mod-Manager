import React from "react";
import { Shield } from "lucide-react";

export function LoginForm({
  username,
  password,
  loginError,
  loading,
  setUsername,
  setPassword,
  onSubmit,
}: {
  username: string;
  password: string;
  loginError: string | null;
  loading: boolean;
  setUsername: (value: string) => void;
  setPassword: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  return (
    <form className="login-form" onSubmit={onSubmit}>
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
    </form>
  );
}
