import { useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { NavLink, Outlet, useNavigate } from "react-router";
import { api } from "../lib/api";
import { NAV } from "../lib/nav";
import { useSession } from "../lib/session";
import { StepUpDialog } from "./StepUpDialog";

/** Admin layout: sidebar filtered by the role's permissions + top bar. */
export function Shell() {
  const { me, can } = useSession();
  const navigate = useNavigate();
  const client = useQueryClient();
  if (!me) return null;
  const initials = me.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const signOut = async () => {
    await api("/admin/auth/logout", { method: "POST" }).catch(() => undefined);
    client.clear();
    navigate("/sign-in", { replace: true });
  };

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Admin">
        <span className="sidebar-logo">
          <img src="/logo.png" alt="Order My Print" />
          <span className="t-label-m">Admin</span>
        </span>
        {NAV.map((group) => {
          const items = group.items.filter((item) => can(item.permission));
          if (!items.length) return null;
          return (
            <div key={group.title ?? "top"}>
              {group.title ? <p className="t-overline sidebar-group">{group.title}</p> : null}
              {items.map((item) => (
                <NavLink key={item.path} to={item.path} end={item.path === "/"} className="nav-link">
                  <item.icon size={20} aria-hidden="true" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          );
        })}
      </nav>
      <div className="main">
        <header className="topbar">
          <span className="env-badge">{import.meta.env.PROD ? "LIVE" : "LOCAL"}</span>
          <div className="topbar-user">
            <span className="avatar" aria-hidden="true">
              {initials}
            </span>
            <div>
              <p className="t-label-m">{me.name}</p>
              <p className="t-body-xs muted">{me.role?.name ?? "No role"}</p>
            </div>
            <button type="button" className="btn btn-ghost" onClick={signOut}>
              <LogOut size={18} aria-hidden="true" /> Sign out
            </button>
          </div>
        </header>
        <main className="content" id="main">
          <Outlet />
        </main>
      </div>
      <StepUpDialog />
    </div>
  );
}
