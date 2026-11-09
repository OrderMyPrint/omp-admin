import { useInfiniteQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

type Entry = {
  id: string;
  at: string;
  action: string;
  actorId: string | null;
  actorKind: string;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
};
type Page = { items: Entry[]; nextCursor: string | null };

/** AD-AUD-01 · Audit log (append-only; newest first). */
export function AuditLog() {
  const query = useInfiniteQuery({
    queryKey: ["audit"],
    queryFn: ({ pageParam }) =>
      api<Page>(`/admin/audit?limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: "",
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((p) => p.items) ?? [];
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Audit log</h1>
          <p className="t-body-s muted">
            Every sign-in, staff, role and content change. Entries can’t be edited or deleted.
          </p>
        </div>
      </div>
      {query.error ? <p className="alert alert-error">{(query.error as Error).message}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>When</th>
            <th>Action</th>
            <th>Target</th>
            <th>By</th>
            <th>IP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id}>
              <td>{new Date(e.at).toLocaleString("en-IN")}</td>
              <td className="mono">{e.action}</td>
              <td>{e.targetType ? `${e.targetType} · ${e.targetId?.slice(0, 8)}` : "—"}</td>
              <td>{e.actorKind === "system" ? "System" : (e.actorId?.slice(0, 8) ?? "—")}</td>
              <td className="mono">{e.ip ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {query.hasNextPage ? (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          Load older entries
        </button>
      ) : null}
    </>
  );
}
