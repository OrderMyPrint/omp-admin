import type { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router";
import { Shell } from "./components/Shell";
import { ALL_ITEMS } from "./lib/nav";
import { useSession } from "./lib/session";
import { AuditLog } from "./pages/AuditLog";
import { AcceptInvite, SignIn } from "./pages/Auth";
import { Catalogue } from "./pages/Catalogue";
import { Customers } from "./pages/Customers";
import { Orders } from "./pages/Orders";
import { Pricing } from "./pages/Pricing";
import { Quotations } from "./pages/Quotations";
import { AccessDenied, ComingSoon, NotFound, Overview } from "./pages/Simple";
import { StaffAndRoles } from "./pages/Staff";
import { VisualEditor } from "./pages/VisualEditor";
import { Website } from "./pages/Website";

const screens: Record<string, ReactNode> = {
  "/": <Overview />,
  "/catalogue": <Catalogue />,
  "/pricing": <Pricing />,
  "/orders": <Orders />,
  "/quotations": <Quotations />,
  "/customers": <Customers />,
  "/staff": <StaffAndRoles />,
  "/website": <Website />,
  "/audit": <AuditLog />,
};

/** Signed-in only; otherwise to the sign-in page. */
function RequireSession({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  if (loading) return <p className="content muted">Loading…</p>;
  if (!me) return <Navigate to="/sign-in" replace />;
  return children;
}

/** Mirrors the API's permission check so a direct link shows Access denied (AD-ERR-01). */
function RequirePermission({
  permission,
  label,
  children,
}: {
  permission: string;
  label: string;
  children: ReactNode;
}) {
  const { can } = useSession();
  return can(permission) ? children : <AccessDenied label={label} permission={permission} />;
}

export function App() {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignIn />} />
      <Route path="/accept-invite" element={<AcceptInvite />} />
      <Route
        path="/website/editor/:id"
        element={
          <RequireSession>
            <RequirePermission permission="content.read" label="Website content">
              <VisualEditor />
            </RequirePermission>
          </RequireSession>
        }
      />
      <Route
        element={
          <RequireSession>
            <Shell />
          </RequireSession>
        }
      >
        {ALL_ITEMS.map((item) => (
          <Route
            key={item.path}
            path={item.path === "/" ? undefined : item.path.slice(1)}
            index={item.path === "/"}
            element={
              <RequirePermission permission={item.permission} label={item.label}>
                {item.ready ? screens[item.path] : <ComingSoon label={item.label} />}
              </RequirePermission>
            }
          />
        ))}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
