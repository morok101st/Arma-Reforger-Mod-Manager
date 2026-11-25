import React from "react";

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <header className="auth-heading">
          <img className="app-logo app-logo-auth" src="/icon.png" alt="ARMM" />
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </header>
        {children}
      </section>
    </main>
  );
}
