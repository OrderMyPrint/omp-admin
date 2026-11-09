# omp-admin

Staff admin app for **Order My Print** — a React + Vite single-page app, hosted separately from the storefront so it can live on its own domain.

Design source: Figma admin screens `AD-*` (see `OrderMyPrint/website` → `docs/design/`). Architecture and decisions: `OrderMyPrint/website` → `docs/architecture/`, `docs/decisions/`.

## What works today

| Area | Screen IDs | Notes |
| --- | --- | --- |
| Sign in + authenticator (TOTP) enrolment, invitation acceptance | AD-AUTH-* | Password (Argon2id on the API) then a 6-digit code; QR shown on first sign-in |
| Role-filtered navigation, access-denied page | AD-NAV, AD-ERR-01 | Sidebar shows only modules the role may open; the API enforces the same permissions |
| Staff & roles (RBAC) | AD-STF-*, AD-ROL-* | Invite, change role, deactivate, reset 2FA, sign out everywhere; custom roles with per-permission checkboxes; Owner role locked |
| Website content | AD-WEB-01…06 | Pages (section text, order, visibility, SEO, drafts, publish, version restore), navigation menus, FAQ, media alt text, site settings, redirects |
| Audit log | AD-AUD-01 | Append-only, newest first |
| Re-confirm dialog | — | Sensitive changes ask for a fresh authenticator code (step-up) |

Catalogue, pricing, orders, customers and the remaining modules show "Coming soon" until their API slices exist.

## How it talks to the API

The browser only ever calls this app's own `/api/*` path:

- **Local:** Vite proxies `/api` to `API_PROXY_TARGET` (default `http://localhost:4000`).
- **Vercel:** `vercel.json` rewrites `/api/*` to the hosted `omp-api`.

That keeps the staff session cookie first-party (`*.vercel.app` is a public suffix, so two Vercel apps are cross-site to each other). Writes send the CSRF token the API issued at sign-in in `X-CSRF-Token`.

No secrets live in this app — it is static files plus a rewrite.

## Run locally

```bash
npm install
npm run dev            # http://localhost:5173, API expected on :4000
```

Start `omp-api` first (`npm run dev` there). To create the first Owner, in `omp-api` run
`npm run admin:create-owner -- --email you@example.com --name "Your Name"` and open the printed invitation link.

## Checks

```bash
npm run check          # prettier, TypeScript, unit tests
npm run build
```
