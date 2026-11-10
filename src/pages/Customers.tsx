import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { dateText, dateTimeText, errText, rupees } from "../lib/catalogue";
import { useSession } from "../lib/session";
import { Dialog } from "./CatalogueStructure";

type CompanyRef = { id: string; name: string; role: "ADMIN" | "MEMBER" };
type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  companies: CompanyRef[];
  orders: number;
  lifetimeValue: string;
  joinedAt: string;
};
type OrderRef = { id: string; number: string; status: string; total: string; placedAt: string };
type QuoteRef = { id: string; number: string; status: string; total: string };
type Customer = Omit<CustomerRow, "orders"> & {
  lastActiveAt: string | null;
  orders: OrderRef[];
  quotes: QuoteRef[];
};
type CompanyRow = {
  id: string;
  name: string;
  gstin: string | null;
  members: number;
  quotes: number;
  creditEnabled: boolean;
  creditTermsDays: number | null;
};
type Company = {
  id: string;
  name: string;
  gstin: string | null;
  notes: string | null;
  credit: { enabled: boolean; termsDays: number | null; approvedBy: string | null; approvedAt: string | null };
  members: { id: string; name: string; phone: string | null; role: "ADMIN" | "MEMBER" }[];
  orders: OrderRef[];
  lifetimeValue: string;
  quotes: QuoteRef[];
};

const label = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
/** +919876543210 → +91 98765 43210 */
export const phoneText = (p: string | null | undefined) => (p ? p.replace(/^\+91(\d{5})(\d{5})$/, "+91 $1 $2") : "—");

/** AD-CUS-01 / 02 · Customers & companies. */
export function Customers() {
  const [params, setParams] = useSearchParams();
  const customer = params.get("customer");
  const company = params.get("company");
  const tab = params.get("tab") === "companies" ? "companies" : "customers";
  if (customer) return <CustomerDetail id={customer} onBack={() => setParams({})} open={setParams} />;
  if (company) return <CompanyDetail id={company} onBack={() => setParams({ tab: "companies" })} open={setParams} />;
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Customers & companies</h1>
          <p className="t-body-s muted">Customers sign in with their mobile number and a one-time code.</p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ["customers", "Customers"],
            ["companies", "Companies"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === id}
            onClick={() => setParams(id === "companies" ? { tab: id } : {})}
          >
            {text}
          </button>
        ))}
      </div>
      {tab === "customers" ? (
        <CustomerList onOpen={(id) => setParams({ customer: id })} openCompany={(id) => setParams({ company: id })} />
      ) : (
        <CompanyList onOpen={(id) => setParams({ company: id })} />
      )}
    </>
  );
}

function SearchBox({ id, placeholder, onSearch }: { id: string; placeholder: string; onSearch: (q: string) => void }) {
  const [q, setQ] = useState("");
  return (
    <form
      className="field"
      style={{ flex: "0 1 360px" }}
      onSubmit={(e) => {
        e.preventDefault();
        onSearch(q.trim());
      }}
    >
      <label htmlFor={id} className="visually-hidden">
        Search
      </label>
      <div className="input-icon">
        <Search size={18} aria-hidden="true" />
        <input id={id} placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
    </form>
  );
}

function CustomerList({ onOpen, openCompany }: { onOpen: (id: string) => void; openCompany: (id: string) => void }) {
  const [q, setQ] = useState("");
  const list = useQuery({
    queryKey: ["customers", q],
    queryFn: () => api<CustomerRow[]>(`/admin/customers${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
  return (
    <>
      <SearchBox id="customer-search" placeholder="Name, mobile or email" onSearch={setQ} />
      {list.error ? <p className="alert alert-error">{errText(list.error)}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Mobile</th>
            <th>Company</th>
            <th className="num">Orders</th>
            <th className="num">Lifetime</th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((c) => (
            <tr key={c.id}>
              <td>
                <button type="button" className="link" onClick={() => onOpen(c.id)}>
                  <strong>{c.name}</strong>
                </button>
              </td>
              <td>{phoneText(c.phone)}</td>
              <td>
                {c.companies.length
                  ? c.companies.map((m) => (
                      <button key={m.id} type="button" className="link" onClick={() => openCompany(m.id)}>
                        {m.name} ({m.role.toLowerCase()})
                      </button>
                    ))
                  : "—"}
              </td>
              <td className="num">{c.orders}</td>
              <td className="num">{rupees(c.lifetimeValue)}</td>
            </tr>
          ))}
          {list.data && !list.data.length ? (
            <tr>
              <td colSpan={5} className="muted">
                {q
                  ? "No customers match."
                  : "No customers yet. They appear here after their first sign-in on the website."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      <p className="t-body-xs muted">Lifetime value counts paid orders that weren’t cancelled.</p>
    </>
  );
}

function Back({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  return (
    <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={onBack}>
      ← {children}
    </button>
  );
}

function OrdersAndQuotes({ orders, quotes }: { orders: OrderRef[]; quotes: QuoteRef[] }) {
  return (
    <>
      <section className="card">
        <h2 className="t-h5">Orders</h2>
        {orders.length ? (
          <table className="table">
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>
                    <a className="link" href={`/orders?order=${o.id}`}>
                      {o.number}
                    </a>
                  </td>
                  <td>{dateText(o.placedAt)}</td>
                  <td>{label(o.status)}</td>
                  <td className="num">{rupees(o.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="t-body-s muted">No orders yet.</p>
        )}
      </section>
      <section className="card">
        <h2 className="t-h5">Quotations</h2>
        {quotes.length ? (
          <table className="table">
            <tbody>
              {quotes.map((q) => (
                <tr key={q.id}>
                  <td>
                    <a className="link" href={`/quotations?quote=${q.id}`}>
                      {q.number}
                    </a>
                  </td>
                  <td>{label(q.status)}</td>
                  <td className="num">{Number(q.total) ? rupees(q.total) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="t-body-s muted">No quotations yet.</p>
        )}
      </section>
    </>
  );
}

function CustomerDetail({
  id,
  onBack,
  open,
}: {
  id: string;
  onBack: () => void;
  open: (p: Record<string, string>) => void;
}) {
  const { can } = useSession();
  const client = useQueryClient();
  const customer = useQuery({ queryKey: ["customer", id], queryFn: () => api<Customer>(`/admin/customers/${id}`) });
  const [form, setForm] = useState({ name: "", email: "" });
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    if (customer.data) setForm({ name: customer.data.name, email: customer.data.email ?? "" });
  }, [customer.data]);
  const save = useMutation({
    mutationFn: () =>
      api<Customer>(`/admin/customers/${id}`, {
        method: "PATCH",
        body: { name: form.name, email: form.email.trim() || null },
      }),
    onSuccess: (data) => {
      client.setQueryData(["customer", id], data);
      void client.invalidateQueries({ queryKey: ["customers"] });
      setNotice("Saved.");
    },
  });
  const c = customer.data;
  return (
    <>
      <Back onBack={onBack}>All customers</Back>
      {customer.error ? <p className="alert alert-error">{errText(customer.error)}</p> : null}
      {c ? (
        <>
          <div className="page-header">
            <div>
              <h1 className="t-h2">{c.name}</h1>
              <p className="t-body-s muted">
                {phoneText(c.phone)} · joined {dateText(c.joinedAt)} · lifetime {rupees(c.lifetimeValue)}
              </p>
            </div>
          </div>
          <div className="layout-split">
            <div className="stack">
              <OrdersAndQuotes orders={c.orders} quotes={c.quotes} />
            </div>
            <div className="stack">
              <form
                className="card stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  setNotice(null);
                  save.mutate();
                }}
              >
                <h2 className="t-h5">Details</h2>
                <div className="field">
                  <label htmlFor="cust-name">Name</label>
                  <input
                    id="cust-name"
                    value={form.name}
                    disabled={!can("customers.write")}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cust-email">Email</label>
                  <input
                    id="cust-email"
                    type="email"
                    value={form.email}
                    disabled={!can("customers.write")}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cust-phone">Mobile</label>
                  <input id="cust-phone" value={phoneText(c.phone)} disabled />
                  <span className="hint">The mobile number is the sign-in and can’t be changed here.</span>
                </div>
                {save.error ? <p className="alert alert-error">{errText(save.error)}</p> : null}
                {notice ? <p className="alert alert-success">{notice}</p> : null}
                {can("customers.write") ? (
                  <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                    Save details
                  </button>
                ) : null}
              </form>
              <section className="card">
                <h2 className="t-h5">Companies</h2>
                {c.companies.length ? (
                  <ul className="pick-list">
                    {c.companies.map((m) => (
                      <li key={m.id}>
                        <button type="button" className="pick" onClick={() => open({ company: m.id })}>
                          <span>
                            <strong>{m.name}</strong>
                            <span className="t-body-xs muted">{label(m.role)}</span>
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="t-body-s muted">Not part of a company account. Add them from the company’s page.</p>
                )}
              </section>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}

function CompanyList({ onOpen }: { onOpen: (id: string) => void }) {
  const { can } = useSession();
  const client = useQueryClient();
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", gstin: "" });
  const list = useQuery({
    queryKey: ["companies", q],
    queryFn: () => api<CompanyRow[]>(`/admin/companies${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
  const create = useMutation({
    mutationFn: () =>
      api<Company>("/admin/companies", {
        method: "POST",
        body: { name: form.name, gstin: form.gstin.trim() || null },
      }),
    onSuccess: (data) => {
      void client.invalidateQueries({ queryKey: ["companies"] });
      onOpen(data.id);
    },
  });
  return (
    <>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <SearchBox id="company-search" placeholder="Company name or GSTIN" onSearch={setQ} />
        {can("customers.write") ? (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" /> New company
          </button>
        ) : null}
      </div>
      {list.error ? <p className="alert alert-error">{errText(list.error)}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Company</th>
            <th>GSTIN</th>
            <th className="num">Members</th>
            <th className="num">Quotations</th>
            <th>Credit terms</th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((c) => (
            <tr key={c.id}>
              <td>
                <button type="button" className="link" onClick={() => onOpen(c.id)}>
                  <strong>{c.name}</strong>
                </button>
              </td>
              <td className="mono">{c.gstin ?? "—"}</td>
              <td className="num">{c.members}</td>
              <td className="num">{c.quotes}</td>
              <td>
                {c.creditEnabled ? (
                  <span className="badge badge-success">{c.creditTermsDays} days</span>
                ) : (
                  <span className="badge">Pay before production</span>
                )}
              </td>
            </tr>
          ))}
          {list.data && !list.data.length ? (
            <tr>
              <td colSpan={5} className="muted">
                {q ? "No companies match." : "No company accounts yet."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {creating ? (
        <Dialog title="New company" onClose={() => setCreating(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="field">
              <label htmlFor="co-name">Company name</label>
              <input
                id="co-name"
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="co-gstin">GSTIN (optional)</label>
              <input
                id="co-gstin"
                className="mono"
                maxLength={15}
                value={form.gstin}
                onChange={(e) => setForm({ ...form, gstin: e.target.value.toUpperCase() })}
              />
              <span className="hint">15 characters, e.g. 27ABCDE1234F1Z5</span>
            </div>
            {create.error ? <p className="alert alert-error">{errText(create.error)}</p> : null}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                Create company
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

function CompanyDetail({
  id,
  onBack,
  open,
}: {
  id: string;
  onBack: () => void;
  open: (p: Record<string, string>) => void;
}) {
  const { can } = useSession();
  const client = useQueryClient();
  const company = useQuery({ queryKey: ["company", id], queryFn: () => api<Company>(`/admin/companies/${id}`) });
  const [member, setMember] = useState({ phone: "", role: "MEMBER" as "ADMIN" | "MEMBER" });
  const [credit, setCredit] = useState({ enabled: false, termsDays: "" });
  const [details, setDetails] = useState({ name: "", gstin: "", notes: "" });
  const [notice, setNotice] = useState<string | null>(null);
  const c = company.data;
  useEffect(() => {
    if (!c) return;
    setCredit({ enabled: c.credit.enabled, termsDays: c.credit.termsDays ? String(c.credit.termsDays) : "" });
    setDetails({ name: c.name, gstin: c.gstin ?? "", notes: c.notes ?? "" });
  }, [c]);
  const done = (text: string) => (data: Company) => {
    client.setQueryData(["company", id], data);
    void client.invalidateQueries({ queryKey: ["companies"] });
    void client.invalidateQueries({ queryKey: ["customers"] });
    setNotice(text);
  };
  const addMember = useMutation({
    mutationFn: () => api<Company>(`/admin/companies/${id}/members`, { method: "PUT", body: member }),
    onSuccess: (data) => {
      done("Member added.")(data);
      setMember({ phone: "", role: "MEMBER" });
    },
  });
  const removeMember = useMutation({
    mutationFn: (userId: string) => api<Company>(`/admin/companies/${id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: done("Member removed."),
  });
  const saveCredit = useMutation({
    mutationFn: () =>
      api<Company>(`/admin/companies/${id}/credit`, {
        method: "PUT",
        body: { enabled: credit.enabled, termsDays: credit.enabled ? Number(credit.termsDays) || null : null },
      }),
    onSuccess: done("Credit terms saved."),
  });
  const saveDetails = useMutation({
    mutationFn: () =>
      api<Company>(`/admin/companies/${id}`, {
        method: "PATCH",
        body: { name: details.name, gstin: details.gstin.trim() || null, notes: details.notes.trim() || null },
      }),
    onSuccess: done("Details saved."),
  });
  const error = addMember.error ?? removeMember.error ?? saveCredit.error ?? saveDetails.error;
  const canWrite = can("customers.write");
  const canCredit = can("credit_terms.approve");
  return (
    <>
      <Back onBack={onBack}>All companies</Back>
      {company.error ? <p className="alert alert-error">{errText(company.error)}</p> : null}
      {c ? (
        <>
          <div className="page-header">
            <div>
              <h1 className="t-h2">{c.name}</h1>
              <p className="t-body-s muted">
                {c.gstin ? `GSTIN ${c.gstin} · ` : ""}
                {c.members.length} {c.members.length === 1 ? "member" : "members"} · {c.orders.length} orders · lifetime{" "}
                {rupees(c.lifetimeValue)}
              </p>
            </div>
          </div>
          {error ? <p className="alert alert-error">{errText(error)}</p> : null}
          {notice && !error ? <p className="alert alert-success">{notice}</p> : null}
          <div className="layout-split">
            <div className="stack">
              <section className="card stack">
                <h2 className="t-h5">Members</h2>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Mobile</th>
                      <th>Role</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {c.members.map((m) => (
                      <tr key={m.id}>
                        <td>
                          <button type="button" className="link" onClick={() => open({ customer: m.id })}>
                            <strong>{m.name}</strong>
                          </button>
                        </td>
                        <td>{phoneText(m.phone)}</td>
                        <td>{label(m.role)}</td>
                        <td className="num">
                          {canWrite ? (
                            <button
                              type="button"
                              className="link"
                              onClick={() => confirm(`Remove ${m.name} from ${c.name}?`) && removeMember.mutate(m.id)}
                            >
                              Remove
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                    {!c.members.length ? (
                      <tr>
                        <td colSpan={4} className="muted">
                          No members yet.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
                {canWrite ? (
                  <form
                    className="row"
                    style={{ alignItems: "flex-end" }}
                    onSubmit={(e) => {
                      e.preventDefault();
                      setNotice(null);
                      addMember.mutate();
                    }}
                  >
                    <div className="field" style={{ flex: 1 }}>
                      <label htmlFor="member-phone">Add a customer by mobile number</label>
                      <input
                        id="member-phone"
                        inputMode="tel"
                        placeholder="10-digit mobile"
                        required
                        value={member.phone}
                        onChange={(e) => setMember({ ...member, phone: e.target.value })}
                      />
                    </div>
                    <div className="field">
                      <label htmlFor="member-role">Role</label>
                      <select
                        id="member-role"
                        value={member.role}
                        onChange={(e) => setMember({ ...member, role: e.target.value as "ADMIN" | "MEMBER" })}
                      >
                        <option value="MEMBER">Member</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                    </div>
                    <button type="submit" className="btn btn-secondary" disabled={addMember.isPending}>
                      Add
                    </button>
                  </form>
                ) : null}
                <p className="t-body-xs muted">
                  The customer must have signed in on the website once before they can be added.
                </p>
              </section>
              <OrdersAndQuotes orders={c.orders} quotes={c.quotes} />
            </div>
            <div className="stack">
              <form
                className="card stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  setNotice(null);
                  saveCredit.mutate();
                }}
              >
                <h2 className="t-h5">Credit terms</h2>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={credit.enabled}
                    disabled={!canCredit}
                    onChange={(e) => setCredit({ ...credit, enabled: e.target.checked })}
                  />{" "}
                  Credit terms enabled
                </label>
                <div className="field">
                  <label htmlFor="credit-days">Payment due within (days)</label>
                  <input
                    id="credit-days"
                    type="number"
                    min={1}
                    max={180}
                    value={credit.termsDays}
                    disabled={!canCredit || !credit.enabled}
                    required={credit.enabled}
                    onChange={(e) => setCredit({ ...credit, termsDays: e.target.value })}
                  />
                </div>
                {c.credit.enabled && c.credit.approvedAt ? (
                  <p className="t-body-xs muted">
                    Approved by {c.credit.approvedBy ?? "staff"} · {dateTimeText(c.credit.approvedAt)} (audited)
                  </p>
                ) : null}
                <p className="alert alert-info">
                  {canCredit
                    ? "Saving asks for your authenticator code. Every change is recorded in the audit log."
                    : "Changing credit terms needs the credit_terms.approve permission."}
                </p>
                {canCredit ? (
                  <button type="submit" className="btn btn-primary" disabled={saveCredit.isPending}>
                    Save credit terms
                  </button>
                ) : null}
              </form>
              <form
                className="card stack"
                onSubmit={(e) => {
                  e.preventDefault();
                  setNotice(null);
                  saveDetails.mutate();
                }}
              >
                <h2 className="t-h5">Company details</h2>
                <div className="field">
                  <label htmlFor="cd-name">Name</label>
                  <input
                    id="cd-name"
                    required
                    value={details.name}
                    disabled={!canWrite}
                    onChange={(e) => setDetails({ ...details, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cd-gstin">GSTIN</label>
                  <input
                    id="cd-gstin"
                    className="mono"
                    maxLength={15}
                    value={details.gstin}
                    disabled={!canWrite}
                    onChange={(e) => setDetails({ ...details, gstin: e.target.value.toUpperCase() })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="cd-notes">Internal notes</label>
                  <textarea
                    id="cd-notes"
                    rows={3}
                    value={details.notes}
                    disabled={!canWrite}
                    onChange={(e) => setDetails({ ...details, notes: e.target.value })}
                  />
                </div>
                {canWrite ? (
                  <button type="submit" className="btn btn-secondary" disabled={saveDetails.isPending}>
                    Save details
                  </button>
                ) : null}
              </form>
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
