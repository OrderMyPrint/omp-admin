import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../lib/api";
import { dateText, dateTimeText, errText } from "../lib/catalogue";
import { useSession } from "../lib/session";
import { Dialog } from "./CatalogueStructure";

type JobStatus = "QUEUED" | "PRINTING" | "FINISHING" | "QUALITY_CHECK" | "DONE";
type OrderRef = { id: string; number: string; onHold: boolean; customer: string };
export type Job = {
  id: string;
  number: string;
  status: JobStatus;
  station: string | null;
  dueOn: string | null;
  onCredit: boolean;
  artworkNote: string | null;
  qcFailCount: number;
  qcNotes: string | null;
  qcPassedAt: string | null;
  createdAt: string;
  updatedAt: string;
  nextStatuses: JobStatus[];
  product: string;
  quantity: number;
  spec: string;
  order: OrderRef;
};
type Startable = {
  orderItemId: string;
  product: string;
  quantity: number;
  spec: string;
  onCredit: boolean;
  order: OrderRef & { paidAt: string | null };
};
export type ChecklistItem = { key: string; label: string };
type Board = { startable: Startable[]; jobs: Job[]; checklist: ChecklistItem[] };

const STAGES: [JobStatus, string][] = [
  ["QUEUED", "Queued"],
  ["PRINTING", "Printing"],
  ["FINISHING", "Finishing"],
  ["QUALITY_CHECK", "Quality check"],
  ["DONE", "Done"],
];
export const STAGE_TEXT = Object.fromEntries(STAGES) as Record<JobStatus, string>;
const overdue = (job: Job) =>
  !!job.dueOn && job.status !== "DONE" && new Date(job.dueOn) < new Date(new Date().toDateString());

/** AD-PRD-01 / 02 · Production board and job card. */
export function Production() {
  const { can } = useSession();
  const client = useQueryClient();
  const board = useQuery({ queryKey: ["production"], queryFn: () => api<Board>("/admin/production") });
  const [starting, setStarting] = useState<Startable | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const canWrite = can("production.write");
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["production"] });
    void client.invalidateQueries({ queryKey: ["qc"] });
  };
  const move = useMutation({
    mutationFn: ({ id, status }: { id: string; status: JobStatus }) =>
      api<Job>(`/admin/production/jobs/${id}/move`, { method: "POST", body: { status } }),
    onSettled: refresh,
  });
  const jobs = board.data?.jobs ?? [];
  const current = jobs.find((j) => j.id === open) ?? null;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Production</h1>
          <p className="t-body-s muted">
            A job starts once the order is paid (or its company has credit terms) and the artwork has been checked. Drag
            a card to the next stage; quality control passes it to Done.
          </p>
        </div>
      </div>
      {board.error ? <p className="alert alert-error">{errText(board.error)}</p> : null}
      {move.error ? <p className="alert alert-error">{errText(move.error)}</p> : null}

      <section className="card stack">
        <h2 className="t-h5">Ready to start ({board.data?.startable.length ?? 0})</h2>
        {board.data?.startable.length ? (
          <table className="table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Item</th>
                <th className="num">Qty</th>
                <th>Payment</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {board.data.startable.map((s) => (
                <tr key={s.orderItemId}>
                  <td>
                    <a className="link" href={`/orders?order=${s.order.id}`}>
                      {s.order.number}
                    </a>
                    <div className="t-body-xs muted">{s.order.customer}</div>
                  </td>
                  <td>
                    <strong>{s.product}</strong>
                    <div className="t-body-xs muted">{s.spec}</div>
                  </td>
                  <td className="num">{s.quantity.toLocaleString("en-IN")}</td>
                  <td>
                    {s.onCredit ? (
                      <span className="badge badge-warning">Unpaid · credit terms</span>
                    ) : (
                      <span className="badge badge-success">Paid</span>
                    )}
                    {s.order.onHold ? <span className="badge badge-warning">On hold</span> : null}
                  </td>
                  <td className="num">
                    {canWrite ? (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        disabled={s.order.onHold}
                        onClick={() => setStarting(s)}
                      >
                        Start job
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="t-body-s muted">Nothing is waiting to start. Paid order items appear here.</p>
        )}
        <p className="t-body-xs muted">
          Artwork review inside the admin arrives with file storage (D-05). Until then, check the artwork outside the
          system and confirm it when you start the job.
        </p>
      </section>

      <div className="kanban">
        {STAGES.map(([status, text]) => {
          const items = jobs.filter((j) => j.status === status);
          return (
            <section
              key={status}
              className="kanban-col"
              aria-label={text}
              onDragOver={(e) => dragging && e.preventDefault()}
              onDrop={() => {
                const job = jobs.find((j) => j.id === dragging);
                if (job && job.status !== status) move.mutate({ id: job.id, status });
                setDragging(null);
              }}
            >
              <h2 className="t-label-m">
                {text} ({items.length})
              </h2>
              <ul>
                {items.map((j) => (
                  <li key={j.id}>
                    <button
                      type="button"
                      className="kanban-card"
                      draggable={canWrite && !j.order.onHold}
                      onDragStart={() => setDragging(j.id)}
                      onDragEnd={() => setDragging(null)}
                      onClick={() => setOpen(j.id)}
                    >
                      <span className="row" style={{ justifyContent: "space-between" }}>
                        <span className="t-body-xs muted mono">{j.number}</span>
                        {j.order.onHold ? (
                          <span className="badge badge-warning">On hold</span>
                        ) : overdue(j) ? (
                          <span className="badge badge-warning">Overdue</span>
                        ) : j.qcFailCount && j.status !== "DONE" ? (
                          <span className="badge badge-warning">QC failed ×{j.qcFailCount}</span>
                        ) : j.station ? (
                          <span className="badge">{j.station}</span>
                        ) : null}
                      </span>
                      <strong className="t-label-l">
                        {j.product} ×{j.quantity.toLocaleString("en-IN")}
                      </strong>
                      <span className="t-body-xs muted">{j.spec}</span>
                      <span className="t-body-xs muted">
                        {j.status === "DONE"
                          ? `Done ${dateText(j.qcPassedAt)}`
                          : j.dueOn
                            ? `Due ${dateText(j.dueOn)}`
                            : ""}
                      </span>
                      <strong className="t-body-xs">Order {j.order.number}</strong>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {starting ? (
        <StartJob
          item={starting}
          onClose={() => setStarting(null)}
          onStarted={() => {
            setStarting(null);
            refresh();
          }}
        />
      ) : null}
      {current ? (
        <JobCard
          job={current}
          canWrite={canWrite}
          busy={move.isPending}
          onMove={(status) => move.mutate({ id: current.id, status })}
          onClose={() => setOpen(null)}
        />
      ) : null}
    </>
  );
}

function StartJob({ item, onClose, onStarted }: { item: Startable; onClose: () => void; onStarted: () => void }) {
  const [form, setForm] = useState({ artworkChecked: false, artworkNote: "", dueOn: "", station: "" });
  const start = useMutation({
    mutationFn: () =>
      api<Job>("/admin/production/jobs", {
        method: "POST",
        body: {
          orderItemId: item.orderItemId,
          artworkChecked: form.artworkChecked,
          ...(form.artworkNote.trim() ? { artworkNote: form.artworkNote.trim() } : {}),
          ...(form.dueOn ? { dueOn: form.dueOn } : {}),
          ...(form.station.trim() ? { station: form.station.trim() } : {}),
        },
      }),
    onSuccess: onStarted,
  });
  return (
    <Dialog title={`Start job · ${item.product}`} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          start.mutate();
        }}
      >
        <dl className="summary">
          <dt>Order</dt>
          <dd>
            {item.order.number} · {item.order.customer}
          </dd>
          <dt>Item</dt>
          <dd>
            {item.quantity.toLocaleString("en-IN")} × {item.product}
          </dd>
          <dt>Options</dt>
          <dd>{item.spec || "—"}</dd>
        </dl>
        {item.onCredit ? (
          <p className="alert alert-info">
            This order isn’t paid. It can start because the customer’s company has approved credit terms.
          </p>
        ) : null}
        <label className="check">
          <input
            type="checkbox"
            checked={form.artworkChecked}
            onChange={(e) => setForm({ ...form, artworkChecked: e.target.checked })}
          />{" "}
          I confirm the artwork for this item has been checked and approved by the customer
        </label>
        <div className="field">
          <label htmlFor="sj-note">Artwork note (optional)</label>
          <input
            id="sj-note"
            maxLength={500}
            placeholder="Where the approved file is, who approved it"
            value={form.artworkNote}
            onChange={(e) => setForm({ ...form, artworkNote: e.target.value })}
          />
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="sj-due">Due date (optional)</label>
            <input
              id="sj-due"
              type="date"
              value={form.dueOn}
              onChange={(e) => setForm({ ...form, dueOn: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="sj-station">Machine / station (optional)</label>
            <input
              id="sj-station"
              maxLength={60}
              value={form.station}
              onChange={(e) => setForm({ ...form, station: e.target.value })}
            />
          </div>
        </div>
        {start.error ? <p className="alert alert-error">{errText(start.error)}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={!form.artworkChecked || start.isPending}>
            Start job
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/** AD-PRD-02 · Job card, with a print view for the shop floor. */
function JobCard({
  job,
  canWrite,
  busy,
  onMove,
  onClose,
}: {
  job: Job;
  canWrite: boolean;
  busy: boolean;
  onMove: (status: JobStatus) => void;
  onClose: () => void;
}) {
  return (
    <Dialog title={`Job ${job.number}`} onClose={onClose} wide>
      <div className="stack job-card">
        <dl className="summary">
          <dt>Product</dt>
          <dd>
            {job.quantity.toLocaleString("en-IN")} × {job.product}
          </dd>
          <dt>Options</dt>
          <dd>{job.spec || "—"}</dd>
          <dt>Order</dt>
          <dd>
            {job.order.number} · {job.order.customer}
          </dd>
          <dt>Stage</dt>
          <dd>
            {STAGE_TEXT[job.status]}
            {job.station ? ` · ${job.station}` : ""}
          </dd>
          <dt>Due</dt>
          <dd>{dateText(job.dueOn)}</dd>
          <dt>Artwork</dt>
          <dd>Confirmed at start{job.artworkNote ? ` — ${job.artworkNote}` : ""}</dd>
          <dt>Started</dt>
          <dd>{dateTimeText(job.createdAt)}</dd>
          {job.onCredit ? (
            <>
              <dt>Payment</dt>
              <dd>Unpaid · on credit terms</dd>
            </>
          ) : null}
          {job.qcNotes ? (
            <>
              <dt>QC note</dt>
              <dd>{job.qcNotes}</dd>
            </>
          ) : null}
        </dl>
        {job.order.onHold ? (
          <p className="alert alert-info">The order is on hold, so this job is paused until it’s released.</p>
        ) : null}
        <div className="row no-print" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn-secondary" onClick={() => window.print()}>
            Print job card
          </button>
          <div className="row">
            {canWrite
              ? job.nextStatuses.map((s) => (
                  <button key={s} type="button" className="btn btn-primary" disabled={busy} onClick={() => onMove(s)}>
                    Move to {STAGE_TEXT[s].toLowerCase()}
                  </button>
                ))
              : null}
            {job.status === "QUALITY_CHECK" ? (
              <a className="btn btn-primary" href="/qc">
                Open quality control
              </a>
            ) : null}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
