import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { dateTimeText, errText, rupees } from "../lib/catalogue";
import { useSession } from "../lib/session";
import { Dialog } from "./CatalogueStructure";

type PaymentStatus = "CREATED" | "CAPTURED" | "FAILED";
type RefundStatus = "REQUESTED" | "APPROVED" | "PROCESSED" | "REJECTED";
type Payment = {
  id: string;
  provider: string;
  providerRef: string;
  amount: string;
  status: PaymentStatus;
  method: string | null;
  createdAt: string;
  capturedAt: string | null;
  refunded: string;
  refundPending: boolean;
  lastEvent: { kind: string; verified: boolean; outcome: string; receivedAt: string } | null;
  order: { id: string; number: string; customer: string };
};
type Refund = {
  id: string;
  amount: string;
  reason: string;
  status: RefundStatus;
  createdAt: string;
  requestedBy: { id: string; name: string } | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
  processedBy: string | null;
  processedAt: string | null;
  method: string | null;
  reference: string | null;
  paid: string;
  full: boolean;
  payment: { provider: string; providerRef: string; amount: string; method: string | null } | null;
  order: { id: string; number: string; status: string; customer: string };
};
type GatewayEvent = {
  id: string;
  provider: string;
  kind: string;
  providerRef: string | null;
  amount: string | null;
  verified: boolean;
  outcome: string;
  receivedAt: string;
};

const PAYMENT_BADGE: Record<PaymentStatus, [string, string]> = {
  CREATED: ["badge badge-warning", "Pending"],
  CAPTURED: ["badge badge-success", "Captured"],
  FAILED: ["badge", "Failed"],
};
const REFUND_BADGE: Record<RefundStatus, [string, string]> = {
  REQUESTED: ["badge badge-warning", "Waiting for approval"],
  APPROVED: ["badge badge-info", "Approved · to pay back"],
  PROCESSED: ["badge badge-success", "Refunded"],
  REJECTED: ["badge", "Rejected"],
};
const minutesSince = (iso: string) => Math.round((Date.now() - new Date(iso).getTime()) / 60000);

/** AD-PAY-01 / 02 / 02b · Payments & refunds. */
export function Payments() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") ?? "payments") as "payments" | "refunds" | "events";
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Payments & refunds</h1>
          <p className="t-body-s muted">
            A payment’s status changes only on a verified gateway event — never because a customer came back from the
            payment page.
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ["payments", "Payments"],
            ["refunds", "Refunds"],
            ["events", "Gateway events"],
          ] as const
        ).map(([id, text]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === id}
            onClick={() => setParams(id === "payments" ? {} : { tab: id })}
          >
            {text}
          </button>
        ))}
      </div>
      {tab === "payments" ? <PaymentList /> : tab === "refunds" ? <RefundList /> : <EventList />}
    </>
  );
}

function PaymentList() {
  const { can } = useSession();
  const [status, setStatus] = useState<"" | PaymentStatus>("");
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [requesting, setRequesting] = useState<Payment | null>(null);
  const query = new URLSearchParams({ ...(status ? { status } : {}), ...(search ? { q: search } : {}) }).toString();
  const list = useQuery({ queryKey: ["payments", query], queryFn: () => api<Payment[]>(`/admin/payments?${query}`) });
  return (
    <>
      <p className="alert alert-info">
        No payment gateway is connected yet (D-06). Until it is, payments here come from local testing only.
      </p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-end" }}>
        <div className="chips" role="group" aria-label="Filter by status">
          {(
            [
              ["", "All"],
              ["CAPTURED", "Captured"],
              ["CREATED", "Pending"],
              ["FAILED", "Failed"],
            ] as const
          ).map(([value, text]) => (
            <button
              key={text}
              type="button"
              className="chip"
              aria-pressed={status === value}
              onClick={() => setStatus(value)}
            >
              {text}
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
          <label htmlFor="pay-search" className="visually-hidden">
            Search payments
          </label>
          <div className="input-icon">
            <Search size={18} aria-hidden="true" />
            <input
              id="pay-search"
              placeholder="Payment or order number"
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
            <th>Payment</th>
            <th>Order</th>
            <th className="num">Amount</th>
            <th>Last event</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((p) => (
            <tr key={p.id}>
              <td className="mono">{p.providerRef}</td>
              <td>
                <a className="link" href={`/orders?order=${p.order.id}`}>
                  {p.order.number}
                </a>
                <div className="t-body-xs muted">{p.order.customer}</div>
              </td>
              <td className="num">
                {rupees(p.amount)}
                {Number(p.refunded) ? <div className="t-body-xs muted">{rupees(p.refunded)} refunded</div> : null}
              </td>
              <td className="t-body-s">
                {p.lastEvent
                  ? `${p.lastEvent.kind}${p.lastEvent.verified ? " · signature ✓" : " · not verified"} · ${dateTimeText(p.lastEvent.receivedAt)}`
                  : p.status === "CREATED"
                    ? `Waiting ${minutesSince(p.createdAt)} min for the gateway`
                    : "—"}
              </td>
              <td>
                <span className={PAYMENT_BADGE[p.status][0]}>{PAYMENT_BADGE[p.status][1]}</span>
                {p.refundPending ? <span className="badge badge-warning">Refund pending</span> : null}
              </td>
              <td className="num">
                {p.status === "CAPTURED" && can("refunds.request") ? (
                  <button type="button" className="link" onClick={() => setRequesting(p)}>
                    Request refund
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
          {list.data && !list.data.length ? (
            <tr>
              <td colSpan={6} className="muted">
                {search || status ? "No payments match." : "No payments yet."}
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {requesting ? <RequestRefund payment={requesting} onClose={() => setRequesting(null)} /> : null}
    </>
  );
}

function RequestRefund({ payment, onClose }: { payment: Payment; onClose: () => void }) {
  const client = useQueryClient();
  const [, setParams] = useSearchParams();
  const [form, setForm] = useState({ amount: "", reason: "" });
  const create = useMutation({
    mutationFn: () =>
      api<Refund>("/admin/refunds", {
        method: "POST",
        body: { orderId: payment.order.id, amount: form.amount, reason: form.reason.trim() },
      }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["payments"] });
      void client.invalidateQueries({ queryKey: ["refunds"] });
      onClose();
      setParams({ tab: "refunds" });
    },
  });
  return (
    <Dialog title={`Request refund · ${payment.order.number}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <dl className="summary">
          <dt>Paid</dt>
          <dd>{rupees(payment.amount)}</dd>
          <dt>Already refunded</dt>
          <dd>{rupees(payment.refunded)}</dd>
        </dl>
        <div className="field">
          <label htmlFor="rr-amount">Amount to refund (₹)</label>
          <input
            id="rr-amount"
            inputMode="decimal"
            required
            pattern="\d{1,10}(\.\d{1,2})?"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value.replace(/[^0-9.]/g, "") })}
          />
        </div>
        <div className="field">
          <label htmlFor="rr-reason">Reason</label>
          <textarea
            id="rr-reason"
            rows={3}
            required
            minLength={5}
            maxLength={300}
            value={form.reason}
            onChange={(e) => setForm({ ...form, reason: e.target.value })}
          />
        </div>
        <p className="t-body-xs muted">Someone else with refund approval must approve it before money goes back.</p>
        {create.error ? <p className="alert alert-error">{errText(create.error)}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            Request refund
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function RefundList() {
  const [status, setStatus] = useState<"" | RefundStatus>("REQUESTED");
  const [open, setOpen] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["refunds", status],
    queryFn: () => api<Refund[]>(`/admin/refunds${status ? `?status=${status}` : ""}`),
  });
  const current = list.data?.find((r) => r.id === open) ?? null;
  return (
    <>
      <div className="chips" role="group" aria-label="Filter by status">
        {(
          [
            ["REQUESTED", "Waiting for approval"],
            ["APPROVED", "Approved · to pay back"],
            ["PROCESSED", "Refunded"],
            ["REJECTED", "Rejected"],
            ["", "All"],
          ] as const
        ).map(([value, text]) => (
          <button
            key={text}
            type="button"
            className="chip"
            aria-pressed={status === value}
            onClick={() => setStatus(value)}
          >
            {text}
          </button>
        ))}
      </div>
      {list.error ? <p className="alert alert-error">{errText(list.error)}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Order</th>
            <th className="num">Amount</th>
            <th>Reason</th>
            <th>Requested</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((r) => (
            <tr key={r.id}>
              <td>
                <button type="button" className="link" onClick={() => setOpen(r.id)}>
                  <strong>{r.order.number}</strong>
                </button>
                <div className="t-body-xs muted">{r.order.customer}</div>
              </td>
              <td className="num">
                {rupees(r.amount)}
                <div className="t-body-xs muted">{r.full ? "full" : `of ${rupees(r.paid)}`}</div>
              </td>
              <td className="t-body-s">{r.reason}</td>
              <td className="t-body-s">
                {r.requestedBy?.name ?? "System"} · {dateTimeText(r.createdAt)}
              </td>
              <td>
                <span className={REFUND_BADGE[r.status][0]}>{REFUND_BADGE[r.status][1]}</span>
              </td>
            </tr>
          ))}
          {list.data && !list.data.length ? (
            <tr>
              <td colSpan={5} className="muted">
                No refunds here.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
      {current ? <RefundDialog refund={current} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** AD-PAY-02 refund approval, with reject (02b) and recording the pay-back. */
function RefundDialog({ refund: r, onClose }: { refund: Refund; onClose: () => void }) {
  const { can, me } = useSession();
  const client = useQueryClient();
  const [mode, setMode] = useState<"view" | "reject" | "complete">("view");
  const [reason, setReason] = useState("");
  const [payback, setPayback] = useState({ method: "Original payment method", reference: "" });
  const done = () => {
    void client.invalidateQueries({ queryKey: ["refunds"] });
    void client.invalidateQueries({ queryKey: ["payments"] });
    setMode("view");
  };
  const approve = useMutation({
    mutationFn: () => api<Refund>(`/admin/refunds/${r.id}/approve`, { method: "POST" }),
    onSuccess: done,
  });
  const reject = useMutation({
    mutationFn: () => api<Refund>(`/admin/refunds/${r.id}/reject`, { method: "POST", body: { reason: reason.trim() } }),
    onSuccess: done,
  });
  const complete = useMutation({
    mutationFn: () =>
      api<Refund>(`/admin/refunds/${r.id}/complete`, {
        method: "POST",
        body: { method: payback.method.trim(), reference: payback.reference.trim() },
      }),
    onSuccess: done,
  });
  const error = approve.error ?? reject.error ?? complete.error;
  const canApprove = can("refunds.approve");
  const own = !!r.requestedBy && r.requestedBy.id === me?.id;

  return (
    <Dialog title={`Refund · ${r.order.number}`} onClose={onClose} wide>
      <div className="stack">
        <p className="t-body-s muted">
          Requested by {r.requestedBy?.name ?? "the system"} · {dateTimeText(r.createdAt)} · reason: {r.reason}
        </p>
        <dl className="summary">
          <dt>Paid</dt>
          <dd>{rupees(r.paid)}</dd>
          <dt>Refund amount</dt>
          <dd>
            {rupees(r.amount)} {r.full ? "(full)" : "(part)"}
          </dd>
          <dt>Original payment</dt>
          <dd>{r.payment ? `${r.payment.provider} · ${r.payment.providerRef}` : "—"}</dd>
          <dt>Status</dt>
          <dd>{REFUND_BADGE[r.status][1]}</dd>
          {r.approvedBy ? (
            <>
              <dt>Approved</dt>
              <dd>
                {r.approvedBy} · {dateTimeText(r.approvedAt)}
              </dd>
            </>
          ) : null}
          {r.rejectedBy ? (
            <>
              <dt>Rejected</dt>
              <dd>
                {r.rejectedBy} · {dateTimeText(r.rejectedAt)} · {r.rejectReason}
              </dd>
            </>
          ) : null}
          {r.processedBy ? (
            <>
              <dt>Paid back</dt>
              <dd>
                {r.method} · {r.reference} · {r.processedBy} · {dateTimeText(r.processedAt)}
              </dd>
            </>
          ) : null}
        </dl>
        {error ? <p className="alert alert-error">{errText(error)}</p> : null}

        {r.status === "REQUESTED" ? (
          !canApprove ? (
            <p className="alert alert-info">Approving refunds needs the refunds.approve permission.</p>
          ) : own ? (
            <p className="alert alert-info">You requested this refund, so someone else must approve or reject it.</p>
          ) : mode === "reject" ? (
            <div className="stack">
              <div className="field">
                <label htmlFor="rf-reject">Why is it rejected?</label>
                <textarea id="rf-reject" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setMode("view")}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={reason.trim().length < 5 || reject.isPending}
                  onClick={() => reject.mutate()}
                >
                  Reject refund
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="alert alert-info">
                Approving asks for your authenticator code and is recorded in the audit log.
              </p>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setMode("reject")}>
                  Reject
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={approve.isPending}
                  onClick={() => approve.mutate()}
                >
                  Approve refund
                </button>
              </div>
            </>
          )
        ) : null}

        {r.status === "APPROVED" && canApprove ? (
          mode === "complete" ? (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault();
                complete.mutate();
              }}
            >
              <div className="grid-2">
                <div className="field">
                  <label htmlFor="rf-method">How it was paid back</label>
                  <input
                    id="rf-method"
                    required
                    minLength={2}
                    maxLength={60}
                    list="rf-methods"
                    value={payback.method}
                    onChange={(e) => setPayback({ ...payback, method: e.target.value })}
                  />
                  <datalist id="rf-methods">
                    <option value="Original payment method" />
                    <option value="Bank transfer" />
                  </datalist>
                </div>
                <div className="field">
                  <label htmlFor="rf-ref">Gateway refund id or bank reference (UTR)</label>
                  <input
                    id="rf-ref"
                    className="mono"
                    required
                    minLength={3}
                    maxLength={80}
                    value={payback.reference}
                    onChange={(e) => setPayback({ ...payback, reference: e.target.value })}
                  />
                </div>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setMode("view")}>
                  Back
                </button>
                <button type="submit" className="btn btn-primary" disabled={complete.isPending}>
                  Record as paid back
                </button>
              </div>
            </form>
          ) : (
            <>
              <p className="alert alert-info">
                No payment gateway is connected yet (D-06). Make the refund in the gateway dashboard or by bank
                transfer, then record its reference here.
              </p>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn btn-primary" onClick={() => setMode("complete")}>
                  Record pay-back…
                </button>
              </div>
            </>
          )
        ) : null}
        <p className="t-body-xs muted">Credit notes arrive with invoicing, once GST details are confirmed (D-28).</p>
      </div>
    </Dialog>
  );
}

function EventList() {
  const list = useQuery({ queryKey: ["payment-events"], queryFn: () => api<GatewayEvent[]>("/admin/payments/events") });
  return (
    <>
      <p className="t-body-s muted">
        Every message the API received from a payment gateway. Messages with a missing or wrong signature are kept as
        rejected and never change a payment.
      </p>
      {list.error ? <p className="alert alert-error">{errText(list.error)}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Received</th>
            <th>Gateway</th>
            <th>Event</th>
            <th>Payment</th>
            <th className="num">Amount</th>
            <th>Signature</th>
            <th>Result</th>
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((e) => (
            <tr key={e.id}>
              <td>{dateTimeText(e.receivedAt)}</td>
              <td>{e.provider}</td>
              <td>{e.kind}</td>
              <td className="mono">{e.providerRef ?? "—"}</td>
              <td className="num">{e.amount ? rupees(e.amount) : "—"}</td>
              <td>
                {e.verified ? (
                  <span className="badge badge-success">Verified</span>
                ) : (
                  <span className="badge badge-warning">Not verified</span>
                )}
              </td>
              <td>{e.outcome}</td>
            </tr>
          ))}
          {list.data && !list.data.length ? (
            <tr>
              <td colSpan={7} className="muted">
                No gateway messages yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}
