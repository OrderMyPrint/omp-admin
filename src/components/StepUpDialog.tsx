import { useEffect, useRef, useState } from "react";
import { api, ApiError, onStepUpRequired } from "../lib/api";

/**
 * AD-AUTH-02 · "Confirm it's you". When the API answers STEP_UP_REQUIRED, this
 * asks for a fresh authenticator code, confirms it, and the original request retries.
 */
export function StepUpDialog() {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    onStepUpRequired(
      () =>
        new Promise<boolean>((resolve) => {
          resolver.current = resolve;
          setCode("");
          setError(null);
          setOpen(true);
        }),
    );
    return () => onStepUpRequired(null);
  }, []);

  const close = (ok: boolean) => {
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await api("/admin/auth/step-up", { method: "POST", body: { code } });
      close(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.title : "That didn’t work");
    }
  };

  if (!open) return null;
  return (
    <div className="scrim" role="presentation">
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="stepup-title" onSubmit={submit}>
        <h2 id="stepup-title" className="t-h4">
          Confirm it’s you
        </h2>
        <p className="t-body-s muted">This change needs a fresh code from your authenticator app.</p>
        <div className="field">
          <label htmlFor="stepup-code">6-digit code</label>
          <input
            id="stepup-code"
            className="otp-input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            autoFocus
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
        </div>
        {error ? <p className="alert alert-error">{error}</p> : null}
        <div className="row">
          <button type="button" className="btn btn-secondary" onClick={() => close(false)}>
            Cancel
          </button>
          <button type="submit" className="btn btn-primary" disabled={code.length !== 6}>
            Confirm
          </button>
        </div>
      </form>
    </div>
  );
}
