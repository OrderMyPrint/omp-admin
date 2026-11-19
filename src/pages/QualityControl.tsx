import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { errText } from "../lib/catalogue";
import { useSession } from "../lib/session";
import { Dialog } from "./CatalogueStructure";
import type { ChecklistItem, Job } from "./Production";

type Queue = { jobs: Job[]; checklist: ChecklistItem[] };

/** AD-QC-01 / 01b · Quality control. */
export function QualityControl() {
  const { can } = useSession();
  const client = useQueryClient();
  const queue = useQuery({ queryKey: ["qc"], queryFn: () => api<Queue>("/admin/production/qc") });
  const [selected, setSelected] = useState<string | null>(null);
  const [ticks, setTicks] = useState<Record<string, boolean>>({});
  const [notes, setNotes] = useState("");
  const [failing, setFailing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const jobs = queue.data?.jobs ?? [];
  const job = jobs.find((j) => j.id === selected) ?? jobs[0] ?? null;
  const checklist = queue.data?.checklist ?? [];
  const canQc = can("qc.write");

  useEffect(() => {
    setTicks({});
    setNotes("");
  }, [job?.id]);

  const decide = useMutation({
    mutationFn: (result: "PASS" | "FAIL") =>
      api<Job>(`/admin/production/jobs/${job!.id}/qc`, {
        method: "POST",
        body: { result, checklist: ticks, ...(notes.trim() ? { notes: notes.trim() } : {}) },
      }),
    onSuccess: (data, result) => {
      setNotice(
        result === "PASS"
          ? `Job ${data.number} passed — it's ready to dispatch.`
          : `Job ${data.number} sent back to printing.`,
      );
      setFailing(false);
      setSelected(null);
      void client.invalidateQueries({ queryKey: ["qc"] });
      void client.invalidateQueries({ queryKey: ["production"] });
    },
  });
  const allTicked = checklist.length > 0 && checklist.every((c) => ticks[c.key]);

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Quality control</h1>
          <p className="t-body-s muted">
            Jobs arrive here from Finishing. Pass sends the job to Done; fail sends it back to printing with your note.
          </p>
        </div>
      </div>
      {queue.error ? <p className="alert alert-error">{errText(queue.error)}</p> : null}
      {notice ? <p className="alert alert-success">{notice}</p> : null}
      {!jobs.length && queue.data ? (
        <p className="empty">No jobs are waiting for a quality check.</p>
      ) : (
        <div className="layout-split" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.6fr)" }}>
          <ul className="pick-list">
            {jobs.map((j) => (
              <li key={j.id}>
                <button
                  type="button"
                  className="pick"
                  aria-current={job?.id === j.id}
                  onClick={() => setSelected(j.id)}
                >
                  <span>
                    <strong>
                      {j.number} · {j.product} ×{j.quantity.toLocaleString("en-IN")}
                    </strong>
                    <span className="t-body-xs muted">
                      Order {j.order.number} · {j.order.customer}
                    </span>
                  </span>
                  {j.qcFailCount ? <span className="badge badge-warning">Failed ×{j.qcFailCount}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          {job ? (
            <section className="card stack">
              <h2 className="t-h5">
                QC · {job.number} · {job.product} ×{job.quantity.toLocaleString("en-IN")}
              </h2>
              <p className="t-body-s muted">{job.spec}</p>
              {job.order.onHold ? (
                <p className="alert alert-info">The order is on hold. Quality control is paused until it’s released.</p>
              ) : null}
              {job.qcNotes ? <p className="alert alert-info">Last check: {job.qcNotes}</p> : null}
              <fieldset className="choice stack" disabled={!canQc || job.order.onHold}>
                <legend className="t-label-m">Checklist</legend>
                {checklist.map((c) => (
                  <label key={c.key} className="check">
                    <input
                      type="checkbox"
                      checked={!!ticks[c.key]}
                      onChange={(e) => setTicks({ ...ticks, [c.key]: e.target.checked })}
                    />{" "}
                    {c.label}
                  </label>
                ))}
              </fieldset>
              <p className="t-body-xs muted">
                This is a general checklist. Product-specific checklists can be added once the business supplies them.
              </p>
              <div className="field">
                <label htmlFor="qc-notes">Notes</label>
                <textarea
                  id="qc-notes"
                  rows={3}
                  value={notes}
                  disabled={!canQc}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
              {decide.error && !failing ? <p className="alert alert-error">{errText(decide.error)}</p> : null}
              {canQc ? (
                <div className="row">
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={decide.isPending || job.order.onHold}
                    onClick={() => setFailing(true)}
                  >
                    Fail → back to production
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!allTicked || decide.isPending || job.order.onHold}
                    onClick={() => decide.mutate("PASS")}
                  >
                    Pass → ready to dispatch
                  </button>
                </div>
              ) : (
                <p className="t-body-xs muted">Passing or failing a job needs the qc.write permission.</p>
              )}
            </section>
          ) : null}
        </div>
      )}
      {failing && job ? (
        <Dialog title={`Send ${job.number} back to production?`} onClose={() => setFailing(false)}>
          <div className="stack">
            <p className="t-body-s">
              The job returns to Printing. Production sees your note on the job card, and the order’s activity log
              records the failed check.
            </p>
            <div className="field">
              <label htmlFor="qc-fail-notes">What went wrong?</label>
              <textarea id="qc-fail-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {decide.error ? <p className="alert alert-error">{errText(decide.error)}</p> : null}
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setFailing(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                disabled={notes.trim().length < 5 || decide.isPending}
                onClick={() => decide.mutate("FAIL")}
              >
                Send back
              </button>
            </div>
          </div>
        </Dialog>
      ) : null}
    </>
  );
}
