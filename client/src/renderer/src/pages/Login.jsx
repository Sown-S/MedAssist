import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { changePassword } from "../api/authApi";
import { getSettings } from "../api/settingsStore";
import { LANGUAGES, getLang, setLang } from "../i18n";
import ServerAddress from "../components/ServerAddress";
import AppIcon from "../components/Icon";
import Button from "../components/Button";
import { Icon, ICONS } from "./LoginIcons";

const ROLE_CARDS = [
  { key: "doctor", label: "Doctor" },
  { key: "reception", label: "Receptionist" },
  { key: "admin", label: "Administrator" },
];

export default function Login() {
  const { authenticate, startSession, logout, notice } = useAuth();
  const [roleKey, setRoleKey] = useState("doctor");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [serverOpen, setServerOpen] = useState(false);
  const [pending, setPending] = useState(null);
  const [np, setNp] = useState("");
  const [np2, setNp2] = useState("");

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password)
      return setError("Please enter both your username and password.");
    setBusy(true);
    const res = await authenticate(username, password, roleKey);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    if (res.account.mustChange) setPending({ ...res.account, expired: res.expired });
    else startSession(res.account);
  }

  async function handleChange(e) {
    e.preventDefault();
    setError("");
    if (np !== np2) return setError("The two new passwords do not match.");
    setBusy(true);
    const res = await changePassword(pending, password, np);
    if (!res.ok) {
      setBusy(false);
      return setError(res.error);
    }
    // Server đã thu hồi token cũ → đăng nhập lại bằng mật khẩu mới.
    const again = await authenticate(username, np, roleKey);
    setBusy(false);
    setPending(null);
    setNp("");
    setNp2("");
    if (!again.ok || again.account.mustChange) {
      if (again.ok) logout();
      setPassword("");
      return setError(again.ok ? "Please sign in again with the new password." : again.error);
    }
    startSession(again.account);
  }

  // Huỷ token của lần đăng nhập dở dang.
  function cancelChange() {
    logout();
    setPending(null);
    setPassword("");
    setNp("");
    setNp2("");
    setError("");
  }

  return (
    <div className="login-screen">
      <div className="login-wrap">
        <div className="login-head">
          <div className="login-logo">
            <Icon>{ICONS.logo}</Icon>
          </div>
          <h2 className="login-title">
            {pending ? "Set a New Password" : "Welcome Back"}
          </h2>
          <p className="sub">
            {pending
              ? pending.expired
                ? "Your password has expired — please set a new one."
                : "Please set a password of your own before continuing."
              : "Sign in to the MedAssist clinic management system"}
          </p>
        </div>

        <div className="login-card">
          {error ? (
            <div className="login-err show">{error}</div>
          ) : (
            notice && !pending && <div className="login-err show">{notice}</div>
          )}

          {!pending ? (
            <form onSubmit={handleSubmit}>
              <div className="login-field">
                <label>Role</label>
                <div className="role-cards">
                  {ROLE_CARDS.map((r) => (
                    <button
                      type="button"
                      key={r.key}
                      className={
                        "role-card" + (roleKey === r.key ? " active" : "")
                      }
                      onClick={() => setRoleKey(r.key)}
                    >
                      <span className="ic">
                        <Icon>{ICONS[r.key]}</Icon>
                      </span>
                      <b>{r.label}</b>
                    </button>
                  ))}
                </div>
              </div>
              <div className="login-field">
                <label>Username</label>
                <div className="input-ic">
                  <span>
                    <Icon>{ICONS.user}</Icon>
                  </span>
                  <input
                    type="text"
                    autoComplete="username"
                    placeholder="e.g. mai.nguyen"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
              </div>
              <div className="login-field">
                <label>Password</label>
                <div className="input-ic">
                  <span>
                    <Icon>{ICONS.lock}</Icon>
                  </span>
                  <input
                    type={show ? "text" : "password"}
                    autoComplete="current-password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="eye"
                    onClick={() => setShow(!show)}
                    title="Show/hide password"
                  >
                    <Icon>{show ? ICONS.eyeOff : ICONS.eye}</Icon>
                  </button>
                </div>
              </div>
              <Button
                className="btn btn-primary login-submit"
                type="submit"
                loading={busy}
              >
                {busy ? "Signing in…" : "Sign In"}
              </Button>
              <p className="login-note">
                Don't have an account? Contact your administrator.
              </p>
            </form>
          ) : (
            <form onSubmit={handleChange}>
              <div className="login-field">
                <label>{`New password (at least ${getSettings().security.minLength} characters)`}</label>
                <div className="input-ic">
                  <span>
                    <Icon>{ICONS.lock}</Icon>
                  </span>
                  <input
                    type="password"
                    value={np}
                    onChange={(e) => setNp(e.target.value)}
                    autoFocus
                  />
                </div>
              </div>
              <div className="login-field">
                <label>Confirm new password</label>
                <div className="input-ic">
                  <span>
                    <Icon>{ICONS.lock}</Icon>
                  </span>
                  <input
                    type="password"
                    value={np2}
                    onChange={(e) => setNp2(e.target.value)}
                  />
                </div>
              </div>
              <Button
                className="btn btn-primary login-submit"
                type="submit"
                loading={busy}
              >
                {busy ? "Saving…" : "Save & Continue"}
              </Button>
              <p className="login-note">
                <button type="button" className="btn btn-ghost btn-sm" onClick={cancelChange} disabled={busy}>
                  Back to sign in
                </button>
              </p>
            </form>
          )}
        </div>

        <div className="login-footer">
          <Icon>{ICONS.lock}</Icon>
          Secure access to your clinic workspace
        </div>
        {serverOpen && (
          <div className="login-server">
            <ServerAddress onClose={() => setServerOpen(false)} />
          </div>
        )}
        <div className="login-lang">
          <button type="button" className={"login-server-btn" + (serverOpen ? " active" : "")} onClick={() => setServerOpen(!serverOpen)} title="Clinic server address">
            <AppIcon name="wifi" /> Server
          </button>
          <span className="login-lang-sep" />
          {LANGUAGES.map((l) => (
            <button
              type="button"
              key={l.code}
              className={getLang() === l.code ? "active" : ""}
              onClick={() => setLang(l.code)}
              title={l.name}
            >
              {l.code.toUpperCase()}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
