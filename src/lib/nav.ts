import {
  BarChart3,
  ClipboardCheck,
  CreditCard,
  FileText,
  Home,
  Image,
  Layers,
  LayoutGrid,
  MapPin,
  MessageSquare,
  Package,
  Printer,
  Receipt,
  Settings,
  Shield,
  Star,
  Tag,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { label: string; path: string; icon: LucideIcon; permission: string; ready: boolean };
export type NavGroup = { title: string | null; items: NavItem[] };

/**
 * Admin sidebar (Figma "Admin Sidebar"). Only modules the role can read are shown
 * (AD-ERR-01 rule). `ready: false` modules open a "coming in a later phase" page.
 */
export const NAV: NavGroup[] = [
  { title: null, items: [{ label: "Overview", path: "/", icon: Home, permission: "dashboard.read", ready: true }] },
  {
    title: "Catalogue",
    items: [
      { label: "Products & categories", path: "/catalogue", icon: Layers, permission: "catalogue.read", ready: true },
      { label: "Pricing rules", path: "/pricing", icon: Tag, permission: "pricing.read", ready: true },
    ],
  },
  {
    title: "Website",
    items: [{ label: "Website content", path: "/website", icon: LayoutGrid, permission: "content.read", ready: true }],
  },
  {
    title: "Sales",
    items: [
      { label: "Orders", path: "/orders", icon: Package, permission: "orders.read", ready: true },
      { label: "Quotations", path: "/quotations", icon: MessageSquare, permission: "quotes.read", ready: true },
      { label: "Customers & companies", path: "/customers", icon: Users, permission: "customers.read", ready: true },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Artwork review", path: "/artwork", icon: Image, permission: "artwork.read", ready: false },
      { label: "Order map", path: "/order-map", icon: MapPin, permission: "orders.read", ready: false },
      { label: "Production", path: "/production", icon: Printer, permission: "production.read", ready: false },
      { label: "Quality control", path: "/qc", icon: ClipboardCheck, permission: "production.read", ready: false },
      { label: "Shipments", path: "/shipments", icon: Truck, permission: "shipments.read", ready: false },
    ],
  },
  {
    title: "Finance",
    items: [
      { label: "Payments & refunds", path: "/payments", icon: CreditCard, permission: "payments.read", ready: false },
      { label: "Invoices", path: "/invoices", icon: Receipt, permission: "invoices.read", ready: false },
      { label: "Coupons", path: "/coupons", icon: Star, permission: "coupons.read", ready: false },
    ],
  },
  {
    title: "Insights",
    items: [{ label: "Reports", path: "/reports", icon: BarChart3, permission: "reports.read", ready: false }],
  },
  {
    title: "Admin",
    items: [
      { label: "Staff & roles", path: "/staff", icon: Shield, permission: "staff.read", ready: true },
      { label: "Settings", path: "/settings", icon: Settings, permission: "settings.write", ready: false },
      { label: "Audit log", path: "/audit", icon: FileText, permission: "audit.read", ready: true },
    ],
  },
];

export const ALL_ITEMS = NAV.flatMap((g) => g.items);
