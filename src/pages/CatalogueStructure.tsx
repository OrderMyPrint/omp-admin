import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, ShieldCheck, Trash2, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import {
  errText,
  toKey,
  type Category,
  type OptionGroup,
  type ProductDetail,
  type Rule,
  type TaxProfile,
} from "../lib/catalogue";
import { useSession } from "../lib/session";

export type Notice = { tone: "success" | "error"; text: string } | null;
export const NoticeBar = ({ notice }: { notice: Notice }) =>
  notice ? (
    <p className={`alert alert-${notice.tone}`} role={notice.tone === "error" ? "alert" : "status"}>
      {notice.text}
    </p>
  ) : null;

/** Writes that return the product detail; keeps every catalogue view in step. */
export function useProductWrite(productId: string, setNotice: (n: Notice) => void) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method = "PATCH", body }: { path: string; method?: string; body?: unknown }) =>
      api<ProductDetail>(path, { method, body }),
    onSuccess: (saved) => {
      client.setQueryData(["product", productId], saved);
      void client.invalidateQueries({ queryKey: ["products"] });
      void client.invalidateQueries({ queryKey: ["categories"] });
      setNotice({ tone: "success", text: "Saved." });
    },
    onError: (e) => setNotice({ tone: "error", text: errText(e) }),
  });
}

export function Dialog({
  title,
  onClose,
  children,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const id = `dialog-${toKey(title)}`;
  return (
    <div className="scrim" onClick={onClose}>
      <div
        className={`dialog${wide ? " dialog-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={id}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id={id} className="t-h4">
            {title}
          </h2>
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---------- New product (AD-CAT-02 "New product") ----------

export function NewProductDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const client = useQueryClient();
  const categories = useQuery({
    queryKey: ["categories"],
    queryFn: () => api<Category[]>("/admin/catalogue/categories"),
  });
  const taxes = useQuery({
    queryKey: ["tax-profiles"],
    queryFn: () => api<TaxProfile[]>("/admin/catalogue/tax-profiles"),
  });
  const [form, setForm] = useState({
    name: "",
    slug: "",
    slugTouched: false,
    categoryId: "",
    summary: "",
    unitOne: "",
    unitMany: "",
    quantityMode: "TIERS" as "TIERS" | "SIZES",
    sizes: "",
    taxProfileId: "",
    turnaroundMinDays: "",
    turnaroundMaxDays: "",
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const create = useMutation({
    mutationFn: () =>
      api<ProductDetail>("/admin/catalogue/products", {
        method: "POST",
        body: {
          slug: form.slug,
          name: form.name,
          categoryId: form.categoryId,
          summary: form.summary,
          unitOne: form.unitOne,
          unitMany: form.unitMany,
          quantityMode: form.quantityMode,
          ...(form.quantityMode === "SIZES"
            ? {
                sizes: form.sizes
                  .split(/[,\s]+/)
                  .map((s) => s.trim().toUpperCase())
                  .filter(Boolean),
              }
            : {}),
          taxProfileId: form.taxProfileId,
          turnaroundMinDays: Number(form.turnaroundMinDays),
          turnaroundMaxDays: Number(form.turnaroundMaxDays),
        },
      }),
    onSuccess: (p) => {
      void client.invalidateQueries({ queryKey: ["products"] });
      void client.invalidateQueries({ queryKey: ["categories"] });
      onCreated(p.id);
    },
  });

  return (
    <Dialog title="New product" onClose={onClose} wide>
      <p className="t-body-s muted">
        It stays hidden until it has an image, an artwork slot and published pricing. You'll add options next.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="grid-2">
          <div className="field">
            <label htmlFor="np-name">Name</label>
            <input
              id="np-name"
              required
              value={form.name}
              onChange={(e) =>
                set({ name: e.target.value, ...(form.slugTouched ? {} : { slug: toKey(e.target.value) }) })
              }
            />
          </div>
          <div className="field">
            <label htmlFor="np-slug">URL slug</label>
            <input
              id="np-slug"
              required
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              value={form.slug}
              onChange={(e) => set({ slug: e.target.value, slugTouched: true })}
            />
            <span className="hint">/products/{form.slug || "…"}</span>
          </div>
          <div className="field">
            <label htmlFor="np-category">Category</label>
            <select
              id="np-category"
              required
              value={form.categoryId}
              onChange={(e) => set({ categoryId: e.target.value })}
            >
              <option value="">Choose…</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="np-tax">Tax profile</label>
            <select
              id="np-tax"
              required
              value={form.taxProfileId}
              onChange={(e) => set({ taxProfileId: e.target.value })}
            >
              <option value="">Choose…</option>
              {(taxes.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field" style={{ gridColumn: "1 / -1" }}>
            <label htmlFor="np-summary">Short description</label>
            <input id="np-summary" required value={form.summary} onChange={(e) => set({ summary: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="np-one">Quantity unit (one)</label>
            <input
              id="np-one"
              required
              placeholder="e.g. card"
              value={form.unitOne}
              onChange={(e) => set({ unitOne: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="np-many">Quantity unit (many)</label>
            <input
              id="np-many"
              required
              placeholder="e.g. cards"
              value={form.unitMany}
              onChange={(e) => set({ unitMany: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="np-tmin">Turnaround from (working days)</label>
            <input
              id="np-tmin"
              type="number"
              min={1}
              max={60}
              required
              value={form.turnaroundMinDays}
              onChange={(e) => set({ turnaroundMinDays: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor="np-tmax">Turnaround to (working days)</label>
            <input
              id="np-tmax"
              type="number"
              min={1}
              max={60}
              required
              value={form.turnaroundMaxDays}
              onChange={(e) => set({ turnaroundMaxDays: e.target.value })}
            />
          </div>
          <fieldset className="field" style={{ gridColumn: "1 / -1" }}>
            <legend className="label">How customers enter quantity</legend>
            <div className="row">
              <label className="check">
                <input
                  type="radio"
                  name="np-mode"
                  checked={form.quantityMode === "TIERS"}
                  onChange={() => set({ quantityMode: "TIERS" })}
                />
                <span>One quantity (priced by tiers)</span>
              </label>
              <label className="check">
                <input
                  type="radio"
                  name="np-mode"
                  checked={form.quantityMode === "SIZES"}
                  onChange={() => set({ quantityMode: "SIZES" })}
                />
                <span>Pieces per size (garments)</span>
              </label>
            </div>
          </fieldset>
          {form.quantityMode === "SIZES" ? (
            <div className="field" style={{ gridColumn: "1 / -1" }}>
              <label htmlFor="np-sizes">Sizes, in order</label>
              <input
                id="np-sizes"
                required
                placeholder="XS, S, M, L, XL, 2XL"
                value={form.sizes}
                onChange={(e) => set({ sizes: e.target.value })}
              />
            </div>
          ) : null}
        </div>
        {create.error ? <p className="alert alert-error">{errText(create.error)}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={create.isPending}>
            Create product
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------- AD-CAT-04 · Options & rules ----------

const KIND_LABEL = { SELECT: "Pick one", SWATCH: "Pick one (colour)", MULTISELECT: "Pick any" } as const;

export function OptionsRulesTab({
  product,
  renderOptionRow,
}: {
  product: ProductDetail;
  renderOptionRow: (group: OptionGroup, index: number, setNotice: (n: Notice) => void) => ReactNode;
}) {
  const { can } = useSession();
  const write = can("catalogue.write");
  const [notice, setNotice] = useState<Notice>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [rule, setRule] = useState<Rule | "new" | null>(null);
  const save = useProductWrite(product.id, setNotice);
  const groups = product.optionGroups;
  const current = groups.find((g) => g.id === editing);

  const moveGroup = (index: number, by: -1 | 1) => {
    const ids = groups.map((g) => g.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id);
    save.mutate({ path: `/admin/catalogue/products/${product.id}/option-groups/order`, method: "PUT", body: { ids } });
  };
  const describe = (r: Rule) => {
    const g = (key: string) => groups.find((x) => x.key === key);
    const o = (group: string, key: string) => g(group)?.options.find((x) => x.key === key)?.label ?? key;
    const targets = r.thenOptions.map((k) => o(r.thenGroup, k)).join(" or ");
    return `${g(r.whenGroup)?.label ?? r.whenGroup} = ${o(r.whenGroup, r.whenOption)}  ${
      r.effect === "EXCLUDES" ? "excludes" : "requires"
    }  ${g(r.thenGroup)?.label ?? r.thenGroup} = ${targets}`;
  };

  return (
    <div className="stack">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <p className="t-body-s muted">
          Steps appear in this order on the storefront configurator. Prices are set in Pricing rules.
        </p>
        {write ? (
          <button type="button" className="btn btn-primary" onClick={() => setAddingGroup(true)}>
            Add option group
          </button>
        ) : null}
      </div>
      <NoticeBar notice={notice} />
      <table className="table">
        <thead>
          <tr>
            <th>#</th>
            <th>Option group</th>
            <th>Type</th>
            <th>Values</th>
            <th>Required</th>
            <th>
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g, i) => (
            <tr key={g.id} aria-current={g.id === editing ? "true" : undefined}>
              <td>{i + 1}</td>
              <td>
                <strong>{g.label}</strong>
                <br />
                <span className="mono">{g.key}</span>
              </td>
              <td>{KIND_LABEL[g.kind]}</td>
              <td>
                {g.options.length <= 3 ? g.options.map((o) => o.label).join(", ") || "—" : `${g.options.length} values`}
              </td>
              <td>{g.required ? "Yes" : "No"}</td>
              <td>
                <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                  {write ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        aria-label={`Move ${g.label} up`}
                        disabled={i === 0 || save.isPending}
                        onClick={() => moveGroup(i, -1)}
                      >
                        <ArrowUp size={16} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost btn-icon"
                        aria-label={`Move ${g.label} down`}
                        disabled={i === groups.length - 1 || save.isPending}
                        onClick={() => moveGroup(i, 1)}
                      >
                        <ArrowDown size={16} aria-hidden="true" />
                      </button>
                    </>
                  ) : null}
                  <button type="button" className="link" onClick={() => setEditing(g.id === editing ? null : g.id)}>
                    {g.id === editing ? "Close" : write ? "Edit" : "View"}
                    <span className="visually-hidden"> {g.label}</span>
                  </button>
                </span>
              </td>
            </tr>
          ))}
          {!groups.length ? (
            <tr>
              <td colSpan={6} className="muted">
                No option groups yet. Add the first step customers choose, e.g. size or paper.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {current ? (
        <GroupEditor
          key={current.id}
          productId={product.id}
          group={current}
          setNotice={setNotice}
          onDeleted={() => setEditing(null)}
          renderOptionRow={(index) => renderOptionRow(current, index, setNotice)}
        />
      ) : null}

      <section className="card" aria-labelledby="rules-title">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <h2 id="rules-title" className="t-h4">
            Constraint rules (server-enforced)
          </h2>
          {write ? (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={groups.length < 2}
              title={groups.length < 2 ? "Rules link two option groups" : undefined}
              onClick={() => setRule("new")}
            >
              Add rule
            </button>
          ) : null}
        </div>
        {product.rules.length ? (
          <ul className="rule-list">
            {product.rules.map((r) => (
              <li key={r.id} className="rule">
                <ShieldCheck size={18} aria-hidden="true" className="rule-icon" />
                <span className="rule-text">
                  <strong>{describe(r)}</strong>
                  <span className="t-body-s muted">Message: “{r.message}”</span>
                </span>
                {write ? (
                  <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Edit rule: ${r.message}`}
                      onClick={() => setRule(r)}
                    >
                      <Pencil size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Delete rule: ${r.message}`}
                      onClick={() => {
                        if (window.confirm("Delete this rule?"))
                          save.mutate({ path: `/admin/catalogue/rules/${r.id}`, method: "DELETE" });
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="t-body-s muted">
            No rules. Rules stop combinations that can't be produced, e.g. “Spot UV requires 350 GSM”.
          </p>
        )}
      </section>

      {addingGroup ? (
        <AddGroupDialog
          productId={product.id}
          onClose={() => setAddingGroup(false)}
          onAdded={(p) => {
            setAddingGroup(false);
            setNotice({ tone: "success", text: "Option group added. Add its options below." });
            setEditing(p.optionGroups[p.optionGroups.length - 1]?.id ?? null);
          }}
        />
      ) : null}
      {rule ? (
        <RuleDialog
          product={product}
          rule={rule === "new" ? null : rule}
          onClose={() => setRule(null)}
          onSaved={() => {
            setRule(null);
            setNotice({ tone: "success", text: "Rule saved. The configurator and checkout enforce it." });
          }}
        />
      ) : null}
    </div>
  );
}

function AddGroupDialog({
  productId,
  onClose,
  onAdded,
}: {
  productId: string;
  onClose: () => void;
  onAdded: (p: ProductDetail) => void;
}) {
  const client = useQueryClient();
  const [form, setForm] = useState({
    label: "",
    key: "",
    keyTouched: false,
    hint: "",
    kind: "SELECT" as OptionGroup["kind"],
    required: true,
  });
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const add = useMutation({
    mutationFn: () =>
      api<ProductDetail>(`/admin/catalogue/products/${productId}/option-groups`, {
        method: "POST",
        body: { key: form.key, label: form.label, hint: form.hint, kind: form.kind, required: form.required },
      }),
    onSuccess: (p) => {
      client.setQueryData(["product", productId], p);
      onAdded(p);
    },
  });
  return (
    <Dialog title="Add option group" onClose={onClose}>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <div className="field">
          <label htmlFor="ng-label">Step title</label>
          <input
            id="ng-label"
            required
            placeholder="e.g. Choose paper stock"
            value={form.label}
            onChange={(e) => set({ label: e.target.value, ...(form.keyTouched ? {} : { key: toKey(e.target.value) }) })}
          />
        </div>
        <div className="field">
          <label htmlFor="ng-key">Key</label>
          <input
            id="ng-key"
            required
            pattern="[a-z0-9][a-z0-9\-]*"
            value={form.key}
            onChange={(e) => set({ key: e.target.value, keyTouched: true })}
          />
          <span className="hint">Used by pricing and rules. It can't be changed later.</span>
        </div>
        <div className="field">
          <label htmlFor="ng-hint">Hint under the title</label>
          <input id="ng-hint" value={form.hint} onChange={(e) => set({ hint: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="ng-kind">Type</label>
          <select id="ng-kind" value={form.kind} onChange={(e) => set({ kind: e.target.value as OptionGroup["kind"] })}>
            <option value="SELECT">Pick one</option>
            <option value="SWATCH">Pick one (colour swatches)</option>
            <option value="MULTISELECT">Pick any (e.g. print locations)</option>
          </select>
        </div>
        <label className="check">
          <input type="checkbox" checked={form.required} onChange={(e) => set({ required: e.target.checked })} />
          <span>Customers must choose</span>
        </label>
        {add.error ? <p className="alert alert-error">{errText(add.error)}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={add.isPending}>
            Add group
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function GroupEditor({
  productId,
  group,
  setNotice,
  onDeleted,
  renderOptionRow,
}: {
  productId: string;
  group: OptionGroup;
  setNotice: (n: Notice) => void;
  onDeleted: () => void;
  renderOptionRow: (index: number) => ReactNode;
}) {
  const { can } = useSession();
  const write = can("catalogue.write");
  const save = useProductWrite(productId, setNotice);
  const initial = () => ({
    label: group.label,
    shortLabel: group.shortLabel ?? "",
    hint: group.hint,
    note: group.note ?? "",
    required: group.required,
    defaultKeys: group.defaultKeys,
  });
  const [form, setForm] = useState(initial);
  useEffect(() => setForm(initial()), [group]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (patch: Partial<ReturnType<typeof initial>>) => setForm((f) => ({ ...f, ...patch }));
  const [option, setOption] = useState({ label: "", key: "", keyTouched: false, detail: "", swatch: "#000000" });
  const multi = group.kind === "MULTISELECT";
  const p = `ge-${group.id}`;

  const moveOption = (index: number, by: -1 | 1) => {
    const ids = group.options.map((o) => o.id);
    const [id] = ids.splice(index, 1);
    ids.splice(index + by, 0, id);
    save.mutate({ path: `/admin/catalogue/option-groups/${group.id}/options/order`, method: "PUT", body: { ids } });
  };

  return (
    <section className="card" aria-labelledby={`${p}-title`}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <h2 id={`${p}-title`} className="t-h4">
          {group.label} <span className="mono">· {group.key}</span>
        </h2>
        {write ? (
          <button
            type="button"
            className="btn btn-danger btn-sm"
            disabled={save.isPending}
            onClick={() => {
              if (window.confirm(`Delete the option group “${group.label}” and its options?`))
                save.mutate(
                  { path: `/admin/catalogue/option-groups/${group.id}`, method: "DELETE" },
                  { onSuccess: onDeleted },
                );
            }}
          >
            Delete group
          </button>
        ) : null}
      </div>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({
            path: `/admin/catalogue/option-groups/${group.id}`,
            body: {
              label: form.label,
              shortLabel: form.shortLabel.trim() || null,
              hint: form.hint,
              note: form.note.trim() || null,
              required: form.required,
              defaultKeys: form.defaultKeys,
            },
          });
        }}
      >
        <div className="grid-2">
          <div className="field">
            <label htmlFor={`${p}-label`}>Step title</label>
            <input
              id={`${p}-label`}
              required
              disabled={!write}
              value={form.label}
              onChange={(e) => set({ label: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${p}-short`}>Short label (price lines)</label>
            <input
              id={`${p}-short`}
              disabled={!write}
              placeholder="e.g. Paper"
              value={form.shortLabel}
              onChange={(e) => set({ shortLabel: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${p}-hint`}>Hint</label>
            <input
              id={`${p}-hint`}
              disabled={!write}
              value={form.hint}
              onChange={(e) => set({ hint: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${p}-note`}>Note under the options</label>
            <input
              id={`${p}-note`}
              disabled={!write}
              value={form.note}
              onChange={(e) => set({ note: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`${p}-default`}>{multi ? "Selected by default" : "Default choice"}</label>
            {multi ? (
              <div className="row" id={`${p}-default`}>
                {group.options.map((o) => (
                  <label key={o.id} className="check">
                    <input
                      type="checkbox"
                      disabled={!write}
                      checked={form.defaultKeys.includes(o.key)}
                      onChange={(e) =>
                        set({
                          defaultKeys: e.target.checked
                            ? [...form.defaultKeys, o.key]
                            : form.defaultKeys.filter((k) => k !== o.key),
                        })
                      }
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            ) : (
              <select
                id={`${p}-default`}
                disabled={!write}
                value={form.defaultKeys[0] ?? ""}
                onChange={(e) => set({ defaultKeys: e.target.value ? [e.target.value] : [] })}
              >
                <option value="">No default</option>
                {group.options.map((o) => (
                  <option key={o.id} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            )}
          </div>
          <label className="check" style={{ alignSelf: "end" }}>
            <input
              type="checkbox"
              disabled={!write}
              checked={form.required}
              onChange={(e) => set({ required: e.target.checked })}
            />
            <span>Customers must choose</span>
          </label>
        </div>
        {write ? (
          <div className="row" style={{ justifyContent: "flex-end" }}>
            <button type="submit" className="btn btn-primary btn-sm" disabled={save.isPending}>
              Save group
            </button>
          </div>
        ) : null}
      </form>

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
            <th>
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {group.options.map((o, i) => (
            <tr key={o.id}>
              {renderOptionRow(i)}
              <td>
                {write ? (
                  <span className="row" style={{ gap: 4, flexWrap: "nowrap" }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Move ${o.label} up`}
                      disabled={i === 0 || save.isPending}
                      onClick={() => moveOption(i, -1)}
                    >
                      <ArrowUp size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Move ${o.label} down`}
                      disabled={i === group.options.length - 1 || save.isPending}
                      onClick={() => moveOption(i, 1)}
                    >
                      <ArrowDown size={16} aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-icon"
                      aria-label={`Delete ${o.label}`}
                      disabled={save.isPending}
                      onClick={() => {
                        if (window.confirm(`Delete the option “${o.label}”?`))
                          save.mutate({ path: `/admin/catalogue/options/${o.id}`, method: "DELETE" });
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                    </button>
                  </span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {write ? (
        <form
          className="row"
          style={{ alignItems: "flex-end" }}
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate(
              {
                path: `/admin/catalogue/option-groups/${group.id}/options`,
                method: "POST",
                body: {
                  key: option.key,
                  label: option.label,
                  detail: option.detail.trim() || null,
                  ...(group.kind === "SWATCH" ? { swatch: option.swatch } : {}),
                },
              },
              { onSuccess: () => setOption({ label: "", key: "", keyTouched: false, detail: "", swatch: "#000000" }) },
            );
          }}
        >
          <div className="field" style={{ flex: "1 1 180px" }}>
            <label htmlFor={`${p}-new-label`}>New option</label>
            <input
              id={`${p}-new-label`}
              required
              placeholder="e.g. Premium Matte 350 GSM"
              value={option.label}
              onChange={(e) =>
                setOption({
                  ...option,
                  label: e.target.value,
                  ...(option.keyTouched ? {} : { key: toKey(e.target.value) }),
                })
              }
            />
          </div>
          <div className="field" style={{ flex: "0 1 160px" }}>
            <label htmlFor={`${p}-new-key`}>Key</label>
            <input
              id={`${p}-new-key`}
              required
              pattern="[a-z0-9][a-z0-9\-]*"
              value={option.key}
              onChange={(e) => setOption({ ...option, key: e.target.value, keyTouched: true })}
            />
          </div>
          <div className="field" style={{ flex: "1 1 160px" }}>
            <label htmlFor={`${p}-new-detail`}>Detail</label>
            <input
              id={`${p}-new-detail`}
              value={option.detail}
              onChange={(e) => setOption({ ...option, detail: e.target.value })}
            />
          </div>
          {group.kind === "SWATCH" ? (
            <div className="field" style={{ flex: "0 0 80px" }}>
              <label htmlFor={`${p}-new-swatch`}>Colour</label>
              <input
                id={`${p}-new-swatch`}
                type="color"
                value={option.swatch}
                onChange={(e) => setOption({ ...option, swatch: e.target.value })}
              />
            </div>
          ) : null}
          <button type="submit" className="btn btn-secondary" disabled={save.isPending}>
            Add option
          </button>
        </form>
      ) : null}
      <p className="t-body-s muted">
        Options used by a pricing version or a rule can't be deleted — mark them as not orderable instead.
      </p>
    </section>
  );
}

function RuleDialog({
  product,
  rule,
  onClose,
  onSaved,
}: {
  product: ProductDetail;
  rule: Rule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const client = useQueryClient();
  const groups = product.optionGroups;
  const [when, setWhen] = useState(rule ? `${rule.whenGroup}::${rule.whenOption}` : "");
  const [effect, setEffect] = useState<Rule["effect"]>(rule?.effect ?? "EXCLUDES");
  const [thenGroup, setThenGroup] = useState(rule?.thenGroup ?? "");
  const [thenOptions, setThenOptions] = useState<string[]>(rule?.thenOptions ?? []);
  const [message, setMessage] = useState(rule?.message ?? "");
  const [whenGroup, whenOption] = when.split("::");
  const target = groups.find((g) => g.key === thenGroup);
  const save = useMutation({
    mutationFn: () =>
      api<ProductDetail>(rule ? `/admin/catalogue/rules/${rule.id}` : `/admin/catalogue/products/${product.id}/rules`, {
        method: rule ? "PUT" : "POST",
        body: { whenGroup, whenOption, effect, thenGroup, thenOptions, message },
      }),
    onSuccess: (p) => {
      client.setQueryData(["product", product.id], p);
      onSaved();
    },
  });

  return (
    <Dialog title={rule ? "Edit constraint rule" : "Add a constraint rule"} onClose={onClose}>
      <p className="t-body-s">
        Rules stop combinations that can't be produced. They're checked in the configurator and again on the server.
      </p>
      <form
        className="stack"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="field">
          <label htmlFor="rule-when">When</label>
          <select id="rule-when" required value={when} onChange={(e) => setWhen(e.target.value)}>
            <option value="">Choose an option…</option>
            {groups.map((g) => (
              <optgroup key={g.id} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.id} value={`${g.key}::${o.key}`}>
                    {g.shortLabel ?? g.label} is {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="grid-2">
          <div className="field">
            <label htmlFor="rule-effect">Then</label>
            <select id="rule-effect" value={effect} onChange={(e) => setEffect(e.target.value as Rule["effect"])}>
              <option value="EXCLUDES">Don't allow</option>
              <option value="REQUIRES">Require one of</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rule-then-group">In</label>
            <select
              id="rule-then-group"
              required
              value={thenGroup}
              onChange={(e) => {
                setThenGroup(e.target.value);
                setThenOptions([]);
              }}
            >
              <option value="">Choose a group…</option>
              {groups
                .filter((g) => g.key !== whenGroup)
                .map((g) => (
                  <option key={g.id} value={g.key}>
                    {g.label}
                  </option>
                ))}
            </select>
          </div>
        </div>
        {target ? (
          <fieldset className="field">
            <legend className="label">{effect === "EXCLUDES" ? "Options not allowed" : "Allowed options"}</legend>
            <div className="row">
              {target.options.map((o) => (
                <label key={o.id} className="check">
                  <input
                    type="checkbox"
                    checked={thenOptions.includes(o.key)}
                    onChange={(e) =>
                      setThenOptions(
                        e.target.checked ? [...thenOptions, o.key] : thenOptions.filter((k) => k !== o.key),
                      )
                    }
                  />
                  <span>{o.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <div className="field">
          <label htmlFor="rule-message">Message shown to customers</label>
          <textarea
            id="rule-message"
            required
            maxLength={200}
            placeholder="e.g. Spot UV needs 350 GSM or heavier paper."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
        {save.error ? <p className="alert alert-error">{errText(save.error)}</p> : null}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={save.isPending || !thenOptions.length}>
            {rule ? "Save rule" : "Add rule"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

// ---------- AD-CAT-05 · add / remove artwork slots ----------

export function AddSlotForm({ productId, setNotice }: { productId: string; setNotice: (n: Notice) => void }) {
  const save = useProductWrite(productId, setNotice);
  const [form, setForm] = useState({ label: "", printArea: "", bleedMm: "3", safeMm: "3" });
  return (
    <form
      className="card"
      aria-labelledby="add-slot-title"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(
          {
            path: `/admin/catalogue/products/${productId}/artwork-slots`,
            method: "POST",
            body: {
              label: form.label,
              printArea: form.printArea,
              bleedMm: form.bleedMm.trim() || null,
              safeMm: form.safeMm.trim() || null,
            },
          },
          { onSuccess: () => setForm({ label: "", printArea: "", bleedMm: "3", safeMm: "3" }) },
        );
      }}
    >
      <h2 id="add-slot-title" className="t-h4">
        Add artwork slot
      </h2>
      <div className="grid-2">
        <div className="field">
          <label htmlFor="ns-label">Slot name</label>
          <input
            id="ns-label"
            required
            placeholder="e.g. Back"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="ns-area">Print area</label>
          <input
            id="ns-area"
            required
            placeholder="e.g. 85 × 55 mm"
            value={form.printArea}
            onChange={(e) => setForm({ ...form, printArea: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="ns-bleed">Bleed (mm)</label>
          <input
            id="ns-bleed"
            inputMode="decimal"
            value={form.bleedMm}
            onChange={(e) => setForm({ ...form, bleedMm: e.target.value })}
          />
        </div>
        <div className="field">
          <label htmlFor="ns-safe">Safe zone (mm)</label>
          <input
            id="ns-safe"
            inputMode="decimal"
            value={form.safeMm}
            onChange={(e) => setForm({ ...form, safeMm: e.target.value })}
          />
        </div>
      </div>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button type="submit" className="btn btn-secondary" disabled={save.isPending}>
          Add slot
        </button>
      </div>
    </form>
  );
}

// ---------- slug change (products and categories) ----------

export function SlugField({
  id,
  label,
  prefix,
  slug,
  path,
  onChanged,
}: {
  id: string;
  label: string;
  prefix: string;
  slug: string;
  path: string;
  onChanged: (result: unknown) => void;
}) {
  const { can } = useSession();
  const allowed = can("catalogue.publish");
  const [value, setValue] = useState(slug);
  useEffect(() => setValue(slug), [slug]);
  const change = useMutation({
    mutationFn: () => api(path, { method: "PUT", body: { slug: value } }),
    onSuccess: onChanged,
  });
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="row" style={{ flexWrap: "nowrap" }}>
        <input
          id={id}
          style={{ flex: 1 }}
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          readOnly={!allowed}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        {allowed ? (
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={value === slug || change.isPending || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(value)}
            onClick={() => {
              if (
                window.confirm(
                  `Change the address to ${prefix}${value}? The old address will redirect, and website pages that list it are updated.`,
                )
              )
                change.mutate();
            }}
          >
            Change address
          </button>
        ) : null}
      </div>
      <span className="hint">
        {prefix}
        {slug}
        {allowed
          ? " · Changing the slug adds a redirect from the old address."
          : " · Changing the address needs the “Show / hide products” permission."}
      </span>
      {change.error ? <span className="alert alert-error">{errText(change.error)}</span> : null}
    </div>
  );
}
