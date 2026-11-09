import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  GripVertical,
  History,
  Layers,
  Lock,
  Monitor,
  Plus,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useNavigate, useParams } from "react-router";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";
import { BLOCK_TYPES, blockLabel, newBlock, type Refs } from "../lib/sections";
import { BlockEditor, errText } from "./Website";

/* eslint-disable @typescript-eslint/no-explicit-any -- content documents are validated by the API */
type Json = any;
type Device = "desktop" | "tablet" | "mobile";
type Panel = "section" | "add" | "navigator";
const DEVICE_WIDTH: Record<Device, number> = { desktop: 1440, tablet: 834, mobile: 390 };

/** Storefront that renders the canvas (its /editor-preview route accepts this admin's origin). */
const STOREFRONT: string =
  import.meta.env.VITE_STOREFRONT_URL ??
  (import.meta.env.DEV ? "http://localhost:3100" : "https://omp-storefront.vercel.app");
const STOREFRONT_ORIGIN = new URL(STOREFRONT).origin;

const uid = (type: string) => `${type}-${Math.random().toString(36).slice(2, 8)}`;

/** AD-WEB-07…11 · Visual page editor (D-30: typed brand sections, no free-form HTML/CSS). */
export function VisualEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const { can } = useSession();
  const page = useQuery({ queryKey: ["page", id], queryFn: () => api<Json>(`/admin/content/pages/${id}`) });
  const refs = useQuery({ queryKey: ["editor-refs"], queryFn: loadRefs, staleTime: 60_000 });

  const [doc, setDoc] = useState<Json>(null);
  const history = useRef<{ past: Json[]; future: Json[]; lastKey: string | null; lastAt: number }>({
    past: [],
    future: [],
    lastKey: null,
    lastAt: 0,
  });
  const [, force] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [panel, setPanel] = useState<Panel>("navigator");
  const [device, setDevice] = useState<Device>("desktop");
  const [previewing, setPreviewing] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const [save, setSave] = useState<{ state: "saved" | "unsaved" | "saving" | "error"; message?: string }>({
    state: "saved",
  });
  const [renderError, setRenderError] = useState<string | null>(null);
  const [review, setReview] = useState<Json | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  /** A draft was saved in this session (the page query still says what was true on load). */
  const [savedDraft, setSavedDraft] = useState(false);
  const [published, setPublished] = useState(false);
  const editable = can("content.write");

  useEffect(() => {
    if (page.data?.document && !doc) setDoc(structuredClone(page.data.document));
  }, [page.data, doc]);

  // ------------------------------------------------------------ editing
  const update = useCallback((recipe: (d: Json) => Json, coalesceKey?: string) => {
    setDoc((current: Json) => {
      if (!current) return current;
      const h = history.current;
      const now = Date.now();
      const coalesce = coalesceKey && h.lastKey === coalesceKey && now - h.lastAt < 1500;
      if (!coalesce) {
        h.past.push(current);
        if (h.past.length > 100) h.past.shift();
      }
      h.future = [];
      h.lastKey = coalesceKey ?? null;
      h.lastAt = now;
      return recipe(structuredClone(current));
    });
    setSave({ state: "unsaved" });
  }, []);

  const undo = () => {
    const h = history.current;
    const prev = h.past.pop();
    if (!prev) return;
    h.future.push(doc);
    h.lastKey = null;
    setDoc(prev);
    setSave({ state: "unsaved" });
    force((n) => n + 1);
  };
  const redo = () => {
    const h = history.current;
    const next = h.future.pop();
    if (!next) return;
    h.past.push(doc);
    h.lastKey = null;
    setDoc(next);
    setSave({ state: "unsaved" });
    force((n) => n + 1);
  };

  const setBlock = (blockId: string, recipe: (b: Json) => Json, key?: string) =>
    update((d) => ({ ...d, blocks: d.blocks.map((b: Json) => (b.id === blockId ? recipe(b) : b)) }), key);

  const action = useCallback(
    (blockId: string, kind: string) => {
      if (!editable) return;
      if (kind === "delete" && !confirm("Delete this section? You can undo straight after.")) return;
      update((d) => {
        const i = d.blocks.findIndex((b: Json) => b.id === blockId);
        if (i < 0) return d;
        const blocks = [...d.blocks];
        if (kind === "up" && i > 0) [blocks[i - 1], blocks[i]] = [blocks[i], blocks[i - 1]];
        if (kind === "down" && i < blocks.length - 1) [blocks[i + 1], blocks[i]] = [blocks[i], blocks[i + 1]];
        if (kind === "duplicate") blocks.splice(i + 1, 0, { ...structuredClone(blocks[i]), id: uid(blocks[i].type) });
        if (kind === "hide") blocks[i] = { ...blocks[i], visible: false };
        if (kind === "delete") blocks.splice(i, 1);
        return { ...d, blocks };
      });
      if (kind === "delete") setSelected(null);
    },
    [editable, update],
  );

  const insert = (type: string) => {
    if (!refs.data) return;
    const block = newBlock(type, refs.data);
    if (!block) return;
    update((d) => {
      const blocks = [...d.blocks];
      const at = insertAt ?? (selected ? blocks.findIndex((b: Json) => b.id === selected) + 1 : blocks.length);
      blocks.splice(Math.max(0, Math.min(at, blocks.length)), 0, block);
      return { ...d, blocks };
    });
    setSelected(block.id);
    setInsertAt(null);
    setPanel("section");
    // Scroll the canvas to the new section once it has been rendered there.
    setTimeout(() => post({ type: "omp-editor:focus", id: block.id }), 800);
  };

  // ------------------------------------------------------------ autosave
  useEffect(() => {
    if (save.state !== "unsaved" || !editable || !doc || renderError) return;
    const t = setTimeout(() => void saveNow(), 1500);
    return () => clearTimeout(t);
  });
  const saveNow = async () => {
    if (!doc) return false;
    setSave({ state: "saving" });
    try {
      await api(`/admin/content/pages/${id}/draft`, { method: "PUT", body: { document: doc } });
      setSave({ state: "saved" });
      setSavedDraft(true);
      setPublished(false);
      void client.invalidateQueries({ queryKey: ["pages"] });
      return true;
    } catch (e) {
      setSave({ state: "error", message: errText(e) });
      return false;
    }
  };

  // ------------------------------------------------------------ canvas bridge
  const frame = useRef<HTMLIFrameElement>(null);
  const [ready, setReady] = useState(false);
  const post = useCallback((message: Json) => {
    frame.current?.contentWindow?.postMessage(message, STOREFRONT_ORIGIN);
  }, []);

  useEffect(() => {
    if (!doc || !ready) return;
    const t = setTimeout(async () => {
      try {
        const rendered = await api<Json>(`/admin/content/pages/${id}/render`, {
          method: "POST",
          body: { document: doc },
        });
        setRenderError(null);
        post({ type: "omp-editor:render", page: rendered, selectedId: selected, editable: !previewing });
      } catch (e) {
        setRenderError(e instanceof ApiError ? errText(e) : String(e));
      }
    }, 250);
    return () => clearTimeout(t);
  }, [doc, ready, selected, previewing, id, post]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== STOREFRONT_ORIGIN || event.source !== frame.current?.contentWindow) return;
      const m = event.data as Json;
      if (m?.type === "omp-editor:ready") setReady(true);
      if (m?.type === "omp-editor:select" && typeof m.id === "string") {
        setSelected(m.id);
        setPanel("section");
      }
      if (m?.type === "omp-editor:action" && typeof m.id === "string") action(m.id, String(m.action));
      if (m?.type === "omp-editor:insert" && typeof m.index === "number" && editable) {
        setInsertAt(m.index);
        setPanel("add");
      }
      if (m?.type === "omp-editor:text" && typeof m.id === "string" && editable) {
        const field = String(m.field);
        if (!["overline", "heading", "body", "lead"].includes(field)) return;
        setBlock(
          m.id,
          (b) => (field in b || field !== "lead" ? { ...b, [field]: String(m.value) } : b),
          `text:${m.id}:${field}`,
        );
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action, editable]);

  const focusSection = (blockId: string) => {
    setSelected(blockId);
    setPanel("section");
    post({ type: "omp-editor:focus", id: blockId });
  };

  // ------------------------------------------------------------ canvas sizing
  const area = useRef<HTMLDivElement>(null);
  const [areaSize, setAreaSize] = useState({ w: 1000, h: 700 });
  const mounted = Boolean(doc && page.data);
  useEffect(() => {
    if (!area.current) return;
    const ro = new ResizeObserver(([e]) => setAreaSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(area.current);
    return () => ro.disconnect();
  }, [mounted, previewing]);
  const width = DEVICE_WIDTH[device];
  const scale = Math.min(1, areaSize.w / width);
  const frameHeight = Math.max(400, areaSize.h / scale);

  // ------------------------------------------------------------ publish
  const openReview = async () => {
    if (save.state !== "saved" && !(await saveNow())) return;
    try {
      setReview(await api<Json>(`/admin/content/pages/${id}/review`));
    } catch (e) {
      setToast(errText(e));
    }
  };
  const publish = async () => {
    try {
      await api(`/admin/content/pages/${id}/publish`, { method: "POST" });
      setReview(null);
      setSavedDraft(false);
      setPublished(true);
      setToast("Published. The live site shows it within a minute.");
      void client.invalidateQueries({ queryKey: ["page", id] });
      void client.invalidateQueries({ queryKey: ["pages"] });
    } catch (e) {
      setToast(errText(e));
    }
  };

  // keyboard: undo / redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest("input, textarea, select");
      if (typing || !(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (page.error) return <p className="content alert alert-error">{errText(page.error)}</p>;
  if (!doc || !page.data) return <p className="content muted">Loading the editor…</p>;

  const block = doc.blocks.find((b: Json) => b.id === selected) ?? null;
  const index = block ? doc.blocks.indexOf(block) : -1;
  const hasDraft = (page.data.editing === "draft" && !published) || savedDraft || save.state !== "saved";

  return (
    <div className="editor">
      <header className="editor-top">
        <div className="row">
          <button
            type="button"
            className="icon-btn"
            aria-label="Back to Website content"
            onClick={() => navigate("/website")}
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <div className="t-body-xs muted">Website content · Pages</div>
            <div className="t-label-l">{doc.title}</div>
          </div>
          {hasDraft ? (
            <span className="badge badge-warning">Unpublished changes</span>
          ) : (
            <span className="badge badge-success">Published</span>
          )}
        </div>
        <div className="device-toggle" role="radiogroup" aria-label="Preview size">
          {(
            [
              ["desktop", Monitor, "Desktop"],
              ["tablet", Tablet, "Tablet"],
              ["mobile", Smartphone, "Mobile"],
            ] as const
          ).map(([d, Icon, label]) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={device === d}
              aria-label={label}
              title={`${label} · ${DEVICE_WIDTH[d]} px`}
              onClick={() => setDevice(d)}
            >
              <Icon size={18} />
            </button>
          ))}
        </div>
        <div className="row editor-actions">
          <span className="t-body-xs muted save-state">
            {save.state === "saving"
              ? "Saving…"
              : save.state === "unsaved"
                ? "Unsaved"
                : save.state === "error"
                  ? "Not saved"
                  : "Draft saved"}
          </span>
          <button
            type="button"
            className="icon-btn"
            aria-label="Undo"
            title="Undo (⌘Z)"
            disabled={!history.current.past.length}
            onClick={undo}
          >
            <Undo2 size={20} />
          </button>
          <button
            type="button"
            className="icon-btn"
            aria-label="Redo"
            title="Redo (⇧⌘Z)"
            disabled={!history.current.future.length}
            onClick={redo}
          >
            <Redo2 size={20} />
          </button>
          <div className="popover-anchor">
            <button
              type="button"
              className="icon-btn"
              aria-label="Version history"
              title="Version history"
              onClick={() => setShowHistory((v) => !v)}
            >
              <History size={20} />
            </button>
            {showHistory ? (
              <Versions
                versions={page.data.versions}
                canRestore={editable}
                onRestore={async (vid) => {
                  await api(`/admin/content/pages/${id}/versions/${vid}/restore`, { method: "POST" });
                  const fresh = await api<Json>(`/admin/content/pages/${id}`);
                  update(() => structuredClone(fresh.document));
                  setShowHistory(false);
                  setToast("Restored into the draft. Publish to make it live.");
                }}
              />
            ) : null}
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            aria-label={previewing ? "Back to editing" : "Preview"}
            onClick={() => setPreviewing((p) => !p)}
          >
            <Eye size={18} /> <span className="btn-label">{previewing ? "Back to editing" : "Preview"}</span>
          </button>
          {editable ? (
            <button type="button" className="btn btn-secondary" onClick={() => void saveNow()}>
              Save draft
            </button>
          ) : null}
          {can("content.publish") ? (
            <button type="button" className="btn btn-primary" onClick={() => void openReview()}>
              Publish
            </button>
          ) : null}
        </div>
      </header>

      <div className="editor-body">
        {!previewing ? (
          <aside className="editor-panel">
            {panel === "add" ? (
              <AddPanel
                refs={refs.data}
                onClose={() => {
                  setInsertAt(null);
                  setPanel(block ? "section" : "navigator");
                }}
                onAdd={insert}
                position={insertAt}
              />
            ) : panel === "section" && block ? (
              <SectionPanel
                block={block}
                index={index}
                count={doc.blocks.length}
                refs={refs.data}
                editable={editable}
                onChange={(recipe, key) => setBlock(block.id, recipe, key)}
                onBack={() => setPanel("navigator")}
              />
            ) : (
              <Navigator
                blocks={doc.blocks}
                selected={selected}
                editable={editable}
                onSelect={focusSection}
                onToggle={(bid) => setBlock(bid, (b) => ({ ...b, visible: b.visible === false }))}
                onMove={(from, to) =>
                  update((d) => {
                    const blocks = [...d.blocks];
                    const [moved] = blocks.splice(from, 1);
                    blocks.splice(to, 0, moved);
                    return { ...d, blocks };
                  })
                }
                onAdd={() => {
                  setInsertAt(doc.blocks.length);
                  setPanel("add");
                }}
              />
            )}
            <footer className="editor-panel-foot t-body-xs muted">
              {renderError ? (
                <span className="text-error">Can’t show this yet: {renderError}</span>
              ) : save.state === "error" ? (
                <span className="text-error">{save.message}</span>
              ) : editable ? (
                "Changes save as a draft automatically. The live site changes only when you publish."
              ) : (
                "View only — your role can’t edit website content."
              )}
            </footer>
          </aside>
        ) : null}
        <div className="editor-canvas" ref={area}>
          <div
            className={`canvas-frame${device === "mobile" ? " is-phone" : ""}`}
            style={{ width: width * scale, height: frameHeight * scale }}
          >
            <iframe
              ref={frame}
              title="Page preview"
              src={`${STOREFRONT}/editor-preview`}
              style={{ width, height: frameHeight, transform: `scale(${scale})` }}
              onLoad={() => setReady(false)}
            />
          </div>
        </div>
      </div>

      {review ? (
        <PublishReview review={review} title={doc.title} onCancel={() => setReview(null)} onPublish={publish} />
      ) : null}
      {toast ? (
        <div className="toast" role="status">
          {toast}
          <button type="button" className="icon-btn" aria-label="Dismiss" onClick={() => setToast(null)}>
            <X size={16} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- references

async function loadRefs(): Promise<Refs> {
  const [categories, products, media, pages] = await Promise.all([
    api<Json[]>("/catalogue/categories"),
    api<Json[]>("/catalogue/products"),
    api<Json[]>("/admin/content/media").catch(() => []),
    api<Json[]>("/admin/content/pages").catch(() => []),
  ]);
  return {
    categories: categories.map((c) => ({ slug: c.slug, name: c.name })),
    products: products.map((p) => ({ slug: p.slug, name: p.name })),
    media: media.filter((m) => m.alt?.trim()).map((m) => ({ id: m.id, name: m.fileName, alt: m.alt })),
    pages: pages.map((p) => ({ key: p.key, title: p.title, path: p.path })),
  };
}

// ---------------------------------------------------------------- panels

function PanelHead({
  icon,
  title,
  meta,
  onClose,
}: {
  icon: ReactNode;
  title: string;
  meta?: ReactNode;
  onClose?: () => void;
}) {
  return (
    <div className="editor-panel-head">
      {icon}
      <h2 className="t-h5">{title}</h2>
      {meta}
      {onClose ? (
        <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
          <X size={18} />
        </button>
      ) : null}
    </div>
  );
}

function Navigator(props: {
  blocks: Json[];
  selected: string | null;
  editable: boolean;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onMove: (from: number, to: number) => void;
  onAdd: () => void;
}) {
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  return (
    <>
      <PanelHead
        icon={<Layers size={20} />}
        title="Navigator"
        meta={<span className="t-body-xs muted">{props.blocks.length} sections</span>}
      />
      <div className="editor-panel-body">
        <div className="nav-locked t-body-xs muted">
          <Lock size={14} /> Header · site-wide — edit in Navigation & footer
        </div>
        <ol className="nav-rows">
          {props.blocks.map((b, i) => (
            <li
              key={b.id}
              className="nav-row"
              aria-selected={props.selected === b.id}
              data-hidden={b.visible === false ? "" : undefined}
              draggable={props.editable}
              onDragStart={() => setDragFrom(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragFrom !== null && dragFrom !== i) props.onMove(dragFrom, i);
                setDragFrom(null);
              }}
            >
              {props.editable ? <GripVertical size={16} className="muted grip" aria-hidden="true" /> : null}
              <button type="button" className="nav-row-main" onClick={() => props.onSelect(b.id)}>
                <span className="t-label-m">{blockLabel(b)}</span>
                <span className="t-body-xs muted">
                  {b.visible === false ? "Hidden · " : ""}
                  {BLOCK_TYPES[b.type]?.label ?? b.type}
                </span>
              </button>
              {props.editable ? (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={b.visible === false ? "Show section" : "Hide section"}
                  onClick={() => props.onToggle(b.id)}
                >
                  {b.visible === false ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              ) : null}
            </li>
          ))}
        </ol>
        <div className="nav-locked t-body-xs muted">
          <Lock size={14} /> Footer · site-wide — edit in Navigation & footer
        </div>
        {props.editable ? (
          <button type="button" className="btn btn-secondary btn-block" onClick={props.onAdd}>
            <Plus size={18} /> Add section
          </button>
        ) : null}
      </div>
    </>
  );
}

function AddPanel({
  refs,
  onAdd,
  onClose,
  position,
}: {
  refs?: Refs;
  onAdd: (type: string) => void;
  onClose: () => void;
  position: number | null;
}) {
  const [q, setQ] = useState("");
  const groups = useMemo(() => {
    const all = Object.entries(BLOCK_TYPES).filter(([, t]) => t.label.toLowerCase().includes(q.trim().toLowerCase()));
    return ["Page openers", "Products & prices", "Content", "Help & action"].map(
      (g) => [g, all.filter(([, t]) => t.group === g)] as const,
    );
  }, [q]);
  return (
    <>
      <PanelHead icon={<Plus size={20} />} title="Add section" onClose={onClose} />
      <div className="editor-panel-search">
        <input
          aria-label="Find a section"
          placeholder="Search sections…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {position !== null ? <span className="t-body-xs muted">Adds at position {position + 1}</span> : null}
      </div>
      <div className="editor-panel-body">
        {groups.map(([g, items]) =>
          items.length ? (
            <section key={g} className="tile-group">
              <h3 className="t-overline muted">{g}</h3>
              <div className="tiles">
                {items.map(([type, t]) => {
                  const unavailable = refs ? t.needs?.(refs) : "Loading…";
                  return (
                    <button
                      key={type}
                      type="button"
                      className="tile"
                      disabled={Boolean(unavailable)}
                      title={unavailable || `Add ${t.label}`}
                      onClick={() => onAdd(type)}
                    >
                      <t.icon size={24} aria-hidden="true" />
                      <span className="t-label-s">{t.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : null,
        )}
      </div>
    </>
  );
}

const BACKGROUNDS = [
  ["", "Section default", "var(--omp-color-bg-surface)"],
  ["white", "White", "var(--omp-color-bg-surface)"],
  ["paper", "Paper", "var(--omp-color-bg-canvas)"],
  ["brandTint", "Brand tint", "var(--omp-color-bg-brand-subtle)"],
  ["navy", "Navy", "var(--omp-color-bg-inverse)"],
] as const;

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T | "";
  options: [T | "", string][];
  onChange: (v: T | "") => void;
  disabled: boolean;
}) {
  return (
    <fieldset className="choice">
      <legend className="t-label-m">{label}</legend>
      <div className="chips">
        {options.map(([v, l]) => (
          <button
            key={l}
            type="button"
            className="chip"
            aria-pressed={value === v}
            disabled={disabled}
            onClick={() => onChange(v)}
          >
            {l}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function SectionPanel(props: {
  block: Json;
  index: number;
  count: number;
  refs?: Refs;
  editable: boolean;
  onChange: (recipe: (b: Json) => Json, key?: string) => void;
  onBack: () => void;
}) {
  const { block: b, editable } = props;
  const [tab, setTab] = useState<"content" | "style" | "visibility">("content");
  const style = b.style ?? {};
  const setStyle = (k: string, v: string) =>
    props.onChange((x) => {
      const next = { ...(x.style ?? {}) };
      if (v) next[k] = v;
      else delete next[k];
      return { ...x, style: Object.keys(next).length ? next : undefined };
    });
  const devices = { desktop: true, tablet: true, mobile: true, ...(b.devices ?? {}) };
  const Type = BLOCK_TYPES[b.type];
  return (
    <>
      <PanelHead
        icon={Type ? <Type.icon size={20} /> : null}
        title={blockLabel(b)}
        meta={
          <span className="badge">
            Section {props.index + 1} of {props.count}
          </span>
        }
        onClose={props.onBack}
      />
      <div className="tabs editor-tabs" role="tablist">
        {(["content", "style", "visibility"] as const).map((t) => (
          <button key={t} type="button" role="tab" className="tab" aria-selected={tab === t} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="editor-panel-body">
        {tab === "content" ? (
          <fieldset disabled={!editable} className="plain">
            <p className="t-body-xs muted">
              {Type?.hint ?? ""} Double-click text on the page to type straight onto it.
            </p>
            <BlockEditor block={b} onChange={(nb) => props.onChange(() => nb, `form:${b.id}`)} />
            <LinksAndMedia block={b} refs={props.refs} onChange={props.onChange} />
          </fieldset>
        ) : tab === "style" ? (
          <div className="stack">
            <fieldset className="choice">
              <legend className="t-label-m">Background</legend>
              <div className="swatches">
                {BACKGROUNDS.map(([v, l, color]) => (
                  <button
                    key={l}
                    type="button"
                    className="swatch"
                    aria-pressed={(style.background ?? "") === v}
                    disabled={!editable}
                    onClick={() => setStyle("background", v)}
                  >
                    <span style={{ background: color }} />
                    <span className="t-body-xs">{l}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <Choice
              label="Spacing above and below"
              value={style.spacing ?? ""}
              disabled={!editable}
              onChange={(v) => setStyle("spacing", v)}
              options={[
                ["compact", "Compact"],
                ["", "Standard"],
                ["spacious", "Spacious"],
              ]}
            />
            <Choice
              label="Content width"
              value={style.width ?? ""}
              disabled={!editable}
              onChange={(v) => setStyle("width", v)}
              options={[
                ["", "Contained"],
                ["full", "Full width"],
              ]}
            />
            <Choice
              label="Text alignment"
              value={style.align ?? ""}
              disabled={!editable}
              onChange={(v) => setStyle("align", v)}
              options={[
                ["", "Left"],
                ["center", "Centre"],
              ]}
            />
            {b.type === "hero" ? (
              <Choice
                label="Image position"
                value={style.imageSide ?? ""}
                disabled={!editable}
                onChange={(v) => setStyle("imageSide", v)}
                options={[
                  ["", "Right"],
                  ["start", "Left"],
                ]}
              />
            ) : null}
            {b.type === "imageText" ? (
              <Choice
                label="Image position"
                value={b.imageSide === "left" ? "left" : ""}
                disabled={!editable}
                onChange={(v) => props.onChange((x) => ({ ...x, imageSide: v === "left" ? "left" : "right" }))}
                options={[
                  ["", "Right"],
                  ["left", "Left"],
                ]}
              />
            ) : null}
            <p className="alert alert-info">
              Colours, type and spacing come from the brand’s design tokens. Custom code and CSS aren’t available.
            </p>
          </div>
        ) : (
          <div className="stack">
            <label className="check">
              <input
                type="checkbox"
                checked={b.visible !== false}
                disabled={!editable}
                onChange={(e) => props.onChange((x) => ({ ...x, visible: e.target.checked }))}
              />{" "}
              Show this section
            </label>
            <fieldset className="choice" disabled={!editable || b.visible === false}>
              <legend className="t-label-m">Show on</legend>
              {(["desktop", "tablet", "mobile"] as const).map((d) => (
                <label key={d} className="check">
                  <input
                    type="checkbox"
                    checked={devices[d]}
                    onChange={(e) =>
                      props.onChange((x) => {
                        const next = { ...devices, [d]: e.target.checked };
                        return { ...x, devices: next.desktop && next.tablet && next.mobile ? undefined : next };
                      })
                    }
                  />{" "}
                  {d[0].toUpperCase() + d.slice(1)} <span className="muted t-body-xs">({DEVICE_WIDTH[d]} px)</span>
                </label>
              ))}
            </fieldset>
            <p className="t-body-xs muted">
              Text and order are shared by every device; only visibility can differ. Use the size buttons at the top to
              check each layout.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

/** Button targets and images: the parts BlockEditor leaves as they are. */
function LinksAndMedia({
  block,
  refs,
  onChange,
}: {
  block: Json;
  refs?: Refs;
  onChange: (recipe: (b: Json) => Json) => void;
}) {
  const ctas = ["primary", "secondary", "cta"].filter((k) => block[k]);
  return (
    <>
      {ctas.map((k) => (
        <LinkPicker
          key={k}
          label={`${k === "cta" ? "Button" : k[0].toUpperCase() + k.slice(1) + " button"} links to`}
          link={block[k].link}
          refs={refs}
          onChange={(link) => onChange((b) => ({ ...b, [k]: { ...b[k], link } }))}
        />
      ))}
      {"imageId" in block || block.type === "hero" || block.type === "imageText" ? (
        <div className="field">
          <label>Image · from the media library</label>
          <select
            value={block.imageId ?? ""}
            onChange={(e) => onChange((b) => ({ ...b, imageId: e.target.value || undefined }))}
          >
            {block.type !== "imageText" ? <option value="">No image</option> : null}
            {refs?.media.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <span className="hint">
            Only images with alt text are listed. Add images and alt text in Website content › Media.
          </span>
        </div>
      ) : null}
      {block.type === "notice" ? (
        <div className="field">
          <label>Tone</label>
          <select value={block.tone} onChange={(e) => onChange((b) => ({ ...b, tone: e.target.value }))}>
            {["info", "success", "warning", "error"].map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </div>
      ) : null}
    </>
  );
}

function LinkPicker({
  label,
  link,
  refs,
  onChange,
}: {
  label: string;
  link: Json;
  refs?: Refs;
  onChange: (l: Json) => void;
}) {
  const value =
    link.kind === "page" ? link.key : link.kind === "path" ? link.path : link.kind === "url" ? link.url : link.slug;
  return (
    <div className="field">
      <label>{label}</label>
      <div className="row">
        <select
          aria-label="Link type"
          value={link.kind}
          onChange={(e) => {
            const kind = e.target.value;
            onChange(
              kind === "page"
                ? { kind, key: refs?.pages[0]?.key ?? "home" }
                : kind === "category"
                  ? { kind, slug: refs?.categories[0]?.slug ?? "" }
                  : kind === "product"
                    ? { kind, slug: refs?.products[0]?.slug ?? "" }
                    : kind === "url"
                      ? { kind, url: "https://" }
                      : { kind: "path", path: "/" },
            );
          }}
        >
          <option value="page">Page</option>
          <option value="category">Category</option>
          <option value="product">Product</option>
          <option value="path">Address on this site</option>
          <option value="url">Other website</option>
        </select>
        {link.kind === "page" || link.kind === "category" || link.kind === "product" ? (
          <select
            aria-label="Link target"
            value={value}
            onChange={(e) =>
              onChange(
                link.kind === "page"
                  ? { kind: "page", key: e.target.value }
                  : { kind: link.kind, slug: e.target.value },
              )
            }
          >
            {(link.kind === "page"
              ? refs?.pages.map((p) => [p.key, p.title] as const)
              : link.kind === "category"
                ? refs?.categories.map((c) => [c.slug, c.name] as const)
                : refs?.products.map((p) => [p.slug, p.name] as const)
            )?.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        ) : (
          <input
            aria-label="Link address"
            value={value}
            onChange={(e) =>
              onChange(
                link.kind === "url" ? { kind: "url", url: e.target.value } : { kind: "path", path: e.target.value },
              )
            }
          />
        )}
      </div>
    </div>
  );
}

function Versions({
  versions,
  canRestore,
  onRestore,
}: {
  versions: Json[];
  canRestore: boolean;
  onRestore: (id: string) => void;
}) {
  return (
    <div className="popover">
      <h3 className="t-label-m">Version history</h3>
      <ul>
        {versions.map((v) => (
          <li key={v.id} className="row">
            <span className="t-body-s">Version {v.versionNo}</span>
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
            <span className="t-body-xs muted">
              {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString("en-IN") : ""}
            </span>
            {v.status === "ARCHIVED" && canRestore ? (
              <button type="button" className="link" onClick={() => onRestore(v.id)}>
                Restore
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

const CHANGE_LABEL: Record<string, [string, string]> = {
  added: ["Added", "badge-success"],
  edited: ["Edited", "badge-info"],
  hidden: ["Hidden", ""],
  shown: ["Shown", "badge-success"],
  removed: ["Removed", "badge-error"],
  style: ["Style", "badge-brand"],
  devices: ["Devices", "badge-brand"],
  reordered: ["Order", "badge-info"],
};

function PublishReview({
  review,
  title,
  onCancel,
  onPublish,
}: {
  review: Json;
  title: string;
  onCancel: () => void;
  onPublish: () => void;
}) {
  const blocked = review.problems.length > 0;
  return (
    <div className="scrim" role="presentation">
      <div className="dialog dialog-wide" role="dialog" aria-modal="true" aria-labelledby="publish-title">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="publish-title" className="t-h4">
            Publish {title}?
          </h2>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onCancel}>
            <X size={18} />
          </button>
        </div>
        <p className="t-body-s">
          The live page updates within a minute.{" "}
          {review.firstPublish
            ? "This is its first publish."
            : "The version that’s live now is kept in Version history, so you can restore it."}
        </p>
        <div className="changes">
          <h3 className="t-overline muted">What changes</h3>
          {review.changes.length ? (
            <ul>
              {review.changes.map((c: Json, i: number) => (
                <li key={i} className="row">
                  <span className={`badge ${CHANGE_LABEL[c.kind]?.[1] ?? ""}`}>
                    {CHANGE_LABEL[c.kind]?.[0] ?? c.kind}
                  </span>
                  <span className="t-body-s">
                    {c.label}
                    {c.type !== "page" ? (
                      <span className="muted"> · {BLOCK_TYPES[c.type]?.label ?? c.type}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="t-body-s muted">No visible changes — publishing makes the saved draft live.</p>
          )}
        </div>
        {blocked ? (
          <div className="alert alert-error">
            <strong>Fix these before publishing</strong>
            <ul>
              {review.problems.map((p: string) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="t-body-s">✓ Checks passed: every link and image is valid and every image has alt text.</p>
        )}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <span className="t-body-xs muted" style={{ marginRight: "auto" }}>
            Needs content.publish · recorded in the audit log
          </span>
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" disabled={blocked} onClick={onPublish}>
            Publish now
          </button>
        </div>
      </div>
    </div>
  );
}
