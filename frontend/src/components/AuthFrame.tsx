import React from "react";
import { Shield } from "lucide-react";

export function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <Shield size={30} />
        <p>Secure access</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
        {children}
      </section>
    </main>
  );
}
