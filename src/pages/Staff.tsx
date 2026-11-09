import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";

type Role = {
  id: string;
  key: string;
  name: string;
  description: string;
  locked: boolean;
  permissions: string[];
  members: number;
};
type StaffMember = {
  id: string;
  email: string;
  name: string;
  status: "INVITED" | "ACTIVE" | "DEACTIVATED";
  twoFactor: boolean;
  lastActiveAt: string | null;
  role: { id: string; key: string; name: string } | null;
};
type Catalogue = { module: string; permissions: { key: string; label: string }[] }[];

const errText = (e: unknown) => (e instanceof ApiError ? (e.detail ? `${e.title}. ${e.detail}` : e.title) : String(e));
const statusBadge = { ACTIVE: "badge badge-success", INVITED: "badge badge-info", DEACTIVATED: "badge" } as const;

/** AD-STF-01 (v2) / 02 / 03 · Staff & roles. The API enforces every rule; buttons only appear when allowed. */
export function StaffAndRoles() {
  const [tab, setTab] = useState<"staff" | "roles">("staff");
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Staff &amp; roles</h1>
          <p className="t-body-s muted">
            Who can sign in to admin and what their role allows. Changes ask for a fresh authenticator code and are
            audited.
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "staff"}
          onClick={() => setTab("staff")}
        >
          Staff
        </button>
        <button
          type="button"
          role="tab"
          className="tab"
          aria-selected={tab === "roles"}
          onClick={() => setTab("roles")}
        >
          Roles
        </button>
      </div>
      {tab === "staff" ? <StaffTab /> : <RolesTab />}
    </>
  );
}

function StaffTab() {
  const { me, can } = useSession();
  const client = useQueryClient();
  const staff = useQuery({ queryKey: ["staff"], queryFn: () => api<StaffMember[]>("/admin/staff") });
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/admin/roles") });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const manage = can("staff.manage");

  const act = useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) =>
      api(path, { method, body }),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Saved." });
      void client.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (e) => setNotice({ tone: "error", text: errText(e) }),
  });

  return (
    <>
      {manage ? <InviteForm roles={roles.data ?? []} /> : null}
      {notice ? <p className={`alert alert-${notice.tone}`}>{notice.text}</p> : null}
      {staff.error ? <p className="alert alert-error">{errText(staff.error)}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Staff member</th>
            <th>Role</th>
            <th>Two-factor</th>
            <th>Status</th>
            <th>Last active</th>
            {manage ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {(staff.data ?? []).map((s) => {
            const self = s.id === me?.id;
            return (
              <tr key={s.id}>
                <td>
                  <strong>{s.name}</strong>
                  <br />
                  <span className="muted">{s.email}</span>
                </td>
                <td>
                  {manage && !self ? (
                    <select
                      aria-label={`Role for ${s.name}`}
                      value={s.role?.id ?? ""}
                      onChange={(e) =>
                        act.mutate({ path: `/admin/staff/${s.id}`, method: "PATCH", body: { roleId: e.target.value } })
                      }
                    >
                      {(roles.data ?? []).map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    s.role?.name
                  )}
                </td>
                <td>
                  {s.twoFactor ? (
                    <span className="badge badge-success">On</span>
                  ) : (
                    <span className="badge badge-warning">Not set up</span>
                  )}
                </td>
                <td>
                  <span className={statusBadge[s.status]}>{s.status.toLowerCase()}</span>
                </td>
                <td>{s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString("en-IN") : "—"}</td>
                {manage ? (
                  <td>
                    {self ? (
                      <span className="muted">You</span>
                    ) : (
                      <div className="row">
                        {s.twoFactor ? (
                          <button
                            type="button"
                            className="link"
                            onClick={() => act.mutate({ path: `/admin/staff/${s.id}/reset-2fa`, method: "POST" })}
                          >
                            Reset 2FA
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="link"
                          onClick={() => act.mutate({ path: `/admin/staff/${s.id}/revoke-sessions`, method: "POST" })}
                        >
                          Sign out everywhere
                        </button>
                        {s.status === "ACTIVE" ? (
                          <button
                            type="button"
                            className="link"
                            onClick={() =>
                              confirm(
                                `Deactivate ${s.name}? They are signed out everywhere and can’t sign in until reactivated.`,
                              ) &&
                              act.mutate({
                                path: `/admin/staff/${s.id}`,
                                method: "PATCH",
                                body: { status: "DEACTIVATED" },
                              })
                            }
                          >
                            Deactivate
                          </button>
                        ) : s.status === "DEACTIVATED" ? (
                          <button
                            type="button"
                            className="link"
                            onClick={() =>
                              act.mutate({ path: `/admin/staff/${s.id}`, method: "PATCH", body: { status: "ACTIVE" } })
                            }
                          >
                            Reactivate
                          </button>
                        ) : null}
                      </div>
                    )}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="alert alert-info">
        At least one active Owner is always required. Nobody can change their own role or status.
      </p>
    </>
  );
}

function InviteForm({ roles }: { roles: Role[] }) {
  const client = useQueryClient();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [roleId, setRoleId] = useState("");
  const [link, setLink] = useState<{ url: string; expiresAt: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!roleId && roles.length) setRoleId(roles.find((r) => !r.locked)?.id ?? roles[0].id);
  }, [roles, roleId]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    try {
      const res = await api<{ inviteUrl: string; expiresAt: string }>("/admin/staff/invitations", {
        method: "POST",
        body: { email, name, roleId },
      });
      setLink({ url: res.inviteUrl, expiresAt: res.expiresAt });
      setEmail("");
      setName("");
      void client.invalidateQueries({ queryKey: ["staff"] });
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2 className="t-h5">Invite staff</h2>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="invite-name">Name</label>
          <input id="invite-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} />
        </div>
        <div className="field">
          <label htmlFor="invite-email">Email</label>
          <input id="invite-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor="invite-role">Role</label>
          <select id="invite-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error ? <p className="alert alert-error">{error}</p> : null}
      {link ? (
        <div className="alert alert-success">
          <p>
            Invitation created. Send this one-time link to them yourself (it expires{" "}
            {new Date(link.expiresAt).toLocaleDateString("en-IN")}):
          </p>
          <div className="row">
            <input
              readOnly
              value={link.url}
              aria-label="Invitation link"
              style={{ flex: 1, minHeight: 36 }}
              onFocus={(e) => e.target.select()}
            />
            <button type="button" className="btn btn-secondary" onClick={() => navigator.clipboard.writeText(link.url)}>
              Copy
            </button>
          </div>
        </div>
      ) : null}
      <div>
        <button type="submit" className="btn btn-primary">
          Create invitation
        </button>
      </div>
    </form>
  );
}

function RolesTab() {
  const { can } = useSession();
  const client = useQueryClient();
  const roles = useQuery({ queryKey: ["roles"], queryFn: () => api<Role[]>("/admin/roles") });
  const catalogue = useQuery({ queryKey: ["permissions"], queryFn: () => api<Catalogue>("/admin/permissions") });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; description: string; permissions: Set<string> } | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const editable = can("roles.manage");

  const selected = roles.data?.find((r) => r.id === selectedId) ?? null;
  useEffect(() => {
    if (!selectedId && roles.data?.length) setSelectedId(roles.data[0].id);
  }, [roles.data, selectedId]);
  useEffect(() => {
    if (selected)
      setDraft({ name: selected.name, description: selected.description, permissions: new Set(selected.permissions) });
  }, [selected]);

  const save = async () => {
    if (!draft || !selected) return;
    setNotice(null);
    try {
      await api(`/admin/roles/${selected.id}`, {
        method: "PATCH",
        body: { name: draft.name, description: draft.description, permissions: [...draft.permissions] },
      });
      setNotice({ tone: "success", text: "Role saved. Members get the new permissions on their next request." });
      void client.invalidateQueries({ queryKey: ["roles"] });
    } catch (e) {
      setNotice({ tone: "error", text: errText(e) });
    }
  };

  const create = async () => {
    const name = prompt("Name for the new role");
    if (!name) return;
    try {
      const role = await api<Role>("/admin/roles", { method: "POST", body: { name, permissions: ["dashboard.read"] } });
      await client.invalidateQueries({ queryKey: ["roles"] });
      setSelectedId(role.id);
    } catch (e) {
      setNotice({ tone: "error", text: errText(e) });
    }
  };

  const remove = async () => {
    if (!selected || !confirm(`Delete the ${selected.name} role?`)) return;
    try {
      await api(`/admin/roles/${selected.id}`, { method: "DELETE" });
      setSelectedId(null);
      void client.invalidateQueries({ queryKey: ["roles"] });
    } catch (e) {
      setNotice({ tone: "error", text: errText(e) });
    }
  };

  const toggle = (key: string) =>
    setDraft((d) => {
      if (!d) return d;
      const next = new Set(d.permissions);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...d, permissions: next };
    });

  const locked = !editable || selected?.locked;

  return (
    <div className="row" style={{ alignItems: "flex-start" }}>
      <div className="card" style={{ width: 280 }}>
        <h2 className="t-h5">Roles</h2>
        {(roles.data ?? []).map((r) => (
          <button
            key={r.id}
            type="button"
            className="btn btn-secondary"
            style={{
              justifyContent: "space-between",
              borderColor: r.id === selectedId ? "var(--omp-color-border-selected)" : undefined,
            }}
            onClick={() => setSelectedId(r.id)}
          >
            <span>{r.name}</span>
            <span className="badge">{r.locked ? "Locked" : `${r.members}`}</span>
          </button>
        ))}
        {editable ? (
          <button type="button" className="btn btn-ghost" onClick={create}>
            + New role
          </button>
        ) : null}
      </div>
      {draft && selected ? (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <div className="card">
            <div className="grid-2">
              <div className="field">
                <label htmlFor="role-name">Role name</label>
                <input
                  id="role-name"
                  value={draft.name}
                  disabled={locked}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="role-desc">Description</label>
                <input
                  id="role-desc"
                  value={draft.description}
                  disabled={locked}
                  onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                />
              </div>
            </div>
            {selected.locked ? (
              <p className="alert alert-info">Owner always has every permission and can’t be edited or deleted.</p>
            ) : null}
          </div>
          <div className="grid-2">
            {(catalogue.data ?? []).map((group) => (
              <fieldset key={group.module} className="card" style={{ margin: 0 }}>
                <legend className="t-h5" style={{ float: "left", width: "100%" }}>
                  {group.module}
                </legend>
                {group.permissions.map((p) => (
                  <label key={p.key} className="check">
                    <input
                      type="checkbox"
                      checked={draft.permissions.has(p.key)}
                      disabled={locked}
                      onChange={() => toggle(p.key)}
                    />
                    <span>
                      {p.label}
                      <br />
                      <span className="mono">{p.key}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            ))}
          </div>
          {notice ? <p className={`alert alert-${notice.tone}`}>{notice.text}</p> : null}
          {!locked ? (
            <div className="row">
              <button type="button" className="btn btn-ghost" onClick={remove}>
                Delete role
              </button>
              <button type="button" className="btn btn-primary" onClick={save}>
                Save role
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
