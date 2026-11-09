/**
 * Client for the Order My Print API. Requests go to the admin's own /api path
 * (Vite proxy / Vercel rewrite), so the staff session cookie is first-party.
 * Writes carry the CSRF token the API issued at sign-in (double-submit).
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    public title: string,
    public detail?: string,
    public extra: Record<string, unknown> = {},
  ) {
    super(detail ? `${title}: ${detail}` : title);
  }
}

let csrfToken = "";
export const setCsrfToken = (token: string | undefined) => {
  if (token) csrfToken = token;
};

/** Called when the API says the step-up code is needed; the UI asks for a code and retries. */
let stepUpHandler: (() => Promise<boolean>) | null = null;
export const onStepUpRequired = (handler: (() => Promise<boolean>) | null) => {
  stepUpHandler = handler;
};

export async function api<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
  retried = false,
): Promise<T> {
  const method = init.method ?? "GET";
  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(method !== "GET" ? { "x-csrf-token": csrfToken } : {}),
    },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const err = new ApiError(
      res.status,
      String(data.code ?? "ERROR"),
      String(data.title ?? res.statusText),
      data.detail as string | undefined,
      data,
    );
    if (err.code === "STEP_UP_REQUIRED" && stepUpHandler && !retried && (await stepUpHandler()))
      return api<T>(path, init, true);
    throw err;
  }
  if (typeof data.csrfToken === "string") setCsrfToken(data.csrfToken);
  return data as T;
}

export type Me = {
  id: string;
  email: string;
  name: string;
  role: { id: string; key: string; name: string } | null;
  permissions: string[];
  twoFactor: boolean;
  secondFactorPending: boolean;
  csrfToken: string;
};
