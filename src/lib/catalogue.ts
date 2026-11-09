import { ApiError } from "./api";

/** Shapes returned by /admin/catalogue (omp-api src/catalogue/catalogue-admin.service.ts). */
export type Category = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  lead: string;
  about: string;
  imageUrl: string;
  sort: number;
  isVisible: boolean;
  productCount: number;
};

export type ProductRow = {
  id: string;
  slug: string;
  name: string;
  category: { id: string; slug: string; name: string };
  isVisible: boolean;
  publishedVersionNo: number | null;
  draftVersionNo: number | null;
  scheduled: { versionNo: number; effectiveFrom: string } | null;
  artworkSlots: string[];
};

export type Rule = {
  id: string;
  whenGroup: string;
  whenOption: string;
  effect: "EXCLUDES" | "REQUIRES";
  thenGroup: string;
  thenOptions: string[];
  message: string;
};
export type TaxProfile = { id: string; name: string; gstRate: string; note: string | null };

export type Option = {
  id: string;
  key: string;
  label: string;
  detail: string | null;
  swatch: string | null;
  isAvailable: boolean;
  unavailableReason: string | null;
};
export type OptionGroup = {
  id: string;
  key: string;
  label: string;
  shortLabel: string | null;
  hint: string;
  note: string | null;
  kind: "SELECT" | "SWATCH" | "MULTISELECT";
  required: boolean;
  defaultKeys: string[];
  options: Option[];
};
export type ArtworkSlot = {
  id: string;
  key: string;
  label: string;
  printArea: string;
  bleedMm: string | null;
  safeMm: string | null;
  acceptedTypes: string[];
  maxMb: number;
};
export type UploadTiming = "BEFORE_CART" | "AFTER_CHECKOUT" | "EITHER";
export type ProductDetail = {
  id: string;
  slug: string;
  name: string;
  summary: string;
  lead: string;
  description: string;
  imageUrl: string;
  category: { id: string; slug: string; name: string };
  isVisible: boolean;
  unitOne: string;
  unitMany: string;
  turnaroundMinDays: number;
  turnaroundMaxDays: number;
  quantityMode: "TIERS" | "SIZES";
  sizes: string[];
  uploadTiming: UploadTiming;
  taxProfile: { name: string; gstRate: string };
  publishedVersionNo: number | null;
  optionGroups: OptionGroup[];
  artworkSlots: ArtworkSlot[];
  rules: Rule[];
};

export type OptionPrice = { perUnit?: string; unitPrice?: string; perOrder?: string };
export type PricingDocument = {
  currency: "INR";
  source: string;
  tiers: { minQty: number; unitPrice: string }[];
  quoteFromQty?: number;
  options: Record<string, Record<string, OptionPrice>>;
  setupCharges: {
    kind: "perColourPerSelection";
    label: string;
    group: string;
    appliesWhen: { group: string; option: string };
    amount: string;
    maxColours: number;
  }[];
  sizeSurcharge?: { sizes: string[]; perUnit: string; label: string };
};

export type VersionStatus = "DRAFT" | "SCHEDULED" | "PUBLISHED" | "ARCHIVED";
export type VersionRow = {
  id: string;
  versionNo: number;
  status: VersionStatus;
  note: string | null;
  source: string | null;
  createdAt: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
};
export type Versions = { product: { id: string; slug: string; name: string }; versions: VersionRow[] };
export type Version = {
  id: string;
  productId: string;
  versionNo: number;
  status: VersionStatus;
  note: string | null;
  document: PricingDocument;
  effectiveFrom: string;
  publishedAt: string | null;
  product: ProductDetail;
};
export type DiffRow = {
  component: string;
  label: string;
  before: string | null;
  after: string | null;
  change: string | null;
};
export type Diff = { against: { id: string; versionNo: number } | null; rows: DiffRow[] };

export type PriceResult = {
  valid: boolean;
  errors: { code: string; field: string; message: string }[];
  requiresQuote: boolean;
  quantity: number;
  unitPrice: string | null;
  lines: { code: string; label: string; amount: string }[];
  subtotal: string | null;
  gstRate: string;
  gst: string | null;
  total: string | null;
};

/** ₹1,234.50 — Indian digit grouping. */
export const rupees = (value: string | null | undefined) =>
  value == null
    ? "—"
    : `₹${Number(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;

export const dateText = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

export const errText = (e: unknown) => {
  if (!(e instanceof ApiError)) return String(e);
  const problems =
    (e.extra.problems as string[] | undefined) ??
    (e.extra.errors as { field: string; message: string }[] | undefined)?.map((x) =>
      x.field ? `${x.field}: ${x.message}` : x.message,
    );
  return problems?.length ? `${e.title}: ${problems.join("; ")}` : e.detail ? `${e.title}. ${e.detail}` : e.title;
};

/** Reference rates from the seed are not confirmed business prices (decision D-08). */
export const isReferenceSource = (source: string | null | undefined) => !!source && /D-08|reference/i.test(source);

export const dateTimeText = (value: string | null | undefined) =>
  value
    ? new Date(value).toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

/** Lower-case words joined by dashes, from a label. */
export const toKey = (label: string) =>
  label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
