import { Link } from "react-router";
import { ALL_ITEMS } from "../lib/nav";
import { useSession } from "../lib/session";

/** AD-DASH-01 (first slice): what this person can open. Widgets arrive with their modules. */
export function Overview() {
  const { me, can } = useSession();
  const items = ALL_ITEMS.filter((i) => i.path !== "/" && can(i.permission));
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Hello, {me?.name.split(" ")[0]}</h1>
          <p className="t-body-s muted">Signed in as {me?.role?.name}. You can open the modules below.</p>
        </div>
      </div>
      <div className="grid-2">
        {items.map((item) => (
          <Link key={item.path} to={item.path} className="card">
            <div className="row">
              <item.icon size={22} aria-hidden="true" />
              <h2 className="t-h5">{item.label}</h2>
            </div>
            <p className="t-body-s muted">{item.ready ? "Open" : "Coming in a later phase"}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

/** Modules whose API isn't built yet. */
export function ComingSoon({ label }: { label: string }) {
  return (
    <div className="empty">
      <h1 className="t-h3">{label}</h1>
      <p className="t-body-m muted">This module is designed and arrives in a later phase, once its API is built.</p>
      <Link to="/" className="btn btn-secondary">
        Back to overview
      </Link>
    </div>
  );
}

/** AD-ERR-01 · Access denied. The API refuses the data anyway; this explains why. */
export function AccessDenied({ label, permission }: { label: string; permission: string }) {
  const { me } = useSession();
  return (
    <div className="empty">
      <h1 className="t-h3">You don’t have access to {label}</h1>
      <p className="t-body-m muted">
        Your role ({me?.role?.name ?? "none"}) doesn’t include <span className="mono">{permission}</span>. Ask an Owner
        to change your role in Staff &amp; roles.
      </p>
      <Link to="/" className="btn btn-primary">
        Back to overview
      </Link>
    </div>
  );
}

export function NotFound() {
  return (
    <div className="empty">
      <h1 className="t-h3">Page not found</h1>
      <Link to="/" className="btn btn-secondary">
        Back to overview
      </Link>
    </div>
  );
}
