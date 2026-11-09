import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, ApiError } from "../lib/api";
import {
  dateText,
  dateTimeText,
  errText,
  isReferenceSource,
  rupees,
  type Diff,
  type OptionPrice,
  type PriceResult,
  type PricingDocument,
  type ProductDetail,
  type ProductRow,
  type Version,
  type Versions,
  type VersionStatus,
} from "../lib/catalogue";
import { useSession } from "../lib/session";

type Notice = { tone: "success" | "error"; text: string } | null;
const STATUS: Record<VersionStatus, [string, string]> = {
  DRAFT: ["badge badge-warning", "Draft"],
  PUBLISHED: ["badge badge-success", "Published"],
  SCHEDULED: ["badge badge-info", "Scheduled"],
  ARCHIVED: ["badge", "Archived"],
};

/** AD-PRC-01 / 02 / 02b / 03 · Pricing versions, draft editor, test bench and publishing. */
export function Pricing() {
  const [params, setParams] = useSearchParams();
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<ProductRow[]>("/admin/catalogue/products") });
  const productId = params.get("product") ?? products.data?.[0]?.id ?? null;
  const versionId = params.get("version");
  const select = (next: { product?: string; version?: string | null }) => {
    const p = next.product ?? productId;
    const v = next.version === undefined ? versionId : next.version;
    setParams({ ...(p ? { product: p } : {}), ...(v ? { version: v } : {}) });
  };

  return (
    <>
      {products.error ? <p className="alert alert-error">{errText(products.error)}</p> : null}
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "0 1 320px" }}>
          <label htmlFor="pricing-product">Product</label>
          <select
            id="pricing-product"
            value={productId ?? ""}
            onChange={(e) => select({ product: e.target.value, version: null })}
          >
            {(products.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.draftVersionNo ? ` · draft v${p.draftVersionNo}` : ""}
              </option>
            ))}
          </select>
        </div>
      </div>
      {productId ? (
        <ProductPricing
          key={productId}
          productId={productId}
          versionId={versionId}
          onVersion={(id) => select({ version: id })}
        />
      ) : null}
    </>
  );
}

function ProductPricing({
  productId,
  versionId,
  onVersion,
}: {
  productId: string;
  versionId: string | null;
  onVersion: (id: string | null) => void;
}) {
  const { can } = useSession();
  const client = useQueryClient();
  const [notice, setNotice] = useState<Notice>(null);
  const versions = useQuery({
    queryKey: ["pricing", productId],
    queryFn: () => api<Versions>(`/admin/catalogue/products/${productId}/pricing`),
  });
  const list = versions.data?.versions ?? [];
  const published = list.find((v) => v.status === "PUBLISHED");
  const draft = list.find((v) => v.status === "DRAFT");
  const scheduled = list.find((v) => v.status === "SCHEDULED");
  const shownId = versionId ?? draft?.id ?? scheduled?.id ?? published?.id ?? null;

  const createDraft = useMutation({
    mutationFn: () => api<Version>(`/admin/catalogue/products/${productId}/pricing/drafts`, { method: "POST" }),
    onSuccess: (v) => {
      setNotice({
        tone: "success",
        text: published
          ? `Draft v${v.versionNo} started from the published prices.`
          : `Draft v${v.versionNo} started. Enter every price before publishing.`,
      });
      void client.invalidateQueries({ queryKey: ["pricing", productId] });
      void client.invalidateQueries({ queryKey: ["products"] });
      onVersion(v.id);
    },
    onError: (e) => {
      if (e instanceof ApiError && (e.code === "DRAFT_EXISTS" || e.code === "VERSION_SCHEDULED"))
        onVersion(String(e.extra.versionId));
      setNotice({ tone: "error", text: errText(e) });
    },
  });

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Pricing · {versions.data?.product.name ?? "…"}</h1>
          <p className="t-body-s muted">
            Only one published version is active at a time. Carts and quotes keep the price they were given; checkout
            re-prices with the customer's confirmation.
          </p>
        </div>
        {can("pricing.write") && versions.data ? (
          draft ? (
            <button type="button" className="btn btn-primary" onClick={() => onVersion(draft.id)}>
              Edit draft v{draft.versionNo}
            </button>
          ) : scheduled ? (
            <button type="button" className="btn btn-secondary" onClick={() => onVersion(scheduled.id)}>
              Scheduled v{scheduled.versionNo}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              disabled={createDraft.isPending}
              onClick={() => createDraft.mutate()}
            >
              {published ? `New draft from v${published.versionNo}` : "Start pricing"}
            </button>
          )
        ) : null}
      </div>
      {notice ? <p className={`alert alert-${notice.tone}`}>{notice.text}</p> : null}
      {versions.error ? <p className="alert alert-error">{errText(versions.error)}</p> : null}

      <table className="table">
        <thead>
          <tr>
            <th>Version</th>
            <th>Status</th>
            <th>Effective from</th>
            <th>Published by</th>
            <th>Change summary</th>
            <th>
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {list.map((v) => (
            <tr key={v.id} aria-current={v.id === shownId ? "true" : undefined}>
              <td>
                <strong>v{v.versionNo}</strong>
              </td>
              <td>
                <span className={STATUS[v.status][0]}>{STATUS[v.status][1]}</span>
              </td>
              <td>
                {v.status === "DRAFT"
                  ? "—"
                  : v.status === "SCHEDULED"
                    ? dateTimeText(v.effectiveFrom)
                    : dateText(v.effectiveFrom)}
              </td>
              <td>{v.publishedAt ? `${v.publishedBy ?? "Seed data"} · ${dateText(v.publishedAt)}` : "—"}</td>
              <td>{v.note ?? (isReferenceSource(v.source) ? "Reference rates (D-08)" : "—")}</td>
              <td>
                <button type="button" className="link" onClick={() => onVersion(v.id)}>
                  {v.status === "DRAFT" && can("pricing.write") ? "Edit" : "View"}
                  <span className="visually-hidden"> v{v.versionNo}</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {shownId ? (
        <VersionView
          key={`${shownId}-${list.find((v) => v.id === shownId)?.status ?? ""}`}
          versionId={shownId}
          publishedId={published?.id ?? null}
          onDone={(text) => {
            setNotice({ tone: "success", text });
            client.removeQueries({ queryKey: ["pricing-version"] });
            client.removeQueries({ queryKey: ["pricing-diff"] });
            void client.invalidateQueries({ queryKey: ["pricing", productId] });
            void client.invalidateQueries({ queryKey: ["products"] });
            onVersion(null);
          }}
        />
      ) : null}
    </>
  );
}

// ---------- AD-PRC-02 · Draft editor (read-only for published/archived) ----------

function VersionView({
  versionId,
  publishedId,
  onDone,
}: {
  versionId: string;
  publishedId: string | null;
  onDone: (text: string) => void;
}) {
  const { can } = useSession();
  const client = useQueryClient();
  const version = useQuery({
    queryKey: ["pricing-version", versionId],
    queryFn: () => api<Version>(`/admin/catalogue/pricing/${versionId}`),
  });
  const v = version.data;
  const editable = !!v && v.status === "DRAFT" && can("pricing.write");
  const [doc, setDoc] = useState<PricingDocument | null>(null);
  const [note, setNote] = useState("");
  const [notice, setNotice] = useState<Notice>(null);
  const [publishing, setPublishing] = useState(false);
  const [tested, setTested] = useState(false);
  useEffect(() => {
    if (v) {
      setDoc(v.document);
      setNote(v.note ?? "");
    }
  }, [v]);
  const dirty = !!v && !!doc && (JSON.stringify(doc) !== JSON.stringify(v.document) || note !== (v.note ?? ""));
  const diff = useQuery({
    queryKey: ["pricing-diff", versionId, v?.document],
    queryFn: () => api<Diff>(`/admin/catalogue/pricing/${versionId}/diff`),
    enabled: !!v && v.id !== publishedId,
  });

  const unschedule = useMutation({
    mutationFn: () => api<Version>(`/admin/catalogue/pricing/${versionId}/unschedule`, { method: "POST" }),
    onSuccess: () => onDone(`Schedule cancelled — v${v?.versionNo} is a draft again.`),
    onError: (e) => setNotice({ tone: "error", text: errText(e) }),
  });
  const save = useMutation({
    mutationFn: () =>
      api<Version>(`/admin/catalogue/pricing/${versionId}`, {
        method: "PUT",
        body: { document: doc, note: note.trim() || null },
      }),
    onSuccess: (saved) => {
      client.setQueryData(["pricing-version", versionId], saved);
      void client.invalidateQueries({ queryKey: ["pricing", saved.productId] });
      setTested(false);
      setNotice({ tone: "success", text: "Draft saved." });
    },
    onError: (e) => setNotice({ tone: "error", text: errText(e) }),
  });
  const discard = useMutation({
    mutationFn: () => api(`/admin/catalogue/pricing/${versionId}`, { method: "DELETE" }),
    onSuccess: () => onDone(`Draft v${v?.versionNo} discarded.`),
    onError: (e) => setNotice({ tone: "error", text: errText(e) }),
  });

  if (version.error) return <p className="alert alert-error">{errText(version.error)}</p>;
  if (!v || !doc) return <p className="muted">Loading…</p>;
  const product = v.product;
  const unit = product.unitMany;

  return (
    <section className="stack" aria-labelledby="version-title">
      <div className="page-header">
        <div>
          <h2 id="version-title" className="t-h3">
            {v.status === "DRAFT" ? (editable ? "Edit" : "View") : "View"} v{v.versionNo} (
            {STATUS[v.status][1].toLowerCase()}) · {product.name}
          </h2>
          <p className="t-body-s muted">Quantity tiers with option components. Money is in rupees, before GST.</p>
        </div>
        {editable ? (
          <div className="row">
            <button
              type="button"
              className="btn btn-ghost"
              disabled={discard.isPending}
              onClick={() => {
                if (window.confirm(`Discard draft v${v.versionNo}? This can't be undone.`)) discard.mutate();
              }}
            >
              Discard draft
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              Save draft
            </button>
            {can("pricing.publish") ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={dirty}
                title={dirty ? "Save the draft first" : undefined}
                onClick={() => setPublishing(true)}
              >
                Publish…
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
      {notice ? <p className={`alert alert-${notice.tone}`}>{notice.text}</p> : null}
      {dirty ? <p className="alert alert-info">Unsaved changes. Save the draft to test or publish them.</p> : null}
      {v.status === "SCHEDULED" ? (
        <div className="alert alert-info row" style={{ justifyContent: "space-between" }}>
          <span>
            Scheduled: goes live on <strong>{dateTimeText(v.effectiveFrom)}</strong>. Until then the current version
            stays live.
          </span>
          {can("pricing.publish") ? (
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={unschedule.isPending}
              onClick={() => unschedule.mutate()}
            >
              Cancel schedule
            </button>
          ) : null}
        </div>
      ) : null}
      {v.status === "DRAFT" && !publishedId ? (
        <p className="alert alert-info">
          New pricing: enter every tier price and option price before publishing. A tier priced at 0.00 can't be
          published.
        </p>
      ) : null}

      <div className="layout-split">
        <TiersCard doc={doc} setDoc={setDoc} editable={editable} unit={unit} product={product} />
        <div className="stack">
          <section className="card" aria-labelledby="source-title">
            <h3 id="source-title" className="t-h4">
              About this version
            </h3>
            <div className="field">
              <label htmlFor="doc-source">Where the figures come from</label>
              <input
                id="doc-source"
                disabled={!editable}
                value={doc.source}
                onChange={(e) => setDoc({ ...doc, source: e.target.value })}
              />
              {isReferenceSource(doc.source) ? (
                <span>
                  <span className="badge badge-warning">Researched market rates — review before you publish</span>
                </span>
              ) : null}
            </div>
            <div className="field">
              <label htmlFor="doc-note">Change summary</label>
              <input
                id="doc-note"
                disabled={!editable}
                placeholder="e.g. +4% paper costs"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="doc-quote">Bulk quotation from ({unit})</label>
              <input
                id="doc-quote"
                type="number"
                min={1}
                disabled={!editable}
                value={doc.quoteFromQty ?? ""}
                onChange={(e) => setDoc({ ...doc, quoteFromQty: e.target.value ? Number(e.target.value) : undefined })}
              />
              <span className="hint">
                At or above this quantity the site shows “Request bulk quote”. Leave empty for none.
              </span>
            </div>
            <ExtrasFields doc={doc} setDoc={setDoc} editable={editable} />
          </section>
        </div>
      </div>

      <OptionPricesCard doc={doc} setDoc={setDoc} editable={editable} product={product} />

      {diff.data?.against ? <DiffCard diff={diff.data} versionNo={v.versionNo} /> : null}

      <TestBench
        key={`${v.id}-${v.document.tiers[0]?.minQty}`}
        version={v}
        publishedId={publishedId}
        disabled={dirty}
        onRun={() => setTested(true)}
      />

      {publishing ? (
        <PublishDialog
          version={v}
          diff={diff.data ?? null}
          tested={tested}
          onClose={() => setPublishing(false)}
          onPublished={(at) => {
            setPublishing(false);
            onDone(
              at
                ? `Pricing v${v.versionNo} for ${product.name} is scheduled for ${dateTimeText(at)}.`
                : `Pricing v${v.versionNo} for ${product.name} is now live.`,
            );
          }}
        />
      ) : null}
    </section>
  );
}

const money = (value: string) => value.trim();

function TiersCard({
  doc,
  setDoc,
  editable,
  unit,
  product,
}: {
  doc: PricingDocument;
  setDoc: (d: PricingDocument) => void;
  editable: boolean;
  unit: string;
  product: ProductDetail;
}) {
  const setTier = (i: number, patch: Partial<PricingDocument["tiers"][number]>) =>
    setDoc({ ...doc, tiers: doc.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  return (
    <section className="card" aria-labelledby="tiers-title">
      <h3 id="tiers-title" className="t-h4">
        Quantity tiers (unit price, ₹)
      </h3>
      <p className="t-body-s muted">
        The first tier is the minimum order. A quantity uses the highest tier at or below it
        {product.quantityMode === "SIZES" ? " (all sizes added together)" : ""}.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>From ({unit})</th>
            <th>Unit price (₹)</th>
            <th>Order total at that quantity</th>
            {editable ? (
              <th>
                <span className="visually-hidden">Remove</span>
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {doc.tiers.map((tier, i) => (
            <tr key={i}>
              <td>
                <input
                  className="cell-input"
                  type="number"
                  min={1}
                  aria-label={`Tier ${i + 1} minimum quantity`}
                  disabled={!editable}
                  value={tier.minQty}
                  onChange={(e) => setTier(i, { minQty: Number(e.target.value) })}
                />
              </td>
              <td>
                <input
                  className="cell-input"
                  inputMode="decimal"
                  aria-label={`Tier ${i + 1} unit price`}
                  disabled={!editable}
                  value={tier.unitPrice}
                  onChange={(e) => setTier(i, { unitPrice: money(e.target.value) })}
                />
              </td>
              <td className="muted">
                {Number.isFinite(Number(tier.unitPrice))
                  ? rupees((Number(tier.unitPrice) * tier.minQty).toFixed(2))
                  : "—"}
              </td>
              {editable ? (
                <td>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    aria-label={`Remove tier ${i + 1}`}
                    disabled={doc.tiers.length === 1}
                    onClick={() => setDoc({ ...doc, tiers: doc.tiers.filter((_, j) => j !== i) })}
                  >
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {editable ? (
        <div className="row">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => {
              const last = doc.tiers[doc.tiers.length - 1];
              setDoc({ ...doc, tiers: [...doc.tiers, { minQty: last.minQty * 2, unitPrice: last.unitPrice }] });
            }}
          >
            <Plus size={16} aria-hidden="true" /> Add tier
          </button>
        </div>
      ) : null}
    </section>
  );
}

function ExtrasFields({
  doc,
  setDoc,
  editable,
}: {
  doc: PricingDocument;
  setDoc: (d: PricingDocument) => void;
  editable: boolean;
}) {
  return (
    <>
      {doc.setupCharges.map((charge, i) => (
        <div key={charge.label} className="field">
          <label htmlFor={`setup-${i}`}>Setup: {charge.label} (₹ per colour per location)</label>
          <input
            id={`setup-${i}`}
            inputMode="decimal"
            disabled={!editable}
            value={charge.amount}
            onChange={(e) =>
              setDoc({
                ...doc,
                setupCharges: doc.setupCharges.map((c, j) => (j === i ? { ...c, amount: money(e.target.value) } : c)),
              })
            }
          />
          <span className="hint">Up to {charge.maxColours} colours per location.</span>
        </div>
      ))}
      {doc.sizeSurcharge ? (
        <div className="field">
          <label htmlFor="size-surcharge">
            {doc.sizeSurcharge.label} (₹ per piece, sizes {doc.sizeSurcharge.sizes.join(", ")})
          </label>
          <input
            id="size-surcharge"
            inputMode="decimal"
            disabled={!editable}
            value={doc.sizeSurcharge.perUnit}
            onChange={(e) =>
              setDoc({ ...doc, sizeSurcharge: { ...doc.sizeSurcharge!, perUnit: money(e.target.value) } })
            }
          />
        </div>
      ) : null}
    </>
  );
}

const COMPONENTS: [keyof OptionPrice, string, string][] = [
  ["perUnit", "+ per unit", "Added to each unit"],
  ["unitPrice", "Unit price instead", "Replaces the tier price"],
  ["perOrder", "+ per order", "Added once"],
];

function OptionPricesCard({
  doc,
  setDoc,
  editable,
  product,
}: {
  doc: PricingDocument;
  setDoc: (d: PricingDocument) => void;
  editable: boolean;
  product: ProductDetail;
}) {
  const setComponent = (group: string, option: string, comp: keyof OptionPrice, value: string) => {
    const current = { ...(doc.options[group]?.[option] ?? {}) };
    if (value.trim()) current[comp] = value.trim();
    else delete current[comp];
    const groupPrices = { ...(doc.options[group] ?? {}) };
    if (Object.keys(current).length) groupPrices[option] = current;
    else delete groupPrices[option];
    const options = { ...doc.options };
    if (Object.keys(groupPrices).length) options[group] = groupPrices;
    else delete options[group];
    setDoc({ ...doc, options });
  };
  return (
    <section className="card" aria-labelledby="components-title">
      <h3 id="components-title" className="t-h4">
        Option prices (₹)
      </h3>
      <p className="t-body-s muted">Leave a box empty when the option costs nothing extra.</p>
      <table className="table">
        <thead>
          <tr>
            <th>Option</th>
            {COMPONENTS.map(([key, label, hint]) => (
              <th key={key} title={hint}>
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {product.optionGroups.flatMap((group) => [
            <tr key={group.id} className="table-group">
              <th colSpan={4} scope="colgroup">
                {group.label}
              </th>
            </tr>,
            ...group.options.map((option) => (
              <tr key={option.id}>
                <td>
                  {option.label}
                  {!option.isAvailable ? <span className="muted"> · not orderable online</span> : null}
                </td>
                {COMPONENTS.map(([comp]) => (
                  <td key={comp}>
                    <input
                      className="cell-input"
                      inputMode="decimal"
                      aria-label={`${group.label}: ${option.label} ${comp}`}
                      disabled={!editable}
                      value={doc.options[group.key]?.[option.key]?.[comp] ?? ""}
                      onChange={(e) => setComponent(group.key, option.key, comp, e.target.value)}
                    />
                  </td>
                ))}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </section>
  );
}

function DiffCard({ diff, versionNo }: { diff: Diff; versionNo: number }) {
  const [all, setAll] = useState(false);
  const changed = diff.rows.filter((r) => r.change);
  const rows = all ? diff.rows : changed;
  return (
    <section className="card" aria-labelledby="diff-title">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h3 id="diff-title" className="t-h4">
          Diff · v{diff.against!.versionNo} → v{versionNo}
        </h3>
        <label className="check">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          <span>Show unchanged</span>
        </label>
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Component</th>
            <th>v{diff.against!.versionNo} (live)</th>
            <th>v{versionNo}</th>
            <th>Change</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.component}>
              <td>{r.label}</td>
              <td>{r.component === "quoteFromQty" ? (r.before ?? "—") : rupees(r.before)}</td>
              <td>{r.component === "quoteFromQty" ? (r.after ?? "—") : rupees(r.after)}</td>
              <td>{r.change ?? "—"}</td>
            </tr>
          ))}
          {!rows.length ? (
            <tr>
              <td colSpan={4} className="muted">
                No changes from the live version yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </section>
  );
}

// ---------- AD-PRC-03 · Test bench ----------

type BenchConfig = { selections: Record<string, string | string[]>; quantity: number; sizes: Record<string, number> };

function defaultConfig(product: ProductDetail, doc: PricingDocument): BenchConfig {
  const selections: Record<string, string | string[]> = {};
  for (const g of product.optionGroups) {
    const available = g.options.filter((o) => o.isAvailable).map((o) => o.key);
    const defaults = g.defaultKeys.filter((k) => available.includes(k));
    if (g.kind === "MULTISELECT") selections[g.key] = defaults;
    else selections[g.key] = defaults[0] ?? available[0] ?? "";
  }
  const minimum = doc.tiers[0].minQty;
  const sizes = Object.fromEntries(product.sizes.map((s, i) => [s, i === 0 ? minimum : 0]));
  return { selections, quantity: minimum, sizes };
}

function TestBench({
  version,
  publishedId,
  disabled,
  onRun,
}: {
  version: Version;
  publishedId: string | null;
  disabled: boolean;
  onRun: () => void;
}) {
  const product = version.product;
  const [config, setConfig] = useState(() => defaultConfig(product, version.document));
  const [colours, setColours] = useState<Record<string, number>>({});
  const compare = publishedId && publishedId !== version.id ? publishedId : null;
  const body = useMemo(
    () => ({
      selections: config.selections,
      ...(product.quantityMode === "SIZES" ? { sizes: config.sizes } : { quantity: config.quantity }),
      ...(Object.keys(colours).length ? { colours } : {}),
    }),
    [config, colours, product.quantityMode],
  );
  const run = useMutation({
    mutationFn: async () => {
      const mine = await api<PriceResult>(`/admin/catalogue/pricing/${version.id}/test`, { method: "POST", body });
      const live = compare
        ? await api<PriceResult>(`/admin/catalogue/pricing/${compare}/test`, { method: "POST", body })
        : null;
      return { mine, live };
    },
    onSuccess: onRun,
  });
  const setSel = (group: string, value: string | string[]) =>
    setConfig((c) => ({ ...c, selections: { ...c.selections, [group]: value } }));
  const colourGroups = new Set(version.document.setupCharges.map((c) => c.group));

  return (
    <section className="card" aria-labelledby="bench-title">
      <h3 id="bench-title" className="t-h4">
        Test bench · price a configuration with v{version.versionNo}
        {compare ? " and the live version" : ""}
      </h3>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          run.mutate();
        }}
      >
        <div className="grid-2">
          {product.optionGroups.map((g) =>
            g.kind === "MULTISELECT" ? (
              <fieldset key={g.id} className="field">
                <legend className="label">{g.label}</legend>
                <div className="row">
                  {g.options.map((o) => {
                    const list = (config.selections[g.key] as string[]) ?? [];
                    const on = list.includes(o.key);
                    return (
                      <span key={o.id} className="row" style={{ gap: 6 }}>
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) =>
                              setSel(g.key, e.target.checked ? [...list, o.key] : list.filter((k) => k !== o.key))
                            }
                          />
                          <span>{o.label}</span>
                        </label>
                        {on && colourGroups.has(g.key) ? (
                          <input
                            className="cell-input"
                            style={{ width: 64 }}
                            type="number"
                            min={1}
                            aria-label={`Colours for ${o.label}`}
                            value={colours[o.key] ?? 1}
                            onChange={(e) => setColours({ ...colours, [o.key]: Number(e.target.value) })}
                          />
                        ) : null}
                      </span>
                    );
                  })}
                </div>
              </fieldset>
            ) : (
              <div key={g.id} className="field">
                <label htmlFor={`bench-${g.key}`}>{g.label}</label>
                <select
                  id={`bench-${g.key}`}
                  value={(config.selections[g.key] as string) ?? ""}
                  onChange={(e) => setSel(g.key, e.target.value)}
                >
                  {g.options.map((o) => (
                    <option key={o.id} value={o.key}>
                      {o.label}
                      {o.isAvailable ? "" : " (not orderable online)"}
                    </option>
                  ))}
                </select>
              </div>
            ),
          )}
          {product.quantityMode === "SIZES" ? (
            <fieldset className="field" style={{ gridColumn: "1 / -1" }}>
              <legend className="label">Pieces per size</legend>
              <div className="row">
                {product.sizes.map((s) => (
                  <label key={s} className="row" style={{ gap: 6 }}>
                    <span className="t-body-s">{s}</span>
                    <input
                      className="cell-input"
                      style={{ width: 72 }}
                      type="number"
                      min={0}
                      value={config.sizes[s] ?? 0}
                      onChange={(e) => setConfig((c) => ({ ...c, sizes: { ...c.sizes, [s]: Number(e.target.value) } }))}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          ) : (
            <div className="field">
              <label htmlFor="bench-qty">Quantity ({product.unitMany})</label>
              <input
                id="bench-qty"
                type="number"
                min={1}
                value={config.quantity}
                onChange={(e) => setConfig((c) => ({ ...c, quantity: Number(e.target.value) }))}
              />
            </div>
          )}
        </div>
        <div className="row">
          <button type="submit" className="btn btn-primary" disabled={disabled || run.isPending}>
            Run test
          </button>
          {disabled ? <span className="t-body-s muted">Save the draft to test your latest changes.</span> : null}
        </div>
      </form>
      {run.error ? <p className="alert alert-error">{errText(run.error)}</p> : null}
      {run.data ? (
        <div className={compare ? "grid-2" : undefined}>
          <PriceSummary title={`v${version.versionNo}`} result={run.data.mine} />
          {run.data.live ? <PriceSummary title="Live version" result={run.data.live} /> : null}
        </div>
      ) : null}
    </section>
  );
}

function PriceSummary({ title, result }: { title: string; result: PriceResult }) {
  return (
    <div className="stack" aria-label={`${title} result`}>
      <strong>{title}</strong>
      {!result.valid ? (
        <ul className="alert alert-error">
          {result.errors.map((e) => (
            <li key={`${e.field}-${e.code}`}>{e.message}</li>
          ))}
        </ul>
      ) : result.requiresQuote ? (
        <p className="alert alert-info">This quantity is priced by bulk quotation.</p>
      ) : (
        <table className="table">
          <tbody>
            {result.lines.map((l) => (
              <tr key={l.code + l.label}>
                <td>{l.label}</td>
                <td className="num">{rupees(l.amount)}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">Subtotal</th>
              <td className="num">{rupees(result.subtotal)}</td>
            </tr>
            <tr>
              <td>GST {Number(result.gstRate)}%</td>
              <td className="num">{rupees(result.gst)}</td>
            </tr>
            <tr>
              <th scope="row">Total</th>
              <td className="num">
                <strong>{rupees(result.total)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------- AD-PRC-02b · Publish confirm ----------

function PublishDialog({
  version,
  diff,
  tested,
  onClose,
  onPublished,
}: {
  version: Version;
  diff: Diff | null;
  tested: boolean;
  onClose: () => void;
  onPublished: (scheduledFor: string | null) => void;
}) {
  const [confirmed, setConfirmed] = useState(tested);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [at, setAt] = useState("");
  const atIso = at ? new Date(at).toISOString() : null;
  const publish = useMutation({
    mutationFn: () =>
      api(`/admin/catalogue/pricing/${version.id}/publish`, {
        method: "POST",
        body: when === "later" && atIso ? { effectiveFrom: atIso } : {},
      }),
    onSuccess: () => onPublished(when === "later" ? atIso : null),
  });
  const minLocal = (() => {
    const d = new Date(Date.now() + 5 * 60_000);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  })();
  const changed = diff?.rows.filter((r) => r.change) ?? [];
  const tiers = changed.filter((r) => r.component.startsWith("tier.")).length;
  const options = changed.filter((r) => r.component.startsWith("option.")).length;
  const other = changed.length - tiers - options;
  const largest = changed
    .filter((r) => /^[+-]?\d/.test(r.change ?? ""))
    .sort((a, b) => Math.abs(parseFloat(b.change!)) - Math.abs(parseFloat(a.change!)))[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="scrim" onClick={onClose}>
      <div
        className="dialog dialog-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="publish-title" className="t-h4">
          Publish pricing v{version.versionNo} for {version.product.name}?
        </h2>
        <p className="t-body-s">
          New carts and checkouts use v{version.versionNo} straight away. Customers with items already in their cart see
          the price change before they pay.
        </p>
        <dl className="summary">
          <dt>Changes</dt>
          <dd>
            {!diff?.against
              ? "First prices for this product"
              : changed.length
                ? [
                    tiers ? `${tiers} tier ${tiers === 1 ? "price" : "prices"}` : null,
                    options ? `${options} option ${options === 1 ? "price" : "prices"}` : null,
                    other ? `${other} other` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "None — same prices as live"}
          </dd>
          {largest ? (
            <>
              <dt>Largest change</dt>
              <dd>
                {largest.label}: {rupees(largest.before)} → {rupees(largest.after)} ({largest.change})
              </dd>
            </>
          ) : null}
          <dt>Applies to</dt>
          <dd>New carts and checkouts from the moment it goes live</dd>
        </dl>
        {isReferenceSource(version.document.source) ? (
          <p className="alert alert-info">
            These figures are researched market rates (D-08), not confirmed business prices.
          </p>
        ) : null}
        <label className="check">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          <span>I've run the test bench and reviewed the changes</span>
        </label>
        <fieldset className="field">
          <legend className="label">When</legend>
          <div className="row">
            <label className="check">
              <input type="radio" name="publish-when" checked={when === "now"} onChange={() => setWhen("now")} />
              <span>Publish now</span>
            </label>
            <label className="check">
              <input type="radio" name="publish-when" checked={when === "later"} onChange={() => setWhen("later")} />
              <span>Schedule for a date</span>
            </label>
          </div>
          {when === "later" ? (
            <>
              <input
                type="datetime-local"
                aria-label="Goes live at"
                min={minLocal}
                value={at}
                onChange={(e) => setAt(e.target.value)}
              />
              <span className="hint">
                Your computer’s local time. It goes live on the first catalogue visit after this time.
              </span>
            </>
          ) : null}
        </fieldset>
        {publish.error ? <p className="alert alert-error">{errText(publish.error)}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!confirmed || publish.isPending || (when === "later" && !at)}
            onClick={() => publish.mutate()}
          >
            {when === "later" ? "Schedule" : "Publish"} v{version.versionNo}
          </button>
        </div>
        <p className="t-body-s muted">
          Publishing asks for a fresh authenticator code and is recorded in the <Link to="/audit">audit log</Link>.
        </p>
      </div>
    </div>
  );
}
