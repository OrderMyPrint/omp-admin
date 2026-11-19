import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { dateText, errText } from "../lib/catalogue";
import { useSession } from "../lib/session";
import { Dialog } from "./CatalogueStructure";

type Status = "PACKED" | "DISPATCHED" | "DELIVERED";
type Address = { name: string; line1: string; line2?: string; city: string; state: string; pincode: string };
type Shipment = {
  id: string;
  number: string;
  status: Status;
  carrier: string | null;
  awb: string | null;
  trackingUrl: string | null;
  notes: string | null;
  createdAt: string;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  order: { id: string; number: string; customer: string; shippingAddress: Address };
  items: { orderItemId: string; product: string; quantity: number; ordered: number }[];
};
type ReadyOrder = {
  id: string;
  number: string;
  onHold: boolean;
  customer: string;
  shippingAddress: Address;
  items: { orderItemId: string; product: string; ordered: number; shipped: number; done: boolean; available: number }[];
};
type List = { shipments: Shipment[]; carriers: string[] };

const BADGE: Record<Status, [string, string]> = {
  PACKED: ["badge badge-warning", "Packed · not sent"],
  DISPATCHED: ["badge badge-info", "In transit"],
  DELIVERED: ["badge badge-success", "Delivered"],
};
const addressText = (a: Address) =>
  [a.name, a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).join(", ");

/** AD-SHP-01 / 02 / 02b · Shipments. */
export function Shipments() {
  const { can } = useSession();
  const client = useQueryClient();
  const list = useQuery({ queryKey: ["shipments"], queryFn: () => api<List>("/admin/shipments") });
  const ready = useQuery({ queryKey: ["shipments-ready"], queryFn: () => api<ReadyOrder[]>("/admin/shipments/ready") });
  const [creating, setCreating] = useState<ReadyOrder | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const canWrite = can("shipments.write");
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["shipments"] });
    void client.invalidateQueries({ queryKey: ["shipments-ready"] });
  };
  const shipments = list.data?.shipments ?? [];
  const current = shipments.find((s) => s.id === open) ?? null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Shipments</h1>
          <p className="t-body-s muted">
            Book the courier yourself and enter the AWB here. An order can go in more than one shipment.
          </p>
        </div>
      </div>
      {list.error ? <p className="alert alert-error">{errText(list.error)}</p> : null}

      <section className="card stack">
        <h2 className="t-h5">Ready to pack ({ready.data?.length ?? 0})</h2>
        {ready.data?.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Passed quality control, not shipped</th>
                <th>Deliver to</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {ready.data.map((o) => (
                <tr key={o.id}>
                  <td>
                    <a className="link" href={`/orders?order=${o.id}`}>
                      {o.number}
                    </a>
                    <div className="t-body-xs muted">{o.customer}</div>
                  </td>
                  <td>
                    {o.items
                      .filter((i) => i.available > 0)
                      .map((i) => (
                        <div key={i.orderItemId}>
                          {i.available.toLocaleString("en-IN")} × {i.product}
                          {i.shipped ? (
                            <span className="muted"> ({i.shipped.toLocaleString("en-IN")} already packed)</span>
                          ) : null}
                        </div>
                      ))}
                    {o.items.some((i) => !i.done) ? (
                      <div className="t-body-xs muted">Other items are still in production.</div>
                    ) : null}
                  </td>
                  <td className="t-body-s">{addressText(o.shippingAddress)}</td>
                  <td className="num">
                    {o.onHold ? (
                      <span className="badge badge-warning">On hold</span>
                    ) : canWrite ? (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreating(o)}>
                        <Plus size={16} aria-hidden="true" /> Create shipment
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="t-body-s muted">Nothing to pack. Items appear here once they pass quality control.</p>
        )}
      </section>

      <table className="table">
        <thead>
          <tr>
            <th>Shipment</th>
            <th>Order / items</th>
            <th>Courier</th>
            <th>AWB</th>
            <th>Status</th>
            <th>Dispatched</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr key={s.id}>
              <td>
                <button type="button" className="link" onClick={() => setOpen(s.id)}>
                  <strong>{s.number}</strong>
                </button>
              </td>
              <td>
                {s.order.number} · {s.items.map((i) => `${i.quantity.toLocaleString("en-IN")} ${i.product}`).join(", ")}
              </td>
              <td>{s.carrier ?? "—"}</td>
              <td className="mono">{s.awb ?? "—"}</td>
              <td>
                <span className={BADGE[s.status][0]}>{BADGE[s.status][1]}</span>
              </td>
              <td>{dateText(s.dispatchedAt)}</td>
            </tr>
          ))}
          {list.data && !shipments.length ? (
            <tr>
              <td colSpan={6} className="muted">
                No shipments yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {creating ? (
        <CreateShipment
          order={creating}
          carriers={list.data?.carriers ?? []}
          onClose={() => setCreating(null)}
          onCreated={(s) => {
            setCreating(null);
            refresh();
            setOpen(s.id);
          }}
        />
      ) : null}
      {current ? (
        <ShipmentDialog
          shipment={current}
          carriers={list.data?.carriers ?? []}
          canWrite={canWrite}
          onChanged={refresh}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function CarrierFields({
  value,
  carriers,
  disabled,
  onChange,
}: {
  value: { carrier: string; awb: string };
  carriers: string[];
  disabled?: boolean;
  onChange: (v: { carrier: string; awb: string }) => void;
}) {
  return (
    <div className="grid-2">
      <div className="field">
        <label htmlFor="sh-carrier">Courier</label>
        <input
          id="sh-carrier"
          list="sh-carriers"
          maxLength={60}
          value={value.carrier}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, carrier: e.target.value })}
        />
        <datalist id="sh-carriers">
          {carriers.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      <div className="field">
        <label htmlFor="sh-awb">AWB / tracking number</label>
        <input
          id="sh-awb"
          className="mono"
          maxLength={60}
          value={value.awb}
          disabled={disabled}
          onChange={(e) => onChange({ ...value, awb: e.target.value })}
        />
      </div>
    </div>
  );
}

/** AD-SHP-02 · Create shipment (all or part of what's ready). */
function CreateShipment({
  order,
  carriers,
  onClose,
  onCreated,
}: {
  order: ReadyOrder;
  carriers: string[];
  onClose: () => void;
  onCreated: (s: Shipment) => void;
}) {
  const available = order.items.filter((i) => i.available > 0);
  const [qty, setQty] = useState<Record<string, string>>(
    Object.fromEntries(available.map((i) => [i.orderItemId, String(i.available)])),
  );
  const [courier, setCourier] = useState({ carrier: "", awb: "" });
  const items = available
    .map((i) => ({ orderItemId: i.orderItemId, quantity: Number(qty[i.orderItemId]) || 0 }))
    .filter((i) => i.quantity > 0);
  const create = useMutation({
    mutationFn: () =>
      api<Shipment>("/admin/shipments", {
        method: "POST",
        body: {
          orderId: order.id,
          items,
          ...(courier.carrier.trim() ? { carrier: courier.carrier.trim() } : {}),
          ...(courier.awb.trim() ? { awb: courier.awb.trim() } : {}),
        },
      }),
    onSuccess: onCreated,
  });
  return (
    <Dialog title={`Create shipment · ${order.number}`} onClose={onClose} wide>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <p className="t-body-s">Deliver to: {addressText(order.shippingAddress)}</p>
        <table className="table">
          <thead>
            <tr>
              <th>Item</th>
              <th className="num">Ready</th>
              <th className="num">In this shipment</th>
            </tr>
          </thead>
          <tbody>
            {available.map((i) => (
              <tr key={i.orderItemId}>
                <td>{i.product}</td>
                <td className="num">{i.available.toLocaleString("en-IN")}</td>
                <td className="num">
                  <input
                    className="cell-input num"
                    aria-label={`Quantity of ${i.product} in this shipment`}
                    inputMode="numeric"
                    value={qty[i.orderItemId] ?? ""}
                    onChange={(e) => setQty({ ...qty, [i.orderItemId]: e.target.value.replace(/\D/g, "") })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <CarrierFields value={courier} carriers={carriers} onChange={setCourier} />
        <p className="t-body-xs muted">You can add the courier and AWB later, before marking it dispatched.</p>
        {create.error ? <p className="alert alert-error">{errText(create.error)}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!items.length || create.isPending}>
            Create shipment
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** Shipment detail with the dispatch confirmation (AD-SHP-02b). */
function ShipmentDialog({
  shipment: s,
  carriers,
  canWrite,
  onChanged,
  onClose,
}: {
  shipment: Shipment;
  carriers: string[];
  canWrite: boolean;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [courier, setCourier] = useState({ carrier: s.carrier ?? "", awb: s.awb ?? "" });
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setCourier({ carrier: s.carrier ?? "", awb: s.awb ?? "" }), [s.id, s.carrier, s.awb]);
  const call = (path: string, method: string, body?: object) =>
    api(`/admin/shipments/${s.id}${path}`, { method, body });
  const save = useMutation({
    mutationFn: () => call("", "PATCH", { carrier: courier.carrier.trim() || null, awb: courier.awb.trim() || null }),
    onSuccess: onChanged,
  });
  const dispatch = useMutation({
    mutationFn: async () => {
      if (courier.carrier !== (s.carrier ?? "") || courier.awb !== (s.awb ?? ""))
        await call("", "PATCH", { carrier: courier.carrier.trim() || null, awb: courier.awb.trim() || null });
      return call("/dispatch", "POST");
    },
    onSuccess: () => {
      setConfirming(false);
      onChanged();
    },
  });
  const deliver = useMutation({ mutationFn: () => call("/deliver", "POST"), onSuccess: onChanged });
  const remove = useMutation({
    mutationFn: () => call("", "DELETE"),
    onSuccess: () => {
      onChanged();
      onClose();
    },
  });
  const error = save.error ?? dispatch.error ?? deliver.error ?? remove.error;
  const packed = s.status === "PACKED";
  return (
    <Dialog title={`Shipment ${s.number}`} onClose={onClose} wide>
      <div className="stack">
        <dl className="summary">
          <dt>Order</dt>
          <dd>
            {s.order.number} · {s.order.customer}
          </dd>
          <dt>Items</dt>
          <dd>
            {s.items
              .map((i) => `${i.quantity.toLocaleString("en-IN")} of ${i.ordered.toLocaleString("en-IN")} ${i.product}`)
              .join("; ")}
          </dd>
          <dt>Deliver to</dt>
          <dd>{addressText(s.order.shippingAddress)}</dd>
          <dt>Status</dt>
          <dd>
            {BADGE[s.status][1]}
            {s.dispatchedAt ? ` · dispatched ${dateText(s.dispatchedAt)}` : ""}
            {s.deliveredAt ? ` · delivered ${dateText(s.deliveredAt)}` : ""}
          </dd>
        </dl>
        <CarrierFields
          value={courier}
          carriers={carriers}
          disabled={!canWrite || s.status === "DELIVERED"}
          onChange={setCourier}
        />
        {error ? <p className="alert alert-error">{errText(error)}</p> : null}
        {confirming ? (
          <div className="alert alert-info stack">
            <strong>
              Mark {s.number} as dispatched with {courier.carrier || "—"} · AWB {courier.awb || "—"}?
            </strong>
            <span>
              This can’t be undone. The customer isn’t notified automatically yet (needs an SMS / email provider, D-25).
            </span>
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setConfirming(false)}>
                Not yet
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={dispatch.isPending}
                onClick={() => dispatch.mutate()}
              >
                Yes, it has left
              </button>
            </div>
          </div>
        ) : canWrite ? (
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div className="row">
              {packed ? (
                <button
                  type="button"
                  className="btn btn-ghost"
                  disabled={remove.isPending}
                  onClick={() =>
                    confirm(`Remove ${s.number}? Its items go back to "Ready to pack".`) && remove.mutate()
                  }
                >
                  Remove shipment
                </button>
              ) : null}
            </div>
            <div className="row">
              {s.status !== "DELIVERED" ? (
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={save.isPending}
                  onClick={() => save.mutate()}
                >
                  Save courier details
                </button>
              ) : null}
              {packed ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!courier.carrier.trim() || !courier.awb.trim()}
                  onClick={() => setConfirming(true)}
                >
                  Mark as dispatched
                </button>
              ) : null}
              {s.status === "DISPATCHED" ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={deliver.isPending}
                  onClick={() => deliver.mutate()}
                >
                  Mark as delivered
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
