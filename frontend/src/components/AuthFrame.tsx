import React from "react";

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <img className="app-logo app-logo-auth" src="/icon.png" alt="ARMM" />
        <p>Secure access</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
        {children}
      </section>
    </main>
  );
}
