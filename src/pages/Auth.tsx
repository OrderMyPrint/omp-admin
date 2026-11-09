import { useQueryClient } from "@tanstack/react-query";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { api, ApiError } from "../lib/api";
import { useSession } from "../lib/session";

type Next = { next: "totp" } | { next: "enroll"; totpSecret: string; otpauthUri: string };

const message = (err: unknown) =>
  err instanceof ApiError
    ? err.detail
      ? `${err.title}. ${err.detail}`
      : err.title
    : "Something went wrong. Please try again.";

/** Authenticator step: shows the QR code when enrolling, then asks for the 6-digit code. */
function SecondFactor({ step, onDone }: { step: Next; onDone: () => void }) {
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (step.next === "enroll") void QRCode.toDataURL(step.otpauthUri, { margin: 1, width: 400 }).then(setQr);
  }, [step]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/admin/auth/totp", { method: "POST", body: { code } });
      onDone();
    } catch (err) {
      setError(message(err));
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="auth-card" onSubmit={submit}>
      <p className="t-overline muted">Step 2 · Two-factor</p>
      {step.next === "enroll" ? (
        <>
          <h1 className="t-h3">Set up your authenticator</h1>
          <p className="t-body-s muted">
            Scan this code with Google Authenticator, Microsoft Authenticator or 1Password, then enter the 6-digit code
            it shows.
          </p>
          {qr ? <img className="qr" src={qr} alt="Authenticator QR code" /> : null}
          <details>
            <summary className="t-body-xs muted">Can’t scan? Enter this key instead</summary>
            <p className="mono">{step.totpSecret.replace(/(.{4})/g, "$1 ").trim()}</p>
          </details>
        </>
      ) : (
        <h1 className="t-h3">Enter your authenticator code</h1>
      )}
      <div className="field">
        <label htmlFor="code">6-digit code</label>
        <input
          id="code"
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
      <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>
        Verify
      </button>
      <p className="t-body-xs muted">Lost your device? Ask an Owner to reset your two-factor sign-in.</p>
    </form>
  );
}

/** AD-AUTH-01 · Staff sign-in (email + password → authenticator). */
export function SignIn() {
  const { me } = useSession();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [step, setStep] = useState<Next | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (me) return <Navigate to="/" replace />;

  const done = async () => {
    await client.invalidateQueries({ queryKey: ["me"] });
    navigate("/", { replace: true });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setStep(await api<Next>("/admin/auth/login", { method: "POST", body: { email, password } }));
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      {step ? (
        <SecondFactor step={step} onDone={done} />
      ) : (
        <form className="auth-card" onSubmit={submit}>
          <img src="/logo.png" alt="Order My Print" width={88} />
          <p className="t-overline muted">Admin · staff only</p>
          <h1 className="t-h3">Staff sign-in</h1>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error ? <p className="alert alert-error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={busy}>
            Continue
          </button>
        </form>
      )}
    </div>
  );
}

/** Invitation link: /accept-invite#token=… — choose a password, then set up the authenticator. */
export function AcceptInvite() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [step, setStep] = useState<Next | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Drop the token from the address bar once read.
    if (window.location.hash) history.replaceState(null, "", window.location.pathname);
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirm) return setError("The passwords don’t match.");
    setError(null);
    try {
      setStep(await api<Next>("/admin/auth/invitations/accept", { method: "POST", body: { token, password } }));
    } catch (err) {
      setError(message(err));
    }
  };

  const done = async () => {
    await client.invalidateQueries({ queryKey: ["me"] });
    navigate("/", { replace: true });
  };

  return (
    <div className="auth">
      {step ? (
        <SecondFactor step={step} onDone={done} />
      ) : (
        <form className="auth-card" onSubmit={submit}>
          <img src="/logo.png" alt="Order My Print" width={88} />
          <p className="t-overline muted">Step 1 · Choose a password</p>
          <h1 className="t-h3">Welcome to Order My Print admin</h1>
          {!token ? (
            <p className="alert alert-error">
              This link is missing its invitation code. Open the full link you were sent.
            </p>
          ) : null}
          <div className="field">
            <label htmlFor="new-password">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <span className="hint">At least 12 characters. A short sentence works well.</span>
          </div>
          <div className="field">
            <label htmlFor="confirm-password">Confirm password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error ? <p className="alert alert-error">{error}</p> : null}
          <button type="submit" className="btn btn-primary" disabled={!token}>
            Continue
          </button>
        </form>
      )}
    </div>
  );
}
