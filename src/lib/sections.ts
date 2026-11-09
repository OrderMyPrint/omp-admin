import {
  BadgeCheck,
  Calculator,
  CircleHelp,
  Columns2,
  GalleryHorizontal,
  Info,
  LayoutGrid,
  LayoutTemplate,
  ListChecks,
  Megaphone,
  Package,
  ShieldCheck,
  Type,
  type LucideIcon,
} from "lucide-react";

/* eslint-disable @typescript-eslint/no-explicit-any -- content documents are validated by the API */
type Json = any;

export type Refs = {
  categories: { slug: string; name: string }[];
  products: { slug: string; name: string }[];
  media: { id: string; name: string; alt: string }[];
  pages: { key: string; title: string; path: string }[];
};

type SectionType = {
  label: string;
  group: "Page openers" | "Products & prices" | "Content" | "Help & action";
  icon: LucideIcon;
  hint: string;
  /** Why the section can't be added yet (e.g. no images with alt text), or nothing. */
  needs?: (r: Refs) => string | undefined;
};

/** The section types the visual editor offers (AD-WEB-08). They match the API's content blocks. */
export const BLOCK_TYPES: Record<string, SectionType> = {
  hero: { label: "Hero", group: "Page openers", icon: LayoutTemplate, hint: "The big opening section of a page." },
  assuranceStrip: {
    label: "Assurance strip",
    group: "Page openers",
    icon: ShieldCheck,
    hint: "A row of short reasons to trust you.",
  },
  notice: { label: "Notice", group: "Page openers", icon: Info, hint: "A highlighted message box." },
  categoryTiles: {
    label: "Category tiles",
    group: "Products & prices",
    icon: LayoutGrid,
    hint: "Links to product categories.",
    needs: (r) => (r.categories.length ? undefined : "No visible categories yet"),
  },
  productCarousel: {
    label: "Product carousel",
    group: "Products & prices",
    icon: Package,
    hint: "A scrolling row of products.",
    needs: (r) => (r.products.length ? undefined : "No visible products yet"),
  },
  priceEstimator: {
    label: "Price estimator",
    group: "Products & prices",
    icon: Calculator,
    hint: "Lets visitors estimate a price.",
  },
  imageText: {
    label: "Image + text",
    group: "Content",
    icon: Columns2,
    hint: "A picture beside a paragraph.",
    needs: (r) => (r.media.length ? undefined : "Add an image with alt text in Media first"),
  },
  richText: { label: "Rich text", group: "Content", icon: Type, hint: "Headings, paragraphs and lists." },
  steps: { label: "Steps", group: "Content", icon: ListChecks, hint: "A numbered how-it-works list." },
  cards: { label: "Cards", group: "Content", icon: BadgeCheck, hint: "A grid of short cards." },
  imageGallery: {
    label: "Image gallery",
    group: "Content",
    icon: GalleryHorizontal,
    hint: "A set of pictures with captions.",
    needs: (r) => (r.media.length ? undefined : "Add an image with alt text in Media first"),
  },
  faqList: { label: "FAQ list", group: "Help & action", icon: CircleHelp, hint: "Questions from the FAQ." },
  ctaBand: {
    label: "Call-to-action band",
    group: "Help & action",
    icon: Megaphone,
    hint: "A band with a heading and a button.",
  },
};

/** Name shown in the Navigator and panel header: the section's own heading when it has one. */
export function blockLabel(b: Json): string {
  const own =
    b.heading || b.title || (b.type === "richText" ? b.nodes?.find((n: Json) => n.type === "heading")?.text : "");
  return own || BLOCK_TYPES[b.type]?.label || b.type;
}

const uid = (type: string) => `${type}-${Math.random().toString(36).slice(2, 8)}`;
const productsLink = { kind: "path", path: "/products" };

/**
 * A new section with placeholder text for the editor to replace. Placeholders say what to
 * write; they never state business facts (prices, timings, policies).
 */
export function newBlock(type: string, r: Refs): Json | null {
  const base = { id: uid(type), type, visible: true };
  switch (type) {
    case "hero":
      return {
        ...base,
        heading: "Add a heading",
        body: "Add a sentence about this page.",
        points: [],
        primary: { label: "Shop products", link: productsLink },
      };
    case "assuranceStrip":
      return { ...base, items: [{ icon: "shield", title: "Add a reason", detail: "Add a short detail." }] };
    case "notice":
      return { ...base, tone: "info", title: "Add a notice title", body: "Add the notice text." };
    case "categoryTiles":
      return { ...base, heading: "Shop by category", categorySlugs: r.categories.slice(0, 8).map((c) => c.slug) };
    case "productCarousel":
      return { ...base, heading: "Popular products", productSlugs: r.products.slice(0, 8).map((p) => p.slug) };
    case "priceEstimator":
      return { ...base, heading: "See your price before you order", points: [] };
    case "imageText":
      return { ...base, heading: "Add a heading", body: "Add your text.", imageId: r.media[0]?.id, imageSide: "right" };
    case "richText":
      return {
        ...base,
        nodes: [
          { type: "heading", text: "Add a heading" },
          { type: "paragraph", text: "Add your text." },
        ],
      };
    case "steps":
      return {
        ...base,
        heading: "How it works",
        steps: [1, 2, 3].map((n) => ({ title: `Step ${n}`, detail: "Describe this step." })),
      };
    case "cards":
      return {
        ...base,
        heading: "Add a heading",
        cards: [1, 2, 3].map((n) => ({ title: `Card ${n}`, body: "Add the card text." })),
      };
    case "imageGallery":
      return { ...base, heading: "Add a heading", images: r.media.slice(0, 3).map((m) => ({ imageId: m.id })) };
    case "faqList":
      return { ...base, heading: "Questions, answered", source: "homepage" };
    case "ctaBand":
      return {
        ...base,
        heading: "Add a heading",
        body: "Add a short message.",
        points: [],
        primary: { label: "Shop products", link: productsLink },
      };
    default:
      return null;
  }
}
