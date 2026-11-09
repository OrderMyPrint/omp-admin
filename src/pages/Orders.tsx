import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, Info, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { dateText, dateTimeText, errText, rupees } from "../lib/catalogue";
import { useSession } from "../lib/session";
import { Dialog } from "./CatalogueStructure";

type OrderStatus =
  | "AWAITING_PAYMENT"
  | "PAID"
  | "IN_PRODUCTION"
  | "READY_TO_DISPATCH"
  | "DISPATCHED"
  | "DELIVERED"
  | "CANCELLED";
type PaymentLabel = "PENDING" | "PAID" | "FAILED" | "REFUND_REQUESTED" | "REFUNDED";
type Row = {
  id: string;
  orderNumber: string;
  customer: string;
  placedAt: string;
  payment: PaymentLabel;
  status: OrderStatus;
  onHold: boolean;
  grandTotal: string;
};
type List = { items: Row[]; total: number; page: number; pageSize: number; counts: Record<string, number> };
type Address = { name: string; line1: string; line2?: string; city: string; state: string; pincode: string };
type Detail = {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  payment: PaymentLabel;
  onHold: boolean;
  holdReason: string | null;
  holdReviewOn: string | null;
  cancelReason: string | null;
  placedAt: string;
  paidAt: string | null;
  contact: { name: string; phone: string; email: string | null };
  customer: { id: string; name: string; phone: string };
  billingAddress: Address;
  shippingAddress: Address;
  gstin: string | null;
  companyName: string | null;
  placeOfSupplyState: string;
  totals: { subtotal: string; discount: string; shipping: string; tax: string; total: string };
  items: {
    id: string;
    productName: string;
    spec: {
      options: { label: string; choices: { label: string }[] }[];
      quantity: number | null;
      unit: { many: string };
    };
    quantity: number;
    unitPrice: string;
    lineTotal: string;
    gstRate: string;
    status: "ACTIVE" | "CANCELLED";
    pricingVersionNo: number | null;
  }[];
  payments: { id: string; provider: string; providerRef: string; amount: string; status: string; createdAt: string }[];
  refunds: { id: string; amount: string; reason: string; status: string; createdAt: string }[];
  paymentEvents: {
    id: string;
    kind: string;
    providerRef: string | null;
    amount: string | null;
    verified: boolean;
    outcome: string;
    receivedAt: string;
  }[];
  events: { kind: string; message: string; actorKind: string; actorName: string | null; at: string }[];
};

const STATUS: Record<OrderStatus, [string, string]> = {
  AWAITING_PAYMENT: ["badge", "Awaiting payment"],
  PAID: ["badge badge-success", "Paid — next: artwork & production"],
  IN_PRODUCTION: ["badge badge-info", "In production"],
  READY_TO_DISPATCH: ["badge badge-info", "Ready to dispatch"],
  DISPATCHED: ["badge badge-info", "Dispatched"],
  DELIVERED: ["badge badge-success", "Delivered"],
  CANCELLED: ["badge", "Cancelled"],
};
const PAYMENT: Record<PaymentLabel, [string, string]> = {
  PENDING: ["badge badge-warning", "Pending"],
  PAID: ["badge badge-success", "Paid"],
  FAILED: ["badge badge-warning", "Failed"],
  REFUND_REQUESTED: ["badge badge-warning", "Refund requested"],
  REFUNDED: ["badge", "Refunded"],
};
const FILTERS: [string, string][] = [
  ["", "All"],
  ["AWAITING_PAYMENT", "Awaiting payment"],
  ["PAID", "Paid"],
  ["IN_PRODUCTION", "In production"],
  ["READY_TO_DISPATCH", "Ready to dispatch"],
  ["ON_HOLD", "On hold"],
  ["CANCELLED", "Cancelled"],
];

/** AD-ORD-01 / 02 · Orders. */
export function Orders() {
  const [params, setParams] = useSearchParams();
  const id = params.get("order");
  if (id) return <OrderDetail id={id} onBack={() => setParams({})} />;
  return <OrderList onOpen={(orderId) => setParams({ order: orderId })} />;
}

function OrderList({ onOpen }: { onOpen: (id: string) => void }) {
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({
    ...(status ? { status } : {}),
    ...(search ? { q: search } : {}),
    page: String(page),
  }).toString();
  const list = useQuery({ queryKey: ["orders", query], queryFn: () => api<List>(`/admin/orders?${query}`) });
  useEffect(() => setPage(1), [status, search]);
  const pages = list.data ? Math.max(1, Math.ceil(list.data.total / list.data.pageSize)) : 1;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Orders</h1>
          <p className="t-body-s muted">Filter by state and payment; open an order to hold or cancel it.</p>
        </div>
        <a
          className="btn btn-secondary"
          href={`/api/v1/admin/orders/export.csv?${new URLSearchParams({
            ...(status ? { status } : {}),
            ...(search ? { q: search } : {}),
          })}`}
        >
          <Download size={16} aria-hidden="true" /> Export CSV
        </a>
      </div>
      <p className="alert alert-info">
        Customer checkout opens once a payment gateway (D-06) and an SMS provider (D-25) are chosen. Until then, orders
        here come from local testing only.
      </p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="chips" role="group" aria-label="Filter by state">
          {FILTERS.map(([value, label]) => (
            <button
              key={value || "all"}
              type="button"
              className="chip"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {label}
              {value && list.data?.counts[value] ? <span className="chip-count">{list.data.counts[value]}</span> : null}
            </button>
          ))}
        </div>
        <form
          className="field"
          style={{ flex: "0 1 320px" }}
          onSubmit={(e) => {
            e.preventDefault();
            setSearch(q.trim());
          }}
        >
          <label htmlFor="order-search" className="visually-hidden">
            Search orders
          </label>
          <div className="input-icon">
            <Search size={18} aria-hidden="true" />
            <input
              id="order-search"
              placeholder="Order number, customer or mobile"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </form>
      </div>
      {list.error ? <p className="alert alert-error">{errText(list.error)}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Placed</th>
            <th>Payment</th>
            <th>Status</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {(list.data?.items ?? []).map((o) => (
            <tr key={o.id}>
              <td>
                <button type="button" className="link" onClick={() => onOpen(o.id)}>
                  <strong>{o.orderNumber}</strong>
                </button>
              </td>
              <td>{o.customer}</td>
              <td>{dateTimeText(o.placedAt)}</td>
              <td>
                <span className={PAYMENT[o.payment][0]}>{PAYMENT[o.payment][1]}</span>
              </td>
              <td>
                <span className={STATUS[o.status][0]}>{STATUS[o.status][1]}</span>
                {o.onHold ? (
                  <>
                    {" "}
                    <span className="badge badge-warning">On hold</span>
                  </>
                ) : null}
              </td>
              <td className="num">{rupees(o.grandTotal)}</td>
            </tr>
          ))}
          {list.data && !list.data.items.length ? (
            <tr>
              <td colSpan={6} className="muted">
                {search || status ? "No orders match." : "No orders yet."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {pages > 1 ? (
        <nav className="row" style={{ justifyContent: "center" }} aria-label="Pages">
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Previous page"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            <ChevronLeft size={16} aria-hidden="true" />
          </button>
          <span className="t-body-s">
            Page {page} of {pages}
          </span>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            aria-label="Next page"
            disabled={page >= pages}
            onClick={() => setPage(page + 1)}
          >
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        </nav>
      ) : null}
    </>
  );
}

const addressText = (a: Address) =>
  [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(" · ");
const actorText = (e: Detail["events"][number]) =>
  e.actorKind === "system" ? "System" : e.actorKind === "customer" ? "Customer" : (e.actorName ?? "Staff");

function OrderDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { can } = useSession();
  const client = useQueryClient();
  const order = useQuery({ queryKey: ["order", id], queryFn: () => api<Detail>(`/admin/orders/${id}`) });
  const [dialog, setDialog] = useState<"hold" | "cancel" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const release = useMutation({
    mutationFn: () => api<Detail>(`/admin/orders/${id}/release`, { method: "POST", body: {} }),
    onSuccess: (d) => {
      client.setQueryData(["order", id], d);
      void client.invalidateQueries({ queryKey: ["orders"] });
      setNotice("Hold released.");
    },
  });
  const o = order.data;
  if (order.error) return <p className="alert alert-error">{errText(order.error)}</p>;
  if (!o) return <p className="muted">Loading…</p>;
  const closed = o.status === "CANCELLED" || o.status === "DELIVERED";
  const cancellable = !["IN_PRODUCTION", "READY_TO_DISPATCH", "DISPATCHED", "DELIVERED", "CANCELLED"].includes(
    o.status,
  );
  const done = (d: Detail, text: string) => {
    client.setQueryData(["order", id], d);
    void client.invalidateQueries({ queryKey: ["orders"] });
    setDialog(null);
    setNotice(text);
  };

  return (
    <>
      <div className="page-header">
        <div>
          <button type="button" className="link" onClick={onBack}>
            ← All orders
          </button>
          <h1 className="t-h2">{o.orderNumber}</h1>
          <p className="t-body-s muted">
            {o.companyName ?? o.contact.name} · {o.contact.phone} · {o.paidAt ? "Paid" : "Not paid"}{" "}
            {rupees(o.totals.total)}
            {o.refunds.length
              ? ` · refund ${o.refunds.every((r) => r.status === "PROCESSED") ? "processed" : "requested"}`
              : ""}
            {o.gstin ? ` · GSTIN ${o.gstin}` : ""}
          </p>
        </div>
        <div className="row">
          {can("orders.write") && !closed ? (
            o.onHold ? (
              <button
                type="button"
                className="btn btn-secondary"
                disabled={release.isPending}
                onClick={() => release.mutate()}
              >
                Release hold
              </button>
            ) : (
              <button type="button" className="btn btn-secondary" onClick={() => setDialog("hold")}>
                Hold
              </button>
            )
          ) : null}
          {can("orders.cancel") && cancellable ? (
            <button type="button" className="btn btn-danger" onClick={() => setDialog("cancel")}>
              Cancel order…
            </button>
          ) : null}
        </div>
      </div>
      {notice ? (
        <p className="alert alert-success" role="status">
          {notice}
        </p>
      ) : null}
      {release.error ? <p className="alert alert-error">{errText(release.error)}</p> : null}
      <div className="row" style={{ gap: 8 }}>
        <span className={STATUS[o.status][0]}>{STATUS[o.status][1]}</span>
        {o.onHold ? (
          <span className="badge badge-warning">
            On hold — {o.holdReason}
            {o.holdReviewOn ? ` · review ${dateText(o.holdReviewOn)}` : ""}
          </span>
        ) : null}
        {o.cancelReason ? <span className="badge">Cancelled — {o.cancelReason}</span> : null}
      </div>

      <div className="layout-split">
        <div className="stack">
          <section className="card" aria-labelledby="items-title">
            <h2 id="items-title" className="t-h4">
              Items &amp; production gate
            </h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Specification</th>
                  <th>Status</th>
                  <th className="num">Line total</th>
                </tr>
              </thead>
              <tbody>
                {o.items.map((i) => (
                  <tr key={i.id}>
                    <td>
                      <strong>{i.productName}</strong>
                      <br />
                      <span className="mono">
                        × {i.quantity.toLocaleString("en-IN")} · pricing v{i.pricingVersionNo ?? "?"}
                      </span>
                    </td>
                    <td className="t-body-s">
                      {i.spec.options.map((g) => `${g.label}: ${g.choices.map((c) => c.label).join(", ")}`).join(" · ")}
                    </td>
                    <td>
                      {i.status === "CANCELLED" ? (
                        <span className="badge">Cancelled</span>
                      ) : (
                        <span className="badge badge-info">Active</span>
                      )}
                    </td>
                    <td className="num">{rupees(i.lineTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="alert alert-info row" style={{ flexWrap: "nowrap", alignItems: "flex-start" }}>
              <Info size={18} aria-hidden="true" style={{ flexShrink: 0 }} />
              <span>
                <strong>Production gate (server-enforced).</strong> An item enters production only when the order is
                paid or credit-approved and every required artwork slot has an approved version. Artwork review and
                production arrive with file storage (D-05).
              </span>
            </p>
          </section>

          <section className="card" aria-labelledby="payments-title">
            <h2 id="payments-title" className="t-h4">
              Payment &amp; events
            </h2>
            <table className="table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>Detail</th>
                  <th>Received</th>
                  <th>Verified</th>
                </tr>
              </thead>
              <tbody>
                {o.paymentEvents.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <strong>{e.kind}</strong>
                      {e.outcome !== "applied" ? <span className="muted"> ({e.outcome})</span> : null}
                    </td>
                    <td className="t-body-s">
                      {e.providerRef ?? "—"}
                      {e.amount ? ` · ${rupees(e.amount)}` : ""}
                      {e.outcome === "duplicate" ? " · same event id — ignored" : ""}
                      {e.outcome === "rejected" && e.verified ? " · amount didn't match" : ""}
                    </td>
                    <td>{dateTimeText(e.receivedAt)}</td>
                    <td>{e.verified ? "Signature ✓" : "Invalid signature"}</td>
                  </tr>
                ))}
                {!o.paymentEvents.length ? (
                  <tr>
                    <td colSpan={4} className="muted">
                      No gateway events yet.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
            {o.refunds.length ? (
              <table className="table">
                <thead>
                  <tr>
                    <th>Refund</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th className="num">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {o.refunds.map((r) => (
                    <tr key={r.id}>
                      <td>{dateTimeText(r.createdAt)}</td>
                      <td>{r.reason}</td>
                      <td>
                        <span className={r.status === "PROCESSED" ? "badge badge-success" : "badge badge-warning"}>
                          {r.status === "PROCESSED" ? "Processed" : "Requested"}
                        </span>
                      </td>
                      <td className="num">{rupees(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}
          </section>
        </div>

        <div className="stack">
          <section className="card" aria-labelledby="snapshot-title">
            <h2 id="snapshot-title" className="t-h4">
              Pricing snapshot
            </h2>
            <dl className="summary">
              <dt>Subtotal</dt>
              <dd>{rupees(o.totals.subtotal)}</dd>
              {Number(o.totals.discount) > 0 ? (
                <>
                  <dt>Discount</dt>
                  <dd>− {rupees(o.totals.discount)}</dd>
                </>
              ) : null}
              <dt>Shipping</dt>
              <dd>{Number(o.totals.shipping) > 0 ? rupees(o.totals.shipping) : "Not charged (rates not set up)"}</dd>
              <dt>GST</dt>
              <dd>{rupees(o.totals.tax)}</dd>
              <dt>Total</dt>
              <dd>{rupees(o.totals.total)}</dd>
            </dl>
            <p className="t-body-s muted">Immutable — later price changes never alter this order.</p>
          </section>

          <section className="card" aria-labelledby="customer-title">
            <h2 id="customer-title" className="t-h4">
              Customer &amp; delivery
            </h2>
            <dl className="summary">
              <dt>Contact</dt>
              <dd>
                {o.contact.name} · {o.contact.phone}
                {o.contact.email ? ` · ${o.contact.email}` : ""}
              </dd>
              <dt>Ship to</dt>
              <dd>{addressText(o.shippingAddress)}</dd>
              <dt>Bill to</dt>
              <dd>{addressText(o.billingAddress)}</dd>
              <dt>Place of supply</dt>
              <dd>{o.placeOfSupplyState}</dd>
            </dl>
          </section>

          <section className="card" aria-labelledby="activity-title">
            <h2 id="activity-title" className="t-h4">
              Activity (audit)
            </h2>
            <ul className="timeline">
              {o.events.map((e, i) => (
                <li key={i}>
                  <strong>{e.message}</strong>
                  <span className="t-body-s muted">
                    {actorText(e)} · {dateTimeText(e.at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      {dialog === "hold" ? (
        <HoldDialog order={o} onClose={() => setDialog(null)} onDone={(d) => done(d, "Order put on hold.")} />
      ) : null}
      {dialog === "cancel" ? (
        <CancelDialog order={o} onClose={() => setDialog(null)} onDone={(d, text) => done(d, text)} />
      ) : null}
    </>
  );
}

const HOLD_REASONS = [
  "Waiting for customer reply",
  "Artwork question",
  "Payment or credit check",
  "Stock or material check",
  "Other",
];

function HoldDialog({ order, onClose, onDone }: { order: Detail; onClose: () => void; onDone: (d: Detail) => void }) {
  const [reason, setReason] = useState(HOLD_REASONS[0]);
  const [reviewOn, setReviewOn] = useState("");
  const [note, setNote] = useState("");
  const hold = useMutation({
    mutationFn: () =>
      api<Detail>(`/admin/orders/${order.id}/hold`, {
        method: "POST",
        body: { reason, ...(reviewOn ? { reviewOn } : {}), ...(note.trim() ? { note: note.trim() } : {}) },
      }),
    onSuccess: onDone,
  });
  return (
    <Dialog title={`Put ${order.orderNumber} on hold?`} onClose={onClose}>
      <p className="t-body-s">
        Production and dispatch pause until the hold is released. The order stays visible with an On hold tag.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          hold.mutate();
        }}
      >
        <div className="field">
          <label htmlFor="hold-reason">Reason</label>
          <select id="hold-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {HOLD_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="hold-review">Review on</label>
          <input id="hold-review" type="date" value={reviewOn} onChange={(e) => setReviewOn(e.target.value)} />
          <span className="hint">Shown on the order so the team knows when to look again.</span>
        </div>
        <div className="field">
          <label htmlFor="hold-note">Internal note</label>
          <textarea
            id="hold-note"
            maxLength={1000}
            placeholder="e.g. Customer asked to confirm the sticker colour before we print."
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <label className="check">
          <input type="checkbox" disabled />
          <span>
            Notify the customer by SMS <span className="hint">· available once an SMS provider is set up (D-25)</span>
          </span>
        </label>
        {hold.error ? <p className="alert alert-error">{errText(hold.error)}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={hold.isPending}>
            Put on hold
          </button>
        </div>
      </form>
    </Dialog>
  );
}

const CANCEL_REASONS = ["Customer request", "Duplicate order", "Can't be produced", "Payment issue", "Other"];

function CancelDialog({
  order,
  onClose,
  onDone,
}: {
  order: Detail;
  onClose: () => void;
  onDone: (d: Detail, text: string) => void;
}) {
  const active = order.items.filter((i) => i.status === "ACTIVE");
  const [selected, setSelected] = useState<string[]>(active.map((i) => i.id));
  const [reason, setReason] = useState(CANCEL_REASONS[0]);
  const [note, setNote] = useState("");
  const chosen = active.filter((i) => selected.includes(i.id));
  const everything = chosen.length === active.length;
  const paid = order.payment === "PAID" || order.payment === "REFUND_REQUESTED";
  const refund = chosen.reduce((sum, i) => sum + Number(i.lineTotal), 0);
  const cancel = useMutation({
    mutationFn: () =>
      api<Detail>(`/admin/orders/${order.id}/cancel`, {
        method: "POST",
        body: {
          reason,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(everything ? {} : { itemIds: selected }),
        },
      }),
    onSuccess: (d) =>
      onDone(
        d,
        `${everything ? "Order cancelled" : "Items cancelled"}${paid ? ` — refund of ${rupees(refund.toFixed(2))} requested for the Payments team` : ""}.`,
      ),
  });

  return (
    <Dialog title={`Cancel ${everything ? "" : "items on "}${order.orderNumber}?`} onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          cancel.mutate();
        }}
      >
        {active.length > 1 ? (
          <fieldset className="field">
            <legend className="label">Items to cancel</legend>
            {active.map((i) => (
              <label key={i.id} className="check">
                <input
                  type="checkbox"
                  checked={selected.includes(i.id)}
                  onChange={(e) =>
                    setSelected(e.target.checked ? [...selected, i.id] : selected.filter((x) => x !== i.id))
                  }
                />
                <span>
                  {i.productName} × {i.quantity.toLocaleString("en-IN")} — {rupees(i.lineTotal)}
                </span>
              </label>
            ))}
          </fieldset>
        ) : null}
        <div className="field">
          <label htmlFor="cancel-reason">Reason</label>
          <select id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)}>
            {CANCEL_REASONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </div>
        {paid ? (
          <dl className="summary">
            {chosen.map((i) => (
              <div key={i.id} style={{ display: "contents" }}>
                <dt>
                  {i.productName} × {i.quantity.toLocaleString("en-IN")} (incl. GST {Number(i.gstRate)}%)
                </dt>
                <dd>{rupees(i.lineTotal)}</dd>
              </div>
            ))}
            <dt>Refund to original payment method</dt>
            <dd>{rupees(refund.toFixed(2))}</dd>
          </dl>
        ) : (
          <p className="t-body-s muted">Nothing has been paid on this order, so no refund is needed.</p>
        )}
        <div className="field">
          <label htmlFor="cancel-note">Internal note</label>
          <textarea id="cancel-note" maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <label className="check">
          <input type="checkbox" disabled />
          <span>
            Notify the customer by SMS <span className="hint">· available once an SMS provider is set up (D-25)</span>
          </span>
        </label>
        <p className="alert alert-info">You'll confirm this cancellation with your authenticator code.</p>
        {cancel.error ? <p className="alert alert-error">{errText(cancel.error)}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Keep order
          </button>
          <button type="submit" className="btn btn-danger" disabled={cancel.isPending || !chosen.length}>
            {paid ? "Cancel & request refund" : "Cancel"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
