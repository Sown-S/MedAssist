import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { changeOwnPassword } from "../api/accountStore";
import { getSettings } from "../api/settingsStore";
import { LANGUAGES, getLang, setLang } from "../i18n";
import { logEvent } from "../api/activityStore";
import ServerAddress from "../components/ServerAddress";
import AppIcon from "../components/Icon";
import Button from "../components/Button";

// Icon đơn sắc (nét vẽ theo currentColor) — không dùng emoji để màu đồng nhất với giao diện.
function Icon({ children }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  logo: (
    <>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
      <path d="M3.22 12H9.5l.5-1 2 4.5 2-7 1.5 3.5h5.27" />
    </>
  ),
  doctor: (
    <>
      <path d="M11 2v2" />
      <path d="M5 2v2" />
      <path d="M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1" />
      <path d="M8 15a6 6 0 0 0 12 0v-3" />
      <circle cx="20" cy="10" r="2" />
    </>
  ),
  reception: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 11h4" />
      <path d="M12 16h4" />
      <path d="M8 11h.01" />
      <path d="M8 16h.01" />
    </>
  ),
  admin: (
    <>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  user: (
    <>
      <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </>
  ),
  lock: (
    <>
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </>
  ),
  eye: (
    <>
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0" />
      <circle cx="12" cy="12" r="3" />
      <path d="m3 3 18 18" />
    </>
  ),
};

const ROLE_CARDS = [
  { key: "doctor", label: "Doctor" },
  { key: "reception", label: "Receptionist" },
  { key: "admin", label: "Administrator" },
];

export default function Login() {
  const { authenticate, startSession, notice } = useAuth();
  const [roleKey, setRoleKey] = useState("doctor");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // Đổi địa chỉ server của máy này ngay ở màn đăng nhập (máy mới cài, hoặc server đổi IP).
  const [serverOpen, setServerOpen] = useState(false);
  const [pending, setPending] = useState(null); // tài khoản phải đổi mật khẩu lần đầu
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
    const res = await changeOwnPassword(pending.id, np, password);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    logEvent({ name: pending.fullName, username: pending.username, roleKey: pending.roleKey }, 'auth.password_changed', { target: { kind: 'account', id: pending.username } });
    startSession({ ...pending, mustChange: false });
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
                : "This is your first sign-in — please set a password of your own."
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
