import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { dateText, dateTimeText, errText, rupees } from "../lib/catalogue";
import { useSession } from "../lib/session";
import { Dialog } from "./CatalogueStructure";
import { phoneText } from "./Customers";

type Status = "REQUESTED" | "UNDER_REVIEW" | "SENT" | "CLARIFICATION" | "ACCEPTED" | "DECLINED";
type Row = {
  id: string;
  number: string;
  status: Status;
  source: string;
  name: string;
  summary: string;
  total: string | null;
  revision: number;
  validUntil: string | null;
  assignedTo: { id: string; name: string } | null;
  updatedAt: string;
};
type Config = { selections: Record<string, string | string[]>; quantity?: number; sizes?: Record<string, number> };
type Line = {
  productId: string | null;
  config: Config | null;
  description: string;
  quantity: number;
  engineUnitPrice: string | null;
  unitPrice: string;
  overridePercent?: string | null;
  gstRate: string;
  lineSubtotal?: string;
  lineTotal?: string;
};
type Quote = {
  id: string;
  number: string;
  status: Status;
  source: string;
  contact: { name: string; phone: string; email: string | null };
  companyName: string | null;
  gstin: string | null;
  company: { id: string; name: string } | null;
  assignedTo: { id: string; name: string } | null;
  request: {
    items: { productName: string; quantity: number; notes?: string }[];
    needBy: string | null;
    notes: string | null;
  } | null;
  notes: string | null;
  overrideReason: string | null;
  validUntil: string | null;
  revision: number;
  sentAt: string | null;
  createdAt: string;
  unsentChanges: boolean;
  nextStatuses: Status[];
  totals: { subtotal: string; tax: string; total: string };
  lines: Line[];
  revisions: { revision: number; sentAt: string; snapshot: { totals: { total: string } } }[];
};
type Options = {
  assignees: { id: string; name: string }[];
  products: { id: string; name: string; slug: string }[];
  gstRates: string[];
};
type ProductOptions = {
  id: string;
  name: string;
  quantityMode: "TIERS" | "SIZES";
  sizes: string[];
  minimumQuantity: number;
  unit: { one: string; many: string };
  groups: {
    key: string;
    label: string;
    kind: "SELECT" | "SWATCH" | "MULTISELECT";
    defaults: string[];
    options: { key: string; label: string }[];
  }[];
};

const STAGES: [Status, string][] = [
  ["REQUESTED", "Requested"],
  ["UNDER_REVIEW", "Under review"],
  ["SENT", "Sent"],
  ["CLARIFICATION", "Clarification"],
  ["ACCEPTED", "Accepted"],
];
const STATUS_TEXT: Record<Status, string> = { ...Object.fromEntries(STAGES), DECLINED: "Declined" } as Record<
  Status,
  string
>;
const BADGE: Record<Status, string> = {
  REQUESTED: "badge badge-info",
  UNDER_REVIEW: "badge badge-warning",
  SENT: "badge badge-info",
  CLARIFICATION: "badge badge-warning",
  ACCEPTED: "badge badge-success",
  DECLINED: "badge",
};
const same = (a: string, b: string) => Math.abs(Number(a) - Number(b)) < 0.00005;

/** AD-QUO-01 / 02 · Quotations. */
export function Quotations() {
  const [params, setParams] = useSearchParams();
  const id = params.get("quote");
  if (id) return <QuoteEditor id={id} onBack={() => setParams({})} />;
  return <Pipeline onOpen={(quoteId) => setParams({ quote: quoteId })} />;
}

function Pipeline({ onOpen }: { onOpen: (id: string) => void }) {
  const { can } = useSession();
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["quotes"], queryFn: () => api<Row[]>("/admin/quotes") });
  const [creating, setCreating] = useState(false);
  const [showDeclined, setShowDeclined] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", companyName: "" });
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Status }) =>
      api(`/admin/quotes/${id}/move`, { method: "POST", body: { status } }),
    onSettled: () => client.invalidateQueries({ queryKey: ["quotes"] }),
  });
  const create = useMutation({
    mutationFn: () =>
      api<Quote>("/admin/quotes", {
        method: "POST",
        body: {
          contact: { name: form.name, phone: form.phone, ...(form.email.trim() ? { email: form.email.trim() } : {}) },
          ...(form.companyName.trim() ? { companyName: form.companyName.trim() } : {}),
        },
      }),
    onSuccess: (q) => {
      void client.invalidateQueries({ queryKey: ["quotes"] });
      onOpen(q.id);
    },
  });
  const rows = list.data ?? [];
  const declined = rows.filter((r) => r.status === "DECLINED");
  const canWrite = can("quotes.write");
  const card = (r: Row) => (
    <li key={r.id}>
      <button
        type="button"
        className="kanban-card"
        draggable={canWrite}
        onDragStart={() => setDragging(r.id)}
        onDragEnd={() => setDragging(null)}
        onClick={() => onOpen(r.id)}
      >
        <span className="row" style={{ justifyContent: "space-between" }}>
          <span className="t-body-xs muted mono">{r.number}</span>
          {r.revision ? <span className="badge">Rev {r.revision}</span> : null}
          {r.status === "REQUESTED" && r.source === "web" ? <span className="badge badge-info">Website</span> : null}
        </span>
        <strong className="t-label-l">{r.name}</strong>
        <span className="t-body-xs muted">{r.summary}</span>
        <span className="row" style={{ justifyContent: "space-between" }}>
          <strong>{r.total ? rupees(r.total) : "—"}</strong>
          <span className="t-body-xs muted">{r.assignedTo?.name ?? "Unassigned"}</span>
        </span>
      </button>
    </li>
  );
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Quotation pipeline</h1>
          <p className="t-body-s muted">
            Requests from the website’s bulk-quote form arrive in Requested. Drag a card to move it; a quotation becomes
            Sent when you send a revision.
          </p>
        </div>
        {canWrite ? (
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            <Plus size={16} aria-hidden="true" /> New quotation
          </button>
        ) : null}
      </div>
      {list.error ? <p className="alert alert-error">{errText(list.error)}</p> : null}
      {move.error ? <p className="alert alert-error">{errText(move.error)}</p> : null}
      <div className="kanban">
        {STAGES.map(([status, text]) => {
          const items = rows.filter((r) => r.status === status);
          return (
            <section
              key={status}
              className="kanban-col"
              aria-label={text}
              onDragOver={(e) => dragging && e.preventDefault()}
              onDrop={() => {
                const row = rows.find((r) => r.id === dragging);
                if (row && row.status !== status) move.mutate({ id: row.id, status });
                setDragging(null);
              }}
            >
              <h2 className="t-label-m">
                {text} ({items.length})
              </h2>
              <ul>{items.map(card)}</ul>
            </section>
          );
        })}
      </div>
      {declined.length ? (
        <section className="stack">
          <button type="button" className="link" onClick={() => setShowDeclined((v) => !v)}>
            {showDeclined ? "Hide" : "Show"} declined ({declined.length})
          </button>
          {showDeclined ? <ul className="kanban-declined">{declined.map(card)}</ul> : null}
        </section>
      ) : null}
      {creating ? (
        <Dialog title="New quotation" onClose={() => setCreating(false)}>
          <form
            className="stack"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="field">
              <label htmlFor="nq-name">Contact name</label>
              <input
                id="nq-name"
                required
                minLength={2}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div className="grid-2">
              <div className="field">
                <label htmlFor="nq-phone">Mobile</label>
                <input
                  id="nq-phone"
                  required
                  inputMode="tel"
                  placeholder="10-digit mobile"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="nq-email">Email (optional)</label>
                <input
                  id="nq-email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="nq-company">Company (optional)</label>
              <input
                id="nq-company"
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              />
            </div>
            {create.error ? <p className="alert alert-error">{errText(create.error)}</p> : null}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={create.isPending}>
                Create quotation
              </button>
            </div>
          </form>
        </Dialog>
      ) : null}
    </>
  );
}

function QuoteEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useSession();
  const client = useQueryClient();
  const quote = useQuery({ queryKey: ["quote", id], queryFn: () => api<Quote>(`/admin/quotes/${id}`) });
  const options = useQuery({
    queryKey: ["quote-options"],
    queryFn: () => api<Options>("/admin/quotes/options"),
    staleTime: 60_000,
  });
  const [lines, setLines] = useState<Line[]>([]);
  const [dirty, setDirty] = useState(false);
  const [reason, setReason] = useState("");
  const [meta, setMeta] = useState({ validUntil: "", assignedToId: "", notes: "" });
  const [adding, setAdding] = useState<"product" | "other" | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const metaDirty = useRef(false);
  const q = quote.data;

  useEffect(() => {
    if (!q) return;
    setLines(q.lines);
    setDirty(false);
    setReason(q.overrideReason ?? "");
    // Keep details the person has typed but not saved yet (e.g. a date) when the lines are saved.
    if (!metaDirty.current)
      setMeta({
        validUntil: q.validUntil ? q.validUntil.slice(0, 10) : "",
        assignedToId: q.assignedTo?.id ?? "",
        notes: q.notes ?? "",
      });
  }, [q]);
  const editMeta = (patch: Partial<typeof meta>) => {
    metaDirty.current = true;
    setMeta((current) => ({ ...current, ...patch }));
  };

  const apply = (text: string) => (data: Quote) => {
    client.setQueryData(["quote", id], data);
    void client.invalidateQueries({ queryKey: ["quotes"] });
    setNotice(text);
  };
  const saveLines = useMutation({
    mutationFn: () =>
      api<Quote>(`/admin/quotes/${id}/lines`, {
        method: "PUT",
        body: {
          lines: lines.map((l) =>
            l.productId
              ? {
                  productId: l.productId,
                  config: l.config,
                  ...(l.engineUnitPrice && !same(l.unitPrice, l.engineUnitPrice) ? { unitPrice: l.unitPrice } : {}),
                }
              : { description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, gstRate: l.gstRate },
          ),
          ...(reason.trim() ? { overrideReason: reason.trim() } : {}),
        },
      }),
    onSuccess: apply("Lines saved."),
  });
  const saveMeta = useMutation({
    mutationFn: () =>
      api<Quote>(`/admin/quotes/${id}`, {
        method: "PATCH",
        body: {
          validUntil: meta.validUntil || null,
          assignedToId: meta.assignedToId || null,
          notes: meta.notes.trim() || null,
        },
      }),
    onSuccess: (data) => {
      metaDirty.current = false;
      apply("Saved.")(data);
    },
  });
  const send = useMutation({
    mutationFn: () => api<Quote>(`/admin/quotes/${id}/send`, { method: "POST" }),
    onSuccess: (data) => {
      apply(`Revision ${data.revision} recorded as sent.`)(data);
      setConfirmSend(false);
    },
  });
  const move = useMutation({
    mutationFn: (status: Status) => api<Quote>(`/admin/quotes/${id}/move`, { method: "POST", body: { status } }),
    onSuccess: apply("Stage changed."),
  });

  const totals = useMemo(() => {
    let subtotal = 0;
    let tax = 0;
    for (const l of lines) {
      const s = Math.round(Number(l.unitPrice) * l.quantity * 100) / 100;
      subtotal += s;
      tax += Math.round(s * Number(l.gstRate)) / 100;
    }
    return { subtotal: subtotal.toFixed(2), tax: tax.toFixed(2), total: (subtotal + tax).toFixed(2) };
  }, [lines]);

  if (quote.error) return <p className="alert alert-error">{errText(quote.error)}</p>;
  if (!q) return <p className="muted">Loading…</p>;

  const closed = q.status === "ACCEPTED" || q.status === "DECLINED";
  const canWrite = can("quotes.write") && !closed;
  const canOverride = can("quotes.override_price");
  const overridden = lines.some((l) => l.engineUnitPrice && !same(l.unitPrice, l.engineUnitPrice));
  const error = saveLines.error ?? saveMeta.error ?? move.error;
  const canSend = canWrite && !dirty && (q.status === "UNDER_REVIEW" || q.status === "CLARIFICATION");
  const change = (i: number, patch: Partial<Line>) => {
    setLines((current) => current.map((l, n) => (n === i ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  return (
    <>
      <button type="button" className="link" style={{ alignSelf: "flex-start" }} onClick={onBack}>
        ← Quotation pipeline
      </button>
      <div className="page-header">
        <div>
          <h1 className="t-h2">
            {q.number}
            {q.revision ? ` · Revision ${q.revision}` : ""}{" "}
            <span className={BADGE[q.status]}>{STATUS_TEXT[q.status]}</span>
          </h1>
          <p className="t-body-s muted">
            {q.companyName ? `${q.companyName} · ` : ""}
            {q.contact.name} · {phoneText(q.contact.phone)}
            {q.contact.email ? ` · ${q.contact.email}` : ""} ·{" "}
            {q.assignedTo ? `assigned to ${q.assignedTo.name}` : "unassigned"}
            {q.validUntil ? ` · valid until ${dateText(q.validUntil)}` : ""}
          </p>
        </div>
        <div className="row">
          {can("quotes.write")
            ? q.nextStatuses.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="btn btn-secondary"
                  disabled={move.isPending}
                  onClick={() => (s !== "DECLINED" || confirm("Mark this quotation as declined?")) && move.mutate(s)}
                >
                  {s === "ACCEPTED"
                    ? "Mark accepted"
                    : s === "DECLINED"
                      ? "Mark declined"
                      : `Move to ${STATUS_TEXT[s].toLowerCase()}`}
                </button>
              ))
            : null}
          {canWrite ? (
            <button type="button" className="btn btn-primary" disabled={!canSend} onClick={() => setConfirmSend(true)}>
              Send revision {q.revision + 1}
            </button>
          ) : null}
        </div>
      </div>
      {error ? <p className="alert alert-error">{errText(error)}</p> : null}
      {notice && !error ? <p className="alert alert-success">{notice}</p> : null}
      {q.unsentChanges ? (
        <p className="alert alert-info">
          The lines changed after revision {q.revision} was sent. Send a new revision when the quotation is ready.
        </p>
      ) : null}

      <section className="card stack">
        <table className="table">
          <thead>
            <tr>
              <th>Line</th>
              <th className="num">Qty</th>
              <th className="num">Engine price</th>
              <th className="num">Quoted unit (₹)</th>
              <th>Override</th>
              <th className="num">GST</th>
              <th className="num">Line total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => {
              const over = l.engineUnitPrice && !same(l.unitPrice, l.engineUnitPrice);
              const percent = over ? ((Number(l.unitPrice) / Number(l.engineUnitPrice) - 1) * 100).toFixed(1) : null;
              const sub = Math.round(Number(l.unitPrice) * l.quantity * 100) / 100;
              // A product line added in this session is priced by the engine when the lines are saved.
              const pending = !!l.productId && !l.engineUnitPrice;
              return (
                <tr key={i}>
                  <td>
                    <strong>{l.description}</strong>
                    {!l.productId ? <span className="t-body-xs muted"> · other charge</span> : null}
                  </td>
                  <td className="num">{l.quantity.toLocaleString("en-IN")}</td>
                  <td className="num">{pending ? "On save" : l.engineUnitPrice ? rupees(l.engineUnitPrice) : "—"}</td>
                  <td className="num">
                    <input
                      className="cell-input num"
                      aria-label={`Quoted unit price for ${l.description}`}
                      inputMode="decimal"
                      value={pending ? "" : l.unitPrice}
                      placeholder={pending ? "On save" : undefined}
                      disabled={!canWrite || pending || (!!l.productId && !canOverride)}
                      onChange={(e) => change(i, { unitPrice: e.target.value.replace(/[^0-9.]/g, "") })}
                    />
                  </td>
                  <td>
                    {percent ? (
                      <span className="badge badge-warning">
                        {Number(percent) > 0 ? "+" : ""}
                        {percent}%
                      </span>
                    ) : (
                      <span className="badge">None</span>
                    )}
                  </td>
                  <td className="num">{pending ? "—" : `${Number(l.gstRate)}%`}</td>
                  <td className="num">
                    {pending ? "—" : rupees((sub + Math.round(sub * Number(l.gstRate)) / 100).toFixed(2))}
                  </td>
                  <td className="num">
                    {canWrite ? (
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        aria-label={`Remove ${l.description}`}
                        onClick={() => {
                          setLines((current) => current.filter((_, n) => n !== i));
                          setDirty(true);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </td>
                </tr>
              );
            })}
            {!lines.length ? (
              <tr>
                <td colSpan={8} className="muted">
                  No lines yet. Add what you’re quoting for.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        {canWrite ? (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setAdding("product")}>
                <Plus size={16} aria-hidden="true" /> Add product
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setAdding("other")}>
                <Plus size={16} aria-hidden="true" /> Add other charge
              </button>
            </div>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!dirty || saveLines.isPending}
              onClick={() => {
                setNotice(null);
                saveLines.mutate();
              }}
            >
              {dirty ? "Save lines" : "Lines saved"}
            </button>
          </div>
        ) : null}
        <p className="t-body-xs muted">
          Engine price is the published price for the chosen options and quantity. Prices are reference rates until the
          business confirms them (D-08).
        </p>
      </section>

      <div className="layout-split">
        <div className="stack">
          <section className="card stack">
            <h2 className="t-h5">Price override reason (audited)</h2>
            <div className="field">
              <label htmlFor="override-reason">Reason</label>
              <textarea
                id="override-reason"
                rows={3}
                value={reason}
                disabled={!canWrite || !canOverride}
                placeholder={overridden ? "Why is the quoted price different from the engine price?" : ""}
                onChange={(e) => {
                  setReason(e.target.value);
                  setDirty(true);
                }}
              />
              {overridden && reason.trim().length < 5 ? (
                <span className="hint">Needed before the lines can be saved.</span>
              ) : null}
            </div>
            <p className="alert alert-info">
              {canOverride
                ? "Overrides are logged with the engine price, the quoted price, the staff member and the time."
                : "Changing an engine price needs the quotes.override_price permission."}
            </p>
          </section>
          {q.request ? (
            <section className="card stack">
              <h2 className="t-h5">What the customer asked for</h2>
              <ul>
                {q.request.items.map((item, i) => (
                  <li key={i}>
                    <strong>
                      {item.quantity.toLocaleString("en-IN")} × {item.productName}
                    </strong>
                    {item.notes ? ` — ${item.notes}` : ""}
                  </li>
                ))}
              </ul>
              {q.request.needBy ? <p className="t-body-s">Needed by {dateText(q.request.needBy)}</p> : null}
              {q.request.notes ? <p className="t-body-s">{q.request.notes}</p> : null}
              <p className="t-body-xs muted">Sent from the website on {dateTimeText(q.createdAt)}.</p>
            </section>
          ) : null}
          {q.revisions.length ? (
            <section className="card stack">
              <h2 className="t-h5">Sent revisions</h2>
              <table className="table">
                <tbody>
                  {q.revisions.map((r) => (
                    <tr key={r.revision}>
                      <td>Revision {r.revision}</td>
                      <td>{dateTimeText(r.sentAt)}</td>
                      <td className="num">{rupees(r.snapshot.totals.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ) : null}
        </div>
        <form
          className="card stack"
          onSubmit={(e) => {
            e.preventDefault();
            setNotice(null);
            saveMeta.mutate();
          }}
        >
          <h2 className="t-h5">Totals</h2>
          <dl className="summary">
            <dt>Subtotal</dt>
            <dd>{rupees(totals.subtotal)}</dd>
            <dt>GST</dt>
            <dd>{rupees(totals.tax)}</dd>
            <dt>Total</dt>
            <dd>{rupees(totals.total)}</dd>
          </dl>
          {dirty ? <p className="t-body-xs muted">Estimate — save the lines for the exact totals.</p> : null}
          <div className="field">
            <label htmlFor="valid-until">Valid until</label>
            <input
              id="valid-until"
              type="date"
              value={meta.validUntil}
              disabled={!canWrite}
              onChange={(e) => editMeta({ validUntil: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="assigned-to">Assigned to</label>
            <select
              id="assigned-to"
              value={meta.assignedToId}
              disabled={!canWrite}
              onChange={(e) => editMeta({ assignedToId: e.target.value })}
            >
              <option value="">Unassigned</option>
              {options.data?.assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="quote-notes">Internal notes</label>
            <textarea
              id="quote-notes"
              rows={3}
              value={meta.notes}
              disabled={!canWrite}
              onChange={(e) => editMeta({ notes: e.target.value })}
            />
          </div>
          {canWrite ? (
            <button type="submit" className="btn btn-secondary" disabled={saveMeta.isPending}>
              Save details
            </button>
          ) : null}
          <p className="t-body-xs muted">
            Turning an accepted quotation into an order arrives with checkout and payments (D-06).
          </p>
        </form>
      </div>

      {adding === "product" && options.data ? (
        <AddProductLine
          products={options.data.products}
          onClose={() => setAdding(null)}
          onAdd={(line) => {
            setLines((current) => [...current, line]);
            setDirty(true);
            setAdding(null);
          }}
        />
      ) : null}
      {adding === "other" && options.data ? (
        <AddOtherLine
          gstRates={options.data.gstRates}
          onClose={() => setAdding(null)}
          onAdd={(line) => {
            setLines((current) => [...current, line]);
            setDirty(true);
            setAdding(null);
          }}
        />
      ) : null}
      {confirmSend ? (
        <Dialog title={`Send revision ${q.revision + 1}?`} onClose={() => setConfirmSend(false)}>
          <div className="stack">
            <p className="t-body-s">
              This records {rupees(q.totals.total)} (incl. GST) as quoted to {q.contact.name}, valid until{" "}
              {q.validUntil ? dateText(q.validUntil) : "— (set a date first)"}. The revision can’t be changed
              afterwards.
            </p>
            <p className="alert alert-info">
              The quotation isn’t emailed automatically yet — share it with the customer yourself. Automatic sending
              arrives with an email / SMS provider (D-25).
            </p>
            {send.error ? <p className="alert alert-error">{errText(send.error)}</p> : null}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmSend(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={send.isPending} onClick={() => send.mutate()}>
                Record as sent
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}

function AddProductLine({
  products,
  onAdd,
  onClose,
}: {
  products: Options["products"];
  onAdd: (line: Line) => void;
  onClose: () => void;
}) {
  const [productId, setProductId] = useState(products[0]?.id ?? "");
  const product = useQuery({
    queryKey: ["quote-product", productId],
    queryFn: () => api<ProductOptions>(`/admin/quotes/products/${productId}`),
    enabled: !!productId,
  });
  const [selections, setSelections] = useState<Record<string, string | string[]>>({});
  const [quantity, setQuantity] = useState("");
  const [sizes, setSizes] = useState<Record<string, string>>({});
  const p = product.data;
  useEffect(() => {
    if (!p) return;
    setSelections(
      Object.fromEntries(
        p.groups
          .filter((g) => g.defaults.length)
          .map((g) => [g.key, g.kind === "MULTISELECT" ? g.defaults : g.defaults[0]]),
      ),
    );
    setQuantity(String(p.minimumQuantity));
    setSizes({});
  }, [p]);
  const total =
    p?.quantityMode === "SIZES"
      ? Object.values(sizes).reduce((s, v) => s + (Number(v) || 0), 0)
      : Number(quantity) || 0;
  return (
    <Dialog title="Add product" onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          if (!p || total < 1) return;
          const config: Config =
            p.quantityMode === "SIZES"
              ? {
                  selections,
                  sizes: Object.fromEntries(
                    Object.entries(sizes)
                      .map(([k, v]) => [k, Number(v) || 0] as const)
                      .filter(([, v]) => v > 0),
                  ),
                }
              : { selections, quantity: total };
          const labels = p.groups.flatMap((g) => {
            const raw = selections[g.key];
            const keys = raw === undefined ? [] : Array.isArray(raw) ? raw : [raw];
            return keys.map((k) => g.options.find((o) => o.key === k)?.label ?? k);
          });
          // The engine prices the line when it is saved; until then the price shows as pending.
          onAdd({
            productId: p.id,
            config,
            description: [p.name, ...labels].join(" · "),
            quantity: total,
            engineUnitPrice: null,
            unitPrice: "0",
            gstRate: "0",
          });
        }}
      >
        <div className="field">
          <label htmlFor="ap-product">Product</label>
          <select id="ap-product" value={productId} onChange={(e) => setProductId(e.target.value)}>
            {products.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
        {product.error ? <p className="alert alert-error">{errText(product.error)}</p> : null}
        {p ? (
          <>
            <div className="grid-2">
              {p.groups.map((g) =>
                g.kind === "MULTISELECT" ? (
                  <fieldset key={g.key} className="field">
                    <legend>{g.label}</legend>
                    {g.options.map((o) => {
                      const current = (selections[g.key] as string[] | undefined) ?? [];
                      return (
                        <label key={o.key} className="check">
                          <input
                            type="checkbox"
                            checked={current.includes(o.key)}
                            onChange={(e) =>
                              setSelections({
                                ...selections,
                                [g.key]: e.target.checked ? [...current, o.key] : current.filter((k) => k !== o.key),
                              })
                            }
                          />{" "}
                          {o.label}
                        </label>
                      );
                    })}
                  </fieldset>
                ) : (
                  <div key={g.key} className="field">
                    <label htmlFor={`ap-${g.key}`}>{g.label}</label>
                    <select
                      id={`ap-${g.key}`}
                      value={(selections[g.key] as string | undefined) ?? ""}
                      onChange={(e) => setSelections({ ...selections, [g.key]: e.target.value })}
                    >
                      {g.options.map((o) => (
                        <option key={o.key} value={o.key}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ),
              )}
            </div>
            {p.quantityMode === "SIZES" ? (
              <fieldset className="field">
                <legend>
                  Quantity by size · total {total.toLocaleString("en-IN")} {p.unit.many}
                </legend>
                <div className="row" style={{ flexWrap: "wrap" }}>
                  {p.sizes.map((s) => (
                    <label key={s} className="t-body-s">
                      {s}{" "}
                      <input
                        className="cell-input"
                        style={{ width: 72 }}
                        inputMode="numeric"
                        value={sizes[s] ?? ""}
                        onChange={(e) => setSizes({ ...sizes, [s]: e.target.value.replace(/\D/g, "") })}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : (
              <div className="field">
                <label htmlFor="ap-qty">Quantity ({p.unit.many})</label>
                <input
                  id="ap-qty"
                  inputMode="numeric"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))}
                />
                <span className="hint">Minimum {p.minimumQuantity.toLocaleString("en-IN")}</span>
              </div>
            )}
          </>
        ) : null}
        <p className="t-body-xs muted">The price is worked out when you save the lines.</p>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!p || total < 1}>
            Add line
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function AddOtherLine({
  gstRates,
  onAdd,
  onClose,
}: {
  gstRates: string[];
  onAdd: (line: Line) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ description: "", quantity: "1", unitPrice: "", gstRate: gstRates.at(-1) ?? "" });
  return (
    <Dialog title="Add other charge" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          onAdd({
            productId: null,
            config: null,
            description: form.description.trim(),
            quantity: Number(form.quantity) || 1,
            engineUnitPrice: null,
            unitPrice: form.unitPrice,
            gstRate: form.gstRate,
          });
        }}
      >
        <div className="field">
          <label htmlFor="ol-desc">Description</label>
          <input
            id="ol-desc"
            required
            maxLength={200}
            placeholder="e.g. Delivery to two offices"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="ol-qty">Quantity</label>
            <input
              id="ol-qty"
              inputMode="numeric"
              required
              value={form.quantity}
              onChange={(e) => setForm({ ...form, quantity: e.target.value.replace(/\D/g, "") })}
            />
          </div>
          <div className="field">
            <label htmlFor="ol-price">Unit price (₹, before GST)</label>
            <input
              id="ol-price"
              inputMode="decimal"
              required
              pattern="\d{1,9}(\.\d{1,4})?"
              value={form.unitPrice}
              onChange={(e) => setForm({ ...form, unitPrice: e.target.value.replace(/[^0-9.]/g, "") })}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="ol-gst">GST rate</label>
          <select id="ol-gst" value={form.gstRate} onChange={(e) => setForm({ ...form, gstRate: e.target.value })}>
            {gstRates.map((r) => (
              <option key={r} value={r}>
                {Number(r)}%
              </option>
            ))}
          </select>
          <span className="hint">Rates come from the catalogue’s tax profiles (the CA confirms them, D-28).</span>
        </div>
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary">
            Add line
          </button>
        </div>
      </form>
    </Dialog>
  );
}
