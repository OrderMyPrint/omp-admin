import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api } from "../lib/api";
import {
  errText,
  type ArtworkSlot,
  type Category,
  type Option,
  type ProductDetail,
  type ProductRow,
  type UploadTiming,
} from "../lib/catalogue";
import { useSession } from "../lib/session";

type Notice = { tone: "success" | "error"; text: string } | null;
const NoticeBar = ({ notice }: { notice: Notice }) =>
  notice ? (
    <p className={`alert alert-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
    </p>
  ) : null;

/** AD-CAT-01 / 02 / 03 · Products & categories. The API enforces every permission; controls only appear when allowed. */
export function Catalogue() {
  const [params, setParams] = useSearchParams();
  const productId = params.get("product");
  const tab = params.get("tab") === "categories" ? "categories" : "products";
  if (productId) return <ProductEditor id={productId} onBack={() => setParams({})} />;
  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="t-h2">Products &amp; categories</h1>
          <p className="t-body-s muted">
            Product details, options and artwork rules. Prices live in Pricing rules and are versioned.
          </p>
        </div>
      </div>
      <div className="tabs" role="tablist">
        {(
          [
            ["products", "Products"],
            ["categories", "Categories"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === id}
            onClick={() => setParams(id === "products" ? {} : { tab: id })}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "products" ? <ProductsTab onEdit={(id) => setParams({ product: id })} /> : <CategoriesTab />}
    </>
  );
}

// ---------- AD-CAT-02 · Products ----------

function ProductsTab({ onEdit }: { onEdit: (id: string) => void }) {
  const products = useQuery({ queryKey: ["products"], queryFn: () => api<ProductRow[]>("/admin/catalogue/products") });
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const categories = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of products.data ?? []) seen.set(p.category.slug, p.category.name);
    return [...seen];
  }, [products.data]);
  const rows = (products.data ?? []).filter(
    (p) => (!category || p.category.slug === category) && p.name.toLowerCase().includes(q.trim().toLowerCase()),
  );

  return (
    <>
      <p className="t-body-s muted">
        {products.data ? `${products.data.length} product families in ${categories.length} categories` : "Loading…"}
      </p>
      <div className="row" style={{ alignItems: "flex-end" }}>
        <div className="field" style={{ flex: "1 1 320px" }}>
          <label htmlFor="product-search">Search</label>
          <div className="input-icon">
            <Search size={18} aria-hidden="true" />
            <input id="product-search" placeholder="Search products" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
        <div className="field" style={{ flex: "0 1 240px" }}>
          <label htmlFor="product-category">Category</label>
          <select id="product-category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {categories.map(([slug, name]) => (
              <option key={slug} value={slug}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {products.error ? <p className="alert alert-error">{errText(products.error)}</p> : null}
      <table className="table">
        <thead>
          <tr>
            <th>Product</th>
            <th>Category</th>
            <th>Pricing version</th>
            <th>Artwork slots</th>
            <th>Visible</th>
            <th>
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => (
            <tr key={p.id}>
              <td>
                <strong>{p.name}</strong>
              </td>
              <td>{p.category.name}</td>
              <td>
                {p.publishedVersionNo ? `v${p.publishedVersionNo} · published` : "Not published"}
                {p.draftVersionNo ? (
                  <>
                    {" "}
                    <span className="badge badge-warning">Draft v{p.draftVersionNo}</span>
                  </>
                ) : null}
              </td>
              <td>{p.artworkSlots.join(", ") || "—"}</td>
              <td>
                {p.isVisible ? (
                  <span className="badge badge-success">Live</span>
                ) : (
                  <span className="badge">Hidden</span>
                )}
              </td>
              <td>
                <button type="button" className="link" onClick={() => onEdit(p.id)}>
                  Edit<span className="visually-hidden"> {p.name}</span>
                </button>
              </td>
            </tr>
          ))}
          {products.data && !rows.length ? (
            <tr>
              <td colSpan={6} className="muted">
                No products match.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </>
  );
}

// ---------- AD-CAT-01 · Categories ----------

type CategoryForm = { slug: string; name: string; summary: string; lead: string; about: string; isVisible: boolean };
const emptyCategory: CategoryForm = { slug: "", name: "", summary: "", lead: "", about: "", isVisible: false };

function CategoriesTab() {
  const { can } = useSession();
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/admin/catalogue/categories"),
  });
  const [selected, setSelected] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<CategoryForm>(emptyCategory);
  const [notice, setNotice] = useState<Notice>(null);
  const write = can("catalogue.write");
  const publish = can("catalogue.publish");
  const list = categories.data ?? [];
  const current = list.find((c) => c.id === selected);

  useEffect(() => {
    if (selected === null && list.length) setSelected(list[0].id);
  }, [selected, list]);
  useEffect(() => {
    if (selected === "new") setForm(emptyCategory);
    else if (current)
      setForm({
        slug: current.slug,
        name: current.name,
        summary: current.summary,
        lead: current.lead,
        about: current.about,
        isVisible: current.isVisible,
      });
  }, [selected, current]);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["categories"] });
    void client.invalidateQueries({ queryKey: ["products"] });
  };
  const save = useMutation({
    mutationFn: () => {
      if (selected === "new")
        return api<Category>("/admin/catalogue/categories", {
          method: "POST",
          body: { slug: form.slug, name: form.name, summary: form.summary, lead: form.lead, about: form.about },
        });
      const body: Record<string, unknown> = {
        name: form.name,
        summary: form.summary,
        lead: form.lead,
        about: form.about,
      };
      if (current && form.isVisible !== current.isVisible) body.isVisible = form.isVisible;
      return api<Category>(`/admin/catalogue/categories/${selected}`, { method: "PATCH", body });
    },
    onSuccess: (saved) => {
      setNotice({ tone: "success", text: selected === "new" ? "Category created (hidden until shown)." : "Saved." });
      setSelected(saved.id);
      refresh();
    },
    onError: (e) => setNotice({ tone: "error", text: errText(e) }),
  });
  const reorder = useMutation({
    mutationFn: (ids: string[]) =>
      api<Category[]>("/admin/catalogue/categories/order", { method: "PUT", body: { ids } }),
    onSuccess: refresh,
    onError: (e) => setNotice({ tone: "error", text: errText(e) }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/admin/catalogue/categories/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      setNotice({ tone: "success", text: "Category deleted." });
      setSelected(null);
      refresh();
    },
    onError: (e) => setNotice({ tone: "error", text: errText(e) }),
  });

  const move = (index: number, by: -1 | 1) => {
    const ids = list.map((c) => c.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id);
    reorder.mutate(ids);
  };
  const set = (patch: Partial<CategoryForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <>
      {write ? (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-primary" onClick={() => setSelected("new")}>
            New category
          </button>
        </div>
      ) : null}
      <NoticeBar notice={notice} />
      {categories.error ? <p className="alert alert-error">{errText(categories.error)}</p> : null}
      <div className="layout-split">
        <section className="card" aria-labelledby="cat-list-title">
          <h2 id="cat-list-title" className="t-h4">
            Categories
          </h2>
          <p className="t-body-s muted">The order used in the menu and on the homepage.</p>
          <ul className="pick-list">
            {list.map((c, i) => (
              <li key={c.id}>
                <button
                  type="button"
                  className="pick"
                  aria-current={c.id === selected ? "true" : undefined}
                  onClick={() => setSelected(c.id)}
                >
                  <span>
                    <strong>{c.name}</strong>
                    <span className="mono">
                      {c.productCount} {c.productCount === 1 ? "product" : "products"} · /category/{c.slug}
                    </span>
                  </span>
                  {c.isVisible ? (
                    <span className="badge badge-success">Visible</span>
                  ) : (
                    <span className="badge">Hidden</span>
                  )}
                </button>
                {write ? (
                  <span className="pick-actions">
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Move ${c.name} up`}
                      disabled={i === 0 || reorder.isPending}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Move ${c.name} down`}
                      disabled={i === list.length - 1 || reorder.isPending}
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>

        {selected ? (
          <form
            className="card"
            aria-labelledby="cat-edit-title"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div>
              <h2 id="cat-edit-title" className="t-h4">
                {selected === "new" ? "New category" : current?.name}
              </h2>
              <p className="t-body-s muted">{selected === "new" ? "Starts hidden." : "Edit category"}</p>
            </div>
            <div className="field">
              <label htmlFor="cat-name">Name</label>
              <input
                id="cat-name"
                required
                disabled={!write}
                value={form.name}
                onChange={(e) => set({ name: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cat-slug">URL slug</label>
              <input
                id="cat-slug"
                required
                pattern="[a-z0-9]+(-[a-z0-9]+)*"
                readOnly={selected !== "new"}
                value={form.slug}
                onChange={(e) => set({ slug: e.target.value })}
              />
              <span className="hint">
                {selected === "new"
                  ? "Lower-case words joined by dashes, e.g. business-stationery. It can't be changed later yet."
                  : "Slug changes come with redirects in a later release — website pages link to this category by its slug."}
              </span>
            </div>
            <div className="field">
              <label htmlFor="cat-summary">Menu summary</label>
              <input
                id="cat-summary"
                required
                disabled={!write}
                value={form.summary}
                onChange={(e) => set({ summary: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cat-lead">Intro (category page)</label>
              <textarea
                id="cat-lead"
                disabled={!write}
                value={form.lead}
                onChange={(e) => set({ lead: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="cat-about">About (lower on the category page)</label>
              <textarea
                id="cat-about"
                disabled={!write}
                value={form.about}
                onChange={(e) => set({ about: e.target.value })}
              />
            </div>
            {selected !== "new" ? (
              <label className="check">
                <input
                  type="checkbox"
                  checked={form.isVisible}
                  disabled={!publish}
                  onChange={(e) => set({ isVisible: e.target.checked })}
                />
                <span>
                  Visible on the site
                  {!publish ? <span className="hint"> · Needs the “Show / hide products” permission</span> : null}
                </span>
              </label>
            ) : null}
            {write ? (
              <div className="row" style={{ justifyContent: "flex-end" }}>
                {current && current.productCount === 0 ? (
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={remove.isPending}
                    onClick={() => {
                      if (window.confirm(`Delete the category “${current.name}”?`)) remove.mutate(current.id);
                    }}
                  >
                    Delete
                  </button>
                ) : null}
                <button type="submit" className="btn btn-primary" disabled={save.isPending}>
                  {selected === "new" ? "Create category" : "Save category"}
                </button>
              </div>
            ) : null}
            {current && current.productCount > 0 ? (
              <p className="t-body-s muted">A category with products can't be deleted — move its products first.</p>
            ) : null}
          </form>
        ) : null}
      </div>
    </>
  );
}

// ---------- AD-CAT-03 · Product editor ----------

type EditorTab = "details" | "options" | "artwork";

function ProductEditor({ id, onBack }: { id: string; onBack: () => void }) {
  const product = useQuery({
    queryKey: ["product", id],
    queryFn: () => api<ProductDetail>(`/admin/catalogue/products/${id}`),
  });
  const [tab, setTab] = useState<EditorTab>("details");
  const p = product.data;
  return (
    <>
      <div className="page-header">
        <div>
          <button type="button" className="link" onClick={onBack}>
            ← All products
          </button>
          <h1 className="t-h2">{p?.name ?? "Product"}</h1>
          {p ? (
            <p className="t-body-s muted">
              {p.category.name} · /{p.slug}
            </p>
          ) : null}
        </div>
        {p ? (
          <Link className="btn btn-secondary" to={`/pricing?product=${p.id}`}>
            Pricing
          </Link>
        ) : null}
      </div>
      {product.error ? <p className="alert alert-error">{errText(product.error)}</p> : null}
      <div className="tabs" role="tablist">
        {(
          [
            ["details", "Details"],
            ["options", "Options"],
            ["artwork", "Artwork"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {p ? (
        tab === "details" ? (
          <DetailsTab product={p} />
        ) : tab === "options" ? (
          <OptionsTab product={p} />
        ) : (
          <ArtworkTab product={p} />
        )
      ) : (
        <p className="muted">Loading…</p>
      )}
    </>
  );
}

const TIMING: [UploadTiming, string][] = [
  ["EITHER", "Upload now or after checkout"],
  ["BEFORE_CART", "Upload before adding to cart"],
  ["AFTER_CHECKOUT", "Upload after checkout"],
];

function useProductSave(id: string, setNotice: (n: Notice) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body: unknown }) =>
      api<ProductDetail>(path, { method: "PATCH", body }),
    onSuccess: (saved) => {
      client.setQueryData(["product", id], saved);
      void client.invalidateQueries({ queryKey: ["products"] });
      void client.invalidateQueries({ queryKey: ["categories"] });
      setNotice({ tone: "success", text: "Saved." });
    },
    onError: (e) => setNotice({ tone: "error", text: errText(e) }),
  });
}

function DetailsTab({ product }: { product: ProductDetail }) {
  const { can } = useSession();
  const write = can("catalogue.write");
  const publish = can("catalogue.publish");
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/admin/catalogue/categories"),
  });
  const initial = () => ({
    name: product.name,
    summary: product.summary,
    lead: product.lead,
    description: product.description,
    categoryId: product.category.id,
    unitOne: product.unitOne,
    unitMany: product.unitMany,
    turnaroundMinDays: product.turnaroundMinDays,
    turnaroundMaxDays: product.turnaroundMaxDays,
    uploadTiming: product.uploadTiming,
    isVisible: product.isVisible,
  });
  const [form, setForm] = useState(initial);
  const [notice, setNotice] = useState<Notice>(null);
  useEffect(() => setForm(initial()), [product]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useProductSave(product.id, setNotice);
  const set = (patch: Partial<ReturnType<typeof initial>>) => setForm((f) => ({ ...f, ...patch }));

  const submit = () => {
    const body: Record<string, unknown> = {};
    const start = initial();
    for (const [k, v] of Object.entries(form)) if (v !== start[k as keyof typeof start]) body[k] = v;
    if (!Object.keys(body).length) return setNotice({ tone: "success", text: "No changes to save." });
    save.mutate({ path: `/admin/catalogue/products/${product.id}`, body });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="stack"
    >
      <NoticeBar notice={notice} />
      <div className="layout-split">
        <section className="card" aria-labelledby="details-title">
          <h2 id="details-title" className="t-h4">
            Details
          </h2>
          <div className="field">
            <label htmlFor="p-name">Name</label>
            <input
              id="p-name"
              required
              disabled={!write}
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="p-category">Category</label>
            <select
              id="p-category"
              disabled={!write}
              value={form.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
            >
              {(categories.data ?? [product.category]).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="p-summary">Short description</label>
            <input
              id="p-summary"
              required
              disabled={!write}
              value={form.summary}
              onChange={(e) => set({ summary: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="p-lead">Lead (product page intro)</label>
            <textarea id="p-lead" disabled={!write} value={form.lead} onChange={(e) => set({ lead: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="p-description">Description</label>
            <textarea
              id="p-description"
              rows={6}
              disabled={!write}
              value={form.description}
              onChange={(e) => set({ description: e.target.value })}
            />
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="p-unit-one">Quantity unit (one)</label>
              <input
                id="p-unit-one"
                required
                disabled={!write}
                value={form.unitOne}
                onChange={(e) => set({ unitOne: e.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="p-unit-many">Quantity unit (many)</label>
              <input
                id="p-unit-many"
                required
                disabled={!write}
                value={form.unitMany}
                onChange={(e) => set({ unitMany: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="card" aria-labelledby="ordering-title">
          <h2 id="ordering-title" className="t-h4">
            Artwork &amp; ordering
          </h2>
          <div className="field">
            <label htmlFor="p-timing">Artwork timing</label>
            <select
              id="p-timing"
              disabled={!write}
              value={form.uploadTiming}
              onChange={(e) => set({ uploadTiming: e.target.value as UploadTiming })}
            >
              {TIMING.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
          <div className="grid-2">
            <div className="field">
              <label htmlFor="p-tmin">Turnaround from (working days)</label>
              <input
                id="p-tmin"
                type="number"
                min={1}
                max={60}
                disabled={!write}
                value={form.turnaroundMinDays}
                onChange={(e) => set({ turnaroundMinDays: Number(e.target.value) })}
              />
            </div>
            <div className="field">
              <label htmlFor="p-tmax">Turnaround to (working days)</label>
              <input
                id="p-tmax"
                type="number"
                min={1}
                max={60}
                disabled={!write}
                value={form.turnaroundMaxDays}
                onChange={(e) => set({ turnaroundMaxDays: Number(e.target.value) })}
              />
            </div>
          </div>
          <div className="field">
            <span className="label">Tax</span>
            <span className="t-body-s">
              {product.taxProfile.name} · GST {Number(product.taxProfile.gstRate)}%
            </span>
            <span className="hint">Tax profiles are set by Finance once the CA confirms rates (D-28).</span>
          </div>
          <div className="field">
            <span className="label">Pricing</span>
            <span className="t-body-s">
              {product.publishedVersionNo ? `v${product.publishedVersionNo} published` : "No published pricing yet"} ·{" "}
              <Link className="link" to={`/pricing?product=${product.id}`}>
                Open pricing
              </Link>
            </span>
          </div>
          <label className="check">
            <input
              type="checkbox"
              checked={form.isVisible}
              disabled={!publish}
              onChange={(e) => set({ isVisible: e.target.checked })}
            />
            <span>
              Visible on storefront
              {!publish ? <span className="hint"> · Needs the “Show / hide products” permission</span> : null}
            </span>
          </label>
        </section>
      </div>
      {write ? (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-ghost" onClick={() => setForm(initial())}>
            Reset
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            Save changes
          </button>
        </div>
      ) : null}
    </form>
  );
}

function OptionsTab({ product }: { product: ProductDetail }) {
  const [notice, setNotice] = useState<Notice>(null);
  return (
    <div className="stack">
      <p className="t-body-s muted">
        Edit labels and availability. Adding or removing options and constraint rules (AD-CAT-04) comes in the next
        release; option prices are set in Pricing rules.
      </p>
      <NoticeBar notice={notice} />
      {product.optionGroups.map((group) => (
        <section key={group.id} className="card" aria-labelledby={`group-${group.id}`}>
          <div className="row" style={{ justifyContent: "space-between" }}>
            <h2 id={`group-${group.id}`} className="t-h4">
              {group.label}
            </h2>
            <span className="mono">
              {group.kind === "MULTISELECT" ? "Pick any" : "Pick one"}
              {group.required ? " · required" : ""}
            </span>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Option</th>
                <th>Detail</th>
                <th>Orderable online</th>
                <th>If not, why</th>
                <th>
                  <span className="visually-hidden">Save</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {group.options.map((option) => (
                <OptionRow key={option.id} productId={product.id} option={option} setNotice={setNotice} />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function OptionRow({
  productId,
  option,
  setNotice,
}: {
  productId: string;
  option: Option;
  setNotice: (n: Notice) => void;
}) {
  const { can } = useSession();
  const write = can("catalogue.write");
  const [label, setLabel] = useState(option.label);
  const [detail, setDetail] = useState(option.detail ?? "");
  const [available, setAvailable] = useState(option.isAvailable);
  const [reason, setReason] = useState(option.unavailableReason ?? "");
  useEffect(() => {
    setLabel(option.label);
    setDetail(option.detail ?? "");
    setAvailable(option.isAvailable);
    setReason(option.unavailableReason ?? "");
  }, [option]);
  const save = useProductSave(productId, setNotice);
  const dirty =
    label !== option.label ||
    detail !== (option.detail ?? "") ||
    available !== option.isAvailable ||
    (!available && reason !== (option.unavailableReason ?? ""));
  return (
    <tr>
      <td>
        <input
          className="cell-input"
          aria-label={`Label for ${option.label}`}
          disabled={!write}
          value={label}
          onChange={(e) => setLabel(e.target.value)}
        />
        <span className="mono">{option.key}</span>
      </td>
      <td>
        <input
          className="cell-input"
          aria-label={`Detail for ${option.label}`}
          disabled={!write}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
        />
      </td>
      <td>
        <label className="check">
          <input
            type="checkbox"
            disabled={!write}
            checked={available}
            onChange={(e) => setAvailable(e.target.checked)}
          />
          <span>{available ? "Yes" : "No"}</span>
        </label>
      </td>
      <td>
        <input
          className="cell-input"
          aria-label={`Reason ${option.label} can't be ordered online`}
          placeholder={available ? "—" : "e.g. Priced on quotation"}
          disabled={!write || available}
          value={available ? "" : reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </td>
      <td>
        {write ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={!dirty || save.isPending}
            onClick={() =>
              save.mutate({
                path: `/admin/catalogue/options/${option.id}`,
                body: {
                  label,
                  detail: detail.trim() || null,
                  isAvailable: available,
                  ...(available ? {} : { unavailableReason: reason.trim() || null }),
                },
              })
            }
          >
            Save
          </button>
        ) : null}
      </td>
    </tr>
  );
}

const FILE_TYPES = ["pdf", "png", "jpg", "jpeg", "svg", "cdr", "ai", "eps", "psd", "tif", "tiff"];

function ArtworkTab({ product }: { product: ProductDetail }) {
  const [notice, setNotice] = useState<Notice>(null);
  return (
    <div className="stack">
      <p className="t-body-s muted">
        Print area, bleed and safe zone per artwork slot, and which files customers can upload. CDR files always go to
        manual pre-press review.
      </p>
      <NoticeBar notice={notice} />
      <div className="layout-split">
        {product.artworkSlots.map((slot) => (
          <SlotCard key={slot.id} productId={product.id} slot={slot} setNotice={setNotice} />
        ))}
      </div>
    </div>
  );
}

function SlotCard({
  productId,
  slot,
  setNotice,
}: {
  productId: string;
  slot: ArtworkSlot;
  setNotice: (n: Notice) => void;
}) {
  const { can } = useSession();
  const write = can("catalogue.write");
  const initial = () => ({
    label: slot.label,
    printArea: slot.printArea,
    bleedMm: slot.bleedMm ?? "",
    safeMm: slot.safeMm ?? "",
    acceptedTypes: slot.acceptedTypes,
    maxMb: slot.maxMb,
  });
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial()), [slot]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useProductSave(productId, setNotice);
  const set = (patch: Partial<ReturnType<typeof initial>>) => setForm((f) => ({ ...f, ...patch }));
  const p = `slot-${slot.id}`;
  return (
    <form
      className="card"
      aria-labelledby={`${p}-title`}
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          path: `/admin/catalogue/artwork-slots/${slot.id}`,
          body: { ...form, bleedMm: form.bleedMm.trim() || null, safeMm: form.safeMm.trim() || null },
        });
      }}
    >
      <h2 id={`${p}-title`} className="t-h4">
        {slot.label}
      </h2>
      <div className="grid-2">
        <div className="field">
          <label htmlFor={`${p}-label`}>Slot name</label>
          <input
            id={`${p}-label`}
            required
            disabled={!write}
            value={form.label}
            onChange={(e) => set({ label: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${p}-area`}>Print area</label>
          <input
            id={`${p}-area`}
            required
            disabled={!write}
            value={form.printArea}
            onChange={(e) => set({ printArea: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${p}-bleed`}>Bleed (mm)</label>
          <input
            id={`${p}-bleed`}
            inputMode="decimal"
            disabled={!write}
            value={form.bleedMm}
            onChange={(e) => set({ bleedMm: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${p}-safe`}>Safe zone (mm)</label>
          <input
            id={`${p}-safe`}
            inputMode="decimal"
            disabled={!write}
            value={form.safeMm}
            onChange={(e) => set({ safeMm: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor={`${p}-max`}>Max file size (MB)</label>
          <input
            id={`${p}-max`}
            type="number"
            min={1}
            max={200}
            disabled={!write}
            value={form.maxMb}
            onChange={(e) => set({ maxMb: Number(e.target.value) })}
          />
        </div>
      </div>
      <fieldset className="field">
        <legend className="label">Accepted file types</legend>
        <div className="row">
          {FILE_TYPES.map((type) => (
            <label key={type} className="check">
              <input
                type="checkbox"
                disabled={!write}
                checked={form.acceptedTypes.includes(type)}
                onChange={(e) =>
                  set({
                    acceptedTypes: e.target.checked
                      ? [...form.acceptedTypes, type]
                      : form.acceptedTypes.filter((t) => t !== type),
                  })
                }
              />
              <span>{type.toUpperCase()}</span>
            </label>
          ))}
        </div>
      </fieldset>
      {write ? (
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !form.acceptedTypes.length}>
            Save slot
          </button>
        </div>
      ) : null}
    </form>
  );
}
