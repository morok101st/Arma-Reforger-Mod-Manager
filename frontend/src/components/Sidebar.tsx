import React from "react";
import { Boxes, Home, LogOut, Shield } from "lucide-react";

export function Sidebar({
  username,
  showDashboard,
  showModManagement,
  showUserAdmin,
  onShowDashboard,
  onShowModManagement,
  onToggleSecurity,
  onLogout,
}: {
  username: string;
  showDashboard: boolean;
  showModManagement: boolean;
  showUserAdmin: boolean;
  onShowDashboard: () => void;
  onShowModManagement: () => void;
  onToggleSecurity: () => void;
  onLogout: () => void;
}) {
  return (
    <section className="sidebar" aria-label="Navigation">
      <div className="brand">
        <div>
          <p>Arma Reforger Mod Manager</p>
        </div>
        <div className="header-actions">
          <button className={`icon-button ${showDashboard ? "active" : ""}`} onClick={onShowDashboard} title="Dashboard" aria-pressed={showDashboard}>
            <Home size={18} />
          </button>
          <button
            className={`icon-button ${showModManagement ? "active" : ""}`}
            onClick={onShowModManagement}
            title="Mods"
            aria-pressed={showModManagement}
          >
            <Boxes size={18} />
          </button>
          <button className={`icon-button ${showUserAdmin ? "active" : ""}`} onClick={onToggleSecurity} title="Security" aria-pressed={showUserAdmin}>
            <Shield size={18} />
          </button>
          <button className="icon-button logout-button" onClick={onLogout} title={`Logout ${username}`}>
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
