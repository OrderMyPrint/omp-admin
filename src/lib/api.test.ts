import { afterEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, onStepUpRequired } from "./api";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  vi.unstubAllGlobals();
  onStepUpRequired(null);
});

describe("api client", () => {
  it("calls the admin's own /api path and sends the CSRF token captured at sign-in on writes", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(200, { csrfToken: "tok-1" }))
      .mockResolvedValueOnce(reply(200, { ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    await api("/admin/auth/me");
    await api("/admin/staff/x", { method: "PATCH", body: { name: "A" } });

    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/admin/auth/me");
    expect(fetchMock.mock.calls[0][1].headers["x-csrf-token"]).toBeUndefined();
    expect(fetchMock.mock.calls[1][1].headers["x-csrf-token"]).toBe("tok-1");
    expect(fetchMock.mock.calls[1][1].credentials).toBe("same-origin");
  });

  it("turns problem+json into an ApiError", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply(403, { code: "FORBIDDEN", title: "Not allowed", detail: "Needs staff.manage" })),
    );
    const err = await api("/admin/staff").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 403, code: "FORBIDDEN", title: "Not allowed" });
  });

  it("asks for a step-up code once and retries the request", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(reply(403, { code: "STEP_UP_REQUIRED", title: "Confirm it's you" }))
      .mockResolvedValueOnce(reply(200, { done: true }));
    vi.stubGlobal("fetch", fetchMock);
    const handler = vi.fn().mockResolvedValue(true);
    onStepUpRequired(handler);

    await expect(api("/admin/roles/r1", { method: "DELETE" })).resolves.toEqual({ done: true });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up when the person cancels the step-up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(reply(403, { code: "STEP_UP_REQUIRED", title: "Confirm it's you" })),
    );
    onStepUpRequired(vi.fn().mockResolvedValue(false));
    await expect(api("/admin/roles/r1", { method: "DELETE" })).rejects.toMatchObject({ code: "STEP_UP_REQUIRED" });
  });
});
