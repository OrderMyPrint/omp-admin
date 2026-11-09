import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";

type Json = any;

export const errText = (e: unknown) => {
  if (!(e instanceof ApiError)) return String(e);
  const problems =
    (e.extra.problems as string[] | undefined) ??
    (e.extra.errors as { field: string; message: string }[] | undefined)?.map((x) => `${x.field}: ${x.message}`);
  return problems?.length ? `${e.title}: ${problems.join("; ")}` : e.detail ? `${e.title}. ${e.detail}` : e.title;
};

type Tab = "pages" | "navigation" | "faq" | "media" | "settings";
const TABS: [Tab, string][] = [
  ["pages", "Pages"],
  ["navigation", "Navigation"],
  ["faq", "FAQ"],
  ["media", "Media"],
  ["settings", "Site settings"],
];

/** AD-WEB-01…06 · Website content hub. Edits are drafts until published. */
export function Website() {
  const [tab, setTab] = useState<Tab>("pages");
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Website content</h1>
          <p className="t-body-s muted">
            Pages, navigation, FAQ, media and site settings. Edits are drafts until you publish; the site updates within
            a minute.
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {TABS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "pages" ? (
        <Pages />
      ) : tab === "navigation" ? (
        <Navigation />
      ) : tab === "faq" ? (
        <Faq />
      ) : tab === "media" ? (
        <Media />
      ) : (
        <Settings />
      )}
    </>
  );
}

function Notice({ notice }: { notice: { tone: "success" | "error"; text: string } | null }) {
  return notice ? <p className={`alert alert-${notice.tone}`}>{notice.text}</p> : null;
}

/* ------------------------------------------------------------------ pages */

type PageRow = {
  id: string;
  key: string;
  path: string;
  title: string;
  type: string;
  published: boolean;
  publishedAt: string | null;
  hasDraft: boolean;
};

function Pages() {
  const [editing, setEditing] = useState<string | null>(null);
  const list = useQuery({ queryKey: ["pages"], queryFn: () => api<PageRow[]>("/admin/content/pages") });
  if (editing) return <PageEditor id={editing} onClose={() => setEditing(null)} />;
  return (
    <>
      {list.error ? <p className="alert alert-error">{errText(list.error)}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Page</th>
            <th>Address</th>
            <th>Type</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {(list.data ?? []).map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.title}</strong>
              </td>
              <td className="mono">{p.path}</td>
              <td>{p.type.toLowerCase()}</td>
              <td>
                <div className="row">
                  {p.published ? (
                    <span className="badge badge-success">Published</span>
                  ) : (
                    <span className="badge">Not published</span>
                  )}
                  {p.hasDraft ? <span className="badge badge-warning">Unpublished changes</span> : null}
                </div>
              </td>
              <td>
                <div className="row">
                  <Link className="link" to={`/website/editor/${p.id}`}>
                    Visual editor
                  </Link>
                  <button type="button" className="link" onClick={() => setEditing(p.id)}>
                    Edit form
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

const TEXT_FIELDS = ["overline", "heading", "title", "lead", "body", "note"] as const;
const LONG = new Set(["body", "lead"]);

/** Edits the text of every section (AD-WEB-02). Links and images keep their current targets. */
export function BlockEditor({ block, onChange }: { block: Json; onChange: (b: Json) => void }) {
  const set = (patch: Json) => onChange({ ...block, ...patch });
  const lines = (value: string[] | undefined) => (value ?? []).join("\n");
  const fromLines = (text: string) =>
    text
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
  return (
    <div className="grid-2">
      {TEXT_FIELDS.filter((f) => typeof block[f] === "string").map((f) => (
        <div key={f} className="field" style={LONG.has(f) ? { gridColumn: "1 / -1" } : undefined}>
          <label>{f[0].toUpperCase() + f.slice(1)}</label>
          {LONG.has(f) ? (
            <textarea value={block[f]} onChange={(e) => set({ [f]: e.target.value })} />
          ) : (
            <input value={block[f]} onChange={(e) => set({ [f]: e.target.value })} />
          )}
        </div>
      ))}
      {Array.isArray(block.points) ? (
        <div className="field">
          <label>Bullet points (one per line)</label>
          <textarea value={lines(block.points)} onChange={(e) => set({ points: fromLines(e.target.value) })} />
        </div>
      ) : null}
      {Array.isArray(block.productSlugs) ? (
        <div className="field">
          <label>Products (slugs, one per line, in order)</label>
          <textarea
            value={lines(block.productSlugs)}
            onChange={(e) => set({ productSlugs: fromLines(e.target.value) })}
          />
        </div>
      ) : null}
      {Array.isArray(block.categorySlugs) ? (
        <div className="field">
          <label>Categories (slugs, one per line, in order)</label>
          <textarea
            value={lines(block.categorySlugs)}
            onChange={(e) => set({ categorySlugs: fromLines(e.target.value) })}
          />
        </div>
      ) : null}
      {["primary", "secondary", "cta"]
        .filter((k) => block[k])
        .map((k) => (
          <div key={k} className="field">
            <label>{k === "cta" ? "Button" : `${k[0].toUpperCase()}${k.slice(1)} button`} label</label>
            <input value={block[k].label} onChange={(e) => set({ [k]: { ...block[k], label: e.target.value } })} />
          </div>
        ))}
      {Array.isArray(block.items) && block.type === "assuranceStrip"
        ? block.items.map((item: Json, i: number) => (
            <div key={i} className="field">
              <label>Point {i + 1}</label>
              <input
                value={item.title}
                onChange={(e) =>
                  set({
                    items: block.items.map((x: Json, j: number) => (j === i ? { ...x, title: e.target.value } : x)),
                  })
                }
              />
              <input
                value={item.detail}
                onChange={(e) =>
                  set({
                    items: block.items.map((x: Json, j: number) => (j === i ? { ...x, detail: e.target.value } : x)),
                  })
                }
              />
            </div>
          ))
        : null}
      {Array.isArray(block.steps)
        ? block.steps.map((s: Json, i: number) => (
            <div key={i} className="field">
              <label>Step {i + 1}</label>
              <input
                value={s.title}
                onChange={(e) =>
                  set({
                    steps: block.steps.map((x: Json, j: number) => (j === i ? { ...x, title: e.target.value } : x)),
                  })
                }
              />
              <textarea
                value={s.detail}
                onChange={(e) =>
                  set({
                    steps: block.steps.map((x: Json, j: number) => (j === i ? { ...x, detail: e.target.value } : x)),
                  })
                }
              />
            </div>
          ))
        : null}
      {Array.isArray(block.cards)
        ? block.cards.map((c: Json, i: number) => (
            <div key={i} className="field">
              <label>Card {i + 1}</label>
              <input
                value={c.title}
                onChange={(e) =>
                  set({
                    cards: block.cards.map((x: Json, j: number) => (j === i ? { ...x, title: e.target.value } : x)),
                  })
                }
              />
              <textarea
                value={c.body}
                onChange={(e) =>
                  set({
                    cards: block.cards.map((x: Json, j: number) => (j === i ? { ...x, body: e.target.value } : x)),
                  })
                }
              />
            </div>
          ))
        : null}
      {Array.isArray(block.nodes)
        ? block.nodes.map((n: Json, i: number) => (
            <div key={i} className="field" style={{ gridColumn: "1 / -1" }}>
              <label>
                {n.type === "heading" ? "Heading" : n.type === "paragraph" ? "Paragraph" : "List (one item per line)"}
              </label>
              {n.type === "heading" ? (
                <input
                  value={n.text}
                  onChange={(e) =>
                    set({
                      nodes: block.nodes.map((x: Json, j: number) => (j === i ? { ...x, text: e.target.value } : x)),
                    })
                  }
                />
              ) : n.type === "paragraph" ? (
                <textarea
                  value={n.text}
                  onChange={(e) =>
                    set({
                      nodes: block.nodes.map((x: Json, j: number) => (j === i ? { ...x, text: e.target.value } : x)),
                    })
                  }
                />
              ) : (
                <textarea
                  value={lines(n.items)}
                  onChange={(e) =>
                    set({
                      nodes: block.nodes.map((x: Json, j: number) =>
                        j === i ? { ...x, items: fromLines(e.target.value) } : x,
                      ),
                    })
                  }
                />
              )}
            </div>
          ))
        : null}
    </div>
  );
}

function PageEditor({ id, onClose }: { id: string; onClose: () => void }) {
  const { can } = useSession();
  const client = useQueryClient();
  const page = useQuery({ queryKey: ["page", id], queryFn: () => api<Json>(`/admin/content/pages/${id}`) });
  const [doc, setDoc] = useState<Json>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (page.data?.document) setDoc(structuredClone(page.data.document));
  }, [page.data]);
  if (!doc || !page.data) return <p className="muted">Loading…</p>;

  const setBlock = (i: number, b: Json) =>
    setDoc({ ...doc, blocks: doc.blocks.map((x: Json, j: number) => (j === i ? b : x)) });
  const move = (i: number, d: -1 | 1) => {
    const blocks = [...doc.blocks];
    const [b] = blocks.splice(i, 1);
    blocks.splice(i + d, 0, b);
    setDoc({ ...doc, blocks });
  };
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: "success", text: ok });
      await client.invalidateQueries({ queryKey: ["page", id] });
      void client.invalidateQueries({ queryKey: ["pages"] });
    } catch (e) {
      setNotice({ tone: "error", text: errText(e) });
    }
  };
  const saveDraft = () =>
    run(
      () => api(`/admin/content/pages/${id}/draft`, { method: "PUT", body: { document: doc } }),
      "Draft saved. The live site hasn’t changed yet.",
    );
  const publish = () =>
    run(async () => {
      await api(`/admin/content/pages/${id}/draft`, { method: "PUT", body: { document: doc } });
      await api(`/admin/content/pages/${id}/publish`, { method: "POST" });
    }, "Published. The site shows it within a minute.");

  return (
    <>
      <div className="page-header">
        <div>
          <button type="button" className="link" onClick={onClose}>
            ← All pages
          </button>
          <h2 className="t-h3">{page.data.title}</h2>
          <p className="t-body-s muted">
            <span className="mono">{page.data.path}</span> · editing the{" "}
            {page.data.editing === "draft" ? "draft" : "published version"}
          </p>
        </div>
        <div className="row">
          <Link className="btn btn-accent" to={`/website/editor/${id}`}>
            Visual editor
          </Link>
          {can("content.write") ? (
            <button type="button" className="btn btn-secondary" onClick={saveDraft}>
              Save draft
            </button>
          ) : null}
          {can("content.publish") ? (
            <button type="button" className="btn btn-primary" onClick={publish}>
              Publish
            </button>
          ) : null}
        </div>
      </div>
      <Notice notice={notice} />
      <div className="card">
        <h3 className="t-h5">Page heading</h3>
        <div className="grid-2">
          {["overline", "title", "lead"].map((f) => (
            <div key={f} className="field" style={f === "lead" ? { gridColumn: "1 / -1" } : undefined}>
              <label>{f[0].toUpperCase() + f.slice(1)}</label>
              {f === "lead" ? (
                <textarea value={doc[f] ?? ""} onChange={(e) => setDoc({ ...doc, [f]: e.target.value || undefined })} />
              ) : (
                <input value={doc[f] ?? ""} onChange={(e) => setDoc({ ...doc, [f]: e.target.value || undefined })} />
              )}
            </div>
          ))}
        </div>
      </div>
      {doc.blocks.map((b: Json, i: number) => (
        <div key={b.id} className="card">
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h3 className="t-h5">
              {b.heading ?? b.title ?? b.type} <span className="badge">{b.type}</span>
            </h3>
            <div className="row">
              <label className="check">
                <input
                  type="checkbox"
                  checked={b.visible !== false}
                  onChange={(e) => setBlock(i, { ...b, visible: e.target.checked })}
                />{" "}
                Visible
              </label>
              <button type="button" className="link" disabled={i === 0} onClick={() => move(i, -1)}>
                Up
              </button>
              <button type="button" className="link" disabled={i === doc.blocks.length - 1} onClick={() => move(i, 1)}>
                Down
              </button>
            </div>
          </div>
          <BlockEditor block={b} onChange={(nb) => setBlock(i, nb)} />
        </div>
      ))}
      <div className="card">
        <h3 className="t-h5">SEO &amp; sharing</h3>
        <div className="grid-2">
          <div className="field">
            <label>Page title</label>
            <input
              value={doc.seo?.title ?? ""}
              maxLength={70}
              onChange={(e) => setDoc({ ...doc, seo: { ...doc.seo, title: e.target.value || undefined } })}
            />
          </div>
          <div className="field">
            <label>Meta description</label>
            <textarea
              value={doc.seo?.description ?? ""}
              maxLength={170}
              onChange={(e) => setDoc({ ...doc, seo: { ...doc.seo, description: e.target.value || undefined } })}
            />
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={Boolean(doc.seo?.noindex)}
            onChange={(e) => setDoc({ ...doc, seo: { ...doc.seo, noindex: e.target.checked } })}
          />{" "}
          Hide this page from search engines
        </label>
      </div>
      <div className="card">
        <h3 className="t-h5">Version history</h3>
        <table className="table">
          <tbody>
            {page.data.versions.map((v: Json) => (
              <tr key={v.id}>
                <td>Version {v.versionNo}</td>
                <td>
                  <span
                    className={
                      v.status === "PUBLISHED"
                        ? "badge badge-success"
                        : v.status === "DRAFT"
                          ? "badge badge-warning"
                          : "badge"
                    }
                  >
                    {v.status.toLowerCase()}
                  </span>
                </td>
                <td>{v.publishedAt ? new Date(v.publishedAt).toLocaleString("en-IN") : "—"}</td>
                <td>
                  {v.status === "ARCHIVED" && can("content.write") ? (
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        run(
                          () => api(`/admin/content/pages/${id}/versions/${v.id}/restore`, { method: "POST" }),
                          "Restored into the draft. Publish to make it live.",
                        )
                      }
                    >
                      Restore
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/* ------------------------------------------------------------- navigation */

function LinkList({ links, onChange }: { links: Json[]; onChange: (l: Json[]) => void }) {
  const target = (l: Json) =>
    l.link.kind === "page"
      ? `page: ${l.link.key}`
      : l.link.kind === "path"
        ? l.link.path
        : l.link.kind === "url"
          ? l.link.url
          : `${l.link.kind}: ${l.link.slug}`;
  return (
    <>
      {links.map((l, i) => (
        <div key={i} className="row">
          <input
            aria-label="Label"
            value={l.label}
            onChange={(e) => onChange(links.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
          />
          <span className="mono">{target(l)}</span>
          <button
            type="button"
            className="link"
            disabled={i === 0}
            onClick={() => onChange(links.map((x, j) => (j === i - 1 ? links[i] : j === i ? links[i - 1] : x)))}
          >
            Up
          </button>
          <button type="button" className="link" onClick={() => onChange(links.filter((_, j) => j !== i))}>
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="link"
        onClick={() => {
          const label = prompt("Link label");
          const path = label && prompt("Address on this site, e.g. /about or /products/stickers");
          if (label && path) onChange([...links, { label, link: { kind: "path", path }, newTab: false, mobile: true }]);
        }}
      >
        + Add link
      </button>
    </>
  );
}

function Navigation() {
  const { can } = useSession();
  const client = useQueryClient();
  const menus = useQuery({
    queryKey: ["menus"],
    queryFn: () => api<{ key: string; draft: Json; hasChanges: boolean }[]>("/admin/content/navigation"),
  });
  const [drafts, setDrafts] = useState<Record<string, Json>>({});
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (menus.data) setDrafts(Object.fromEntries(menus.data.map((m) => [m.key, structuredClone(m.draft)])));
  }, [menus.data]);
  const editable = can("navigation.write");

  const saveAndPublish = async (publish: boolean) => {
    setNotice(null);
    try {
      for (const [key, draft] of Object.entries(drafts))
        await api(`/admin/content/navigation/${key}`, { method: "PUT", body: { draft } });
      if (publish) await api("/admin/content/navigation/publish", { method: "POST" });
      setNotice({ tone: "success", text: publish ? "Menus published." : "Menus saved as draft." });
      void client.invalidateQueries({ queryKey: ["menus"] });
    } catch (e) {
      setNotice({ tone: "error", text: errText(e) });
    }
  };

  if (!drafts.utility) return <p className="muted">Loading…</p>;
  return (
    <>
      <div className="card">
        <h2 className="t-h5">Header · utility bar</h2>
        <LinkList
          links={drafts.utility.links}
          onChange={(links) => setDrafts({ ...drafts, utility: { ...drafts.utility, links } })}
        />
      </div>
      {drafts.footer ? (
        <div className="grid-2">
          {drafts.footer.columns.map((c: Json, i: number) => (
            <div key={i} className="card">
              <input
                aria-label="Column title"
                value={c.title}
                onChange={(e) =>
                  setDrafts({
                    ...drafts,
                    footer: {
                      columns: drafts.footer.columns.map((x: Json, j: number) =>
                        j === i ? { ...x, title: e.target.value } : x,
                      ),
                    },
                  })
                }
              />
              <LinkList
                links={c.links}
                onChange={(links) =>
                  setDrafts({
                    ...drafts,
                    footer: {
                      columns: drafts.footer.columns.map((x: Json, j: number) => (j === i ? { ...x, links } : x)),
                    },
                  })
                }
              />
            </div>
          ))}
        </div>
      ) : null}
      <Notice notice={notice} />
      {editable ? (
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => saveAndPublish(false)}>
            Save draft
          </button>
          {can("content.publish") ? (
            <button type="button" className="btn btn-primary" onClick={() => saveAndPublish(true)}>
              Publish menus
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

/* -------------------------------------------------------------------- FAQ */

function Faq() {
  const { can } = useSession();
  const client = useQueryClient();
  const faq = useQuery({ queryKey: ["faq"], queryFn: () => api<Json[]>("/admin/content/faq") });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const update = async (id: string, patch: Json) => {
    setNotice(null);
    try {
      await api(`/admin/content/faq/items/${id}`, { method: "PATCH", body: patch });
      setNotice({ tone: "success", text: "Saved." });
      void client.invalidateQueries({ queryKey: ["faq"] });
    } catch (e) {
      setNotice({ tone: "error", text: errText(e) });
    }
  };
  const add = async (topicId: string) => {
    const question = prompt("Question");
    const answer = question && prompt("Answer");
    if (!question || !answer) return;
    try {
      await api("/admin/content/faq/items", { method: "POST", body: { topicId, question, answer } });
      setNotice({ tone: "success", text: "Question added as unpublished." });
      void client.invalidateQueries({ queryKey: ["faq"] });
    } catch (e) {
      setNotice({ tone: "error", text: errText(e) });
    }
  };
  return (
    <>
      <Notice notice={notice} />
      {(faq.data ?? []).map((topic) => (
        <div key={topic.id} className="card">
          <h2 className="t-h5">{topic.title}</h2>
          {topic.items.map((item: Json) => (
            <FaqItem
              key={item.id}
              item={item}
              canPublish={can("content.publish")}
              onSave={(patch) => update(item.id, patch)}
            />
          ))}
          {can("content.write") ? (
            <button type="button" className="link" onClick={() => add(topic.id)}>
              + Add question
            </button>
          ) : null}
        </div>
      ))}
    </>
  );
}

function FaqItem({ item, canPublish, onSave }: { item: Json; canPublish: boolean; onSave: (patch: Json) => void }) {
  const [q, setQ] = useState(item.question);
  const [a, setA] = useState(item.answer);
  const dirty = q !== item.question || a !== item.answer;
  return (
    <div className="field" style={{ borderTop: "1px solid var(--omp-color-border-default)", paddingTop: 12 }}>
      <input aria-label="Question" value={q} onChange={(e) => setQ(e.target.value)} />
      <textarea aria-label="Answer" value={a} onChange={(e) => setA(e.target.value)} />
      <div className="row">
        {dirty ? (
          <button type="button" className="btn btn-secondary" onClick={() => onSave({ question: q, answer: a })}>
            Save
          </button>
        ) : null}
        <label className="check">
          <input
            type="checkbox"
            disabled={!canPublish}
            checked={item.isPublished}
            onChange={(e) => onSave({ isPublished: e.target.checked })}
          />{" "}
          Published
        </label>
        <label className="check">
          <input
            type="checkbox"
            disabled={!canPublish}
            checked={item.showOnHomepage}
            onChange={(e) => onSave({ showOnHomepage: e.target.checked })}
          />{" "}
          On homepage
        </label>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ media */

function Media() {
  const { can } = useSession();
  const client = useQueryClient();
  const media = useQuery({ queryKey: ["media"], queryFn: () => api<Json[]>("/admin/content/media") });
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const saveAlt = async (id: string, alt: string) => {
    try {
      await api(`/admin/content/media/${id}`, { method: "PATCH", body: { alt } });
      setNotice({ tone: "success", text: "Alt text saved." });
      void client.invalidateQueries({ queryKey: ["media"] });
    } catch (e) {
      setNotice({ tone: "error", text: errText(e) });
    }
  };
  return (
    <>
      <p className="alert alert-info">
        Uploading new images arrives with file storage (decision D-05). Brand logo files are supplied masters and are
        never edited here.
      </p>
      <Notice notice={notice} />
      <table className="table">
        <thead>
          <tr>
            <th>Image</th>
            <th>Alt text (required to publish)</th>
            <th>Used on</th>
          </tr>
        </thead>
        <tbody>
          {(media.data ?? []).map((m) => (
            <tr key={m.id}>
              <td className="mono">{m.fileName}</td>
              <td>
                <input
                  aria-label={`Alt text for ${m.fileName}`}
                  defaultValue={m.alt}
                  disabled={!can("media.write")}
                  style={{ width: "100%" }}
                  onBlur={(e) => e.target.value !== m.alt && saveAlt(m.id, e.target.value)}
                />
              </td>
              <td>{m.usedOn.length ? m.usedOn.join(", ") : <span className="muted">Not used</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/* --------------------------------------------------------------- settings */

function Settings() {
  const { can } = useSession();
  const client = useQueryClient();
  const settings = useQuery({
    queryKey: ["settings"],
    queryFn: () => api<{ draft: Json }>("/admin/content/site-settings"),
  });
  const redirects = useQuery({ queryKey: ["redirects"], queryFn: () => api<Json[]>("/admin/content/redirects") });
  const [draft, setDraft] = useState<Json>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  useEffect(() => {
    if (settings.data?.draft) setDraft(structuredClone(settings.data.draft));
  }, [settings.data]);
  const editable = can("site_settings.write");
  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setNotice(null);
    try {
      await fn();
      setNotice({ tone: "success", text: ok });
      void client.invalidateQueries({ queryKey: ["settings"] });
      void client.invalidateQueries({ queryKey: ["redirects"] });
    } catch (e) {
      setNotice({ tone: "error", text: errText(e) });
    }
  };
  if (!draft) return <p className="muted">Loading…</p>;
  const set = (section: string, patch: Json) => setDraft({ ...draft, [section]: { ...draft[section], ...patch } });

  return (
    <>
      <div className="grid-2">
        <div className="card">
          <h2 className="t-h5">Contact details</h2>
          <div className="field">
            <label>Phone (shown)</label>
            <input
              value={draft.contact.phone}
              disabled={!editable}
              onChange={(e) => set("contact", { phone: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Phone link</label>
            <input
              value={draft.contact.phoneHref}
              disabled={!editable}
              onChange={(e) => set("contact", { phoneHref: e.target.value })}
            />
            <span className="hint">Format: tel:+916356161761</span>
          </div>
          <div className="field">
            <label>Opening hours</label>
            <input
              value={draft.contact.hours}
              disabled={!editable}
              onChange={(e) => set("contact", { hours: e.target.value })}
            />
          </div>
          <div className="field">
            <label>Support email</label>
            <input
              value={draft.contact.supportEmail ?? ""}
              disabled={!editable}
              onChange={(e) => set("contact", { supportEmail: e.target.value || null })}
            />
          </div>
        </div>
        <div className="card">
          <h2 className="t-h5">Announcement bar</h2>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.announcement.enabled}
              disabled={!editable}
              onChange={(e) => set("announcement", { enabled: e.target.checked })}
            />{" "}
            Show announcement bar
          </label>
          <div className="field">
            <label>Message</label>
            <input
              value={draft.announcement.message}
              maxLength={140}
              disabled={!editable}
              onChange={(e) => set("announcement", { message: e.target.value })}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label>Starts</label>
              <input
                type="datetime-local"
                disabled={!editable}
                value={draft.announcement.startsAt ? draft.announcement.startsAt.slice(0, 16) : ""}
                onChange={(e) =>
                  set("announcement", { startsAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
              />
            </div>
            <div className="field">
              <label>Ends</label>
              <input
                type="datetime-local"
                disabled={!editable}
                value={draft.announcement.endsAt ? draft.announcement.endsAt.slice(0, 16) : ""}
                onChange={(e) =>
                  set("announcement", { endsAt: e.target.value ? new Date(e.target.value).toISOString() : null })
                }
              />
            </div>
          </div>
          <h2 className="t-h5">Search defaults</h2>
          <div className="field">
            <label>Title template</label>
            <input
              value={draft.seo.titleTemplate}
              disabled={!editable}
              onChange={(e) => set("seo", { titleTemplate: e.target.value })}
            />
            <span className="hint">%s is replaced by the page title</span>
          </div>
          <div className="field">
            <label>Default description</label>
            <textarea
              value={draft.seo.description}
              maxLength={170}
              disabled={!editable}
              onChange={(e) => set("seo", { description: e.target.value })}
            />
          </div>
        </div>
      </div>
      <Notice notice={notice} />
      {editable ? (
        <div className="row">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              run(() => api("/admin/content/site-settings", { method: "PUT", body: { draft } }), "Saved as draft.")
            }
          >
            Save draft
          </button>
          {can("content.publish") ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() =>
                run(async () => {
                  await api("/admin/content/site-settings", { method: "PUT", body: { draft } });
                  await api("/admin/content/site-settings/publish", { method: "POST" });
                }, "Published. The site updates within a minute.")
              }
            >
              Publish settings
            </button>
          ) : null}
        </div>
      ) : null}
      <div className="card">
        <h2 className="t-h5">Redirects</h2>
        <table className="table">
          <tbody>
            {(redirects.data ?? []).map((r) => (
              <tr key={r.id}>
                <td className="mono">{r.fromPath}</td>
                <td className="mono">→ {r.toPath}</td>
                <td>{r.permanent ? "301" : "302"}</td>
                <td>
                  {editable ? (
                    <button
                      type="button"
                      className="link"
                      onClick={() =>
                        run(() => api(`/admin/content/redirects/${r.id}`, { method: "DELETE" }), "Redirect removed.")
                      }
                    >
                      Remove
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {editable ? (
          <button
            type="button"
            className="link"
            onClick={() => {
              const fromPath = prompt("Old address, e.g. /visiting-card");
              const toPath = fromPath && prompt("New address, e.g. /products/visiting-cards");
              if (fromPath && toPath)
                void run(
                  () =>
                    api("/admin/content/redirects", { method: "POST", body: { fromPath, toPath, permanent: true } }),
                  "Redirect added.",
                );
            }}
          >
            + Add redirect
          </button>
        ) : null}
      </div>
    </>
  );
}
