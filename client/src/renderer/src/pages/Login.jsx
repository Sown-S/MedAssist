import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { changePassword } from "../api/authApi";
import { usePasswordMinLength } from "../api/accountStore";
import { LANGUAGES, getLang, setLang } from "../i18n";
import ServerAddress from "../components/ServerAddress";
import VersionBanners from "../components/VersionBanners";
import AppIcon, { Logo } from "../components/Icon";
import { translate } from "../i18n";
import loginPhoto from "../assets/login-clinic.jpg";
import Button from "../components/Button";
import { version as appVersion } from "../../../../package.json";

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
  const minLength = usePasswordMinLength();

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

  const roleIcon = { doctor: 'stethoscope', reception: 'clipboard-list', admin: 'shield' }
  const errBox = (msg) => (
    <div className="err" role="alert" style={{ display: 'flex' }}>
      <AppIcon name="circle-alert" />
      <span>{msg}</span>
    </div>
  )
  const shownError = error || (!pending && notice)

  return (
    <div className="login view">
      <LoginHero />
      <section className="login-right">
        {/* Bản mới trên GitHub / lệch version với máy chủ: hiện ngay khi kết nối, trước khi đăng nhập. */}
        <div className="login-banners" style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
          <VersionBanners margin="0 0 16px" />
        </div>
        {!pending ? (
          <form className="login-form" noValidate onSubmit={handleSubmit}>
            <div>
              <h2>Sign in</h2>
              <p className="sub" style={{ marginTop: 4 }}>
                Choose your role and sign in with the account you were given
              </p>
            </div>
            {shownError && errBox(shownError)}
            <div className="field">
              <span className="lab">Role</span>
              <div className="roles">
                {ROLE_CARDS.map((r) => (
                  <button type="button" key={r.key} className={'role' + (roleKey === r.key ? ' on' : '')} onClick={() => setRoleKey(r.key)}>
                    <AppIcon name={roleIcon[r.key]} />
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="field">
              <label htmlFor="u">Username</label>
              <input className="input" id="u" type="text" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="p">Password</label>
              <div className="pw">
                <input className="input" id="p" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" onClick={() => setShow(!show)} title="Show/hide password" aria-label={translate('Show/hide password')}>
                  <AppIcon name={show ? 'eye-off' : 'eye'} />
                </button>
              </div>
            </div>
            <Button className="btn btn-primary" type="submit" loading={busy}>
              {busy ? 'Signing in…' : 'Sign In'}
            </Button>
            <p className="muted small" style={{ textAlign: 'center' }}>
              Don't have an account? Contact your administrator.
            </p>
            <div className="secure">
              <AppIcon name="lock" />
              Secure access to your clinic workspace
            </div>
            <div className={'srv-panel' + (serverOpen ? ' open' : '')}>
              <div>{serverOpen && <ServerAddress variant="login" />}</div>
            </div>
            <div className="lang">
              <button type="button" className={serverOpen ? 'on' : ''} onClick={() => setServerOpen(!serverOpen)} title="Clinic server address">
                <AppIcon name="wifi" />
                Server
              </button>
              <span className="sep" />
              {[...LANGUAGES].sort((a) => (a.code === 'vi' ? -1 : 1)).map((l) => (
                <button type="button" key={l.code} className={getLang() === l.code ? 'on' : ''} onClick={() => setLang(l.code)} title={l.name}>
                  {l.code.toUpperCase()}
                </button>
              ))}
            </div>
          </form>
        ) : (
          <form className="login-form" noValidate onSubmit={handleChange}>
            <h2>Set a New Password</h2>
            <p className="sub">{pending.expired ? 'Your password has expired — please set a new one.' : 'Please set a password of your own before continuing.'}</p>
            {shownError && errBox(shownError)}
            <div className="field">
              <label htmlFor="np">{`New password (at least ${minLength} characters)`}</label>
              <div className="pw">
                <input className="input" id="np" type={show ? 'text' : 'password'} value={np} onChange={(e) => setNp(e.target.value)} autoFocus />
                <button type="button" onClick={() => setShow(!show)} title="Show/hide password" aria-label={translate('Show/hide password')}>
                  <AppIcon name={show ? 'eye-off' : 'eye'} />
                </button>
              </div>
            </div>
            <div className="field">
              <label htmlFor="rp">Confirm new password</label>
              <div className="pw">
                <input className="input" id="rp" type={show ? 'text' : 'password'} value={np2} onChange={(e) => setNp2(e.target.value)} />
              </div>
            </div>
            <Button className="btn btn-primary" type="submit" loading={busy}>
              {busy ? 'Saving…' : 'Save & Continue'}
            </Button>
            <button type="button" className="btn btn-ghost" onClick={cancelChange} disabled={busy}>
              <AppIcon name="arrow-left" />
              Back to sign in
            </button>
          </form>
        )}
      </section>
    </div>
  )
}

// Nửa trái màn đăng nhập (kiểu trang đăng nhập Facebook): logo, tiêu đề lớn, ảnh ghép giới thiệu hệ thống.
// Ảnh: anhnen2.jpg do nhóm cung cấp (Tài liệu sửa đổi), cắt dọc phần bác sĩ khám cho bệnh nhân, 720×960 để nét khi phóng to. Các thẻ là minh hoạ tĩnh.
function LoginHero() {
  return (
    <section className="login-left" aria-hidden="true">
      <div className="brand">
        <Logo />
        <span className="t">
          Med<b>Assist</b>
        </span>
      </div>
      <div className="fbx">
        <div className="fbx-t">
          <h1>
            {translate("The right patient,")} <span>{translate("at the right time.")}</span>
          </h1>
          <p>{translate("Bright ethics, solid expertise, complete trust.")}</p>
        </div>
        <div className="fbx-c">
          <div className="cx-photo">
            <div className="cx-bar">
              <i />
            </div>
            <img src={loginPhoto} alt="" />
            <span className="cx-time">
              <AppIcon name="clock" />
              08:30 · {translate("No.")} 012
            </span>
          </div>
          <div className="cx-card cx-queue">
            <h4>
              <AppIcon name="grid" />
              {translate("Clinic management")}
            </h4>
            {[
              ["userCheck", "Lean operations", "Receptionist"],
              ["stethoscope", "Digital-first care", "Doctor"],
              ["package", "Optimisation", "Admin"],
            ].map(([ic, t, r]) => (
              <div className="row" key={t}>
                <span>
                  <AppIcon name={ic} />
                  {translate(t)}
                </span>
                <span className="plain">{translate(r)}</span>
              </div>
            ))}
          </div>
          <div className="cx-card cx-vitals">
            <h4>
              <AppIcon name="sparkles" />
              {translate("On-premise AI assistant")}
            </h4>
            <div className="v">
              <span>{translate("Model")}</span>
              <b>Gemma SEA-LION 9B</b>
            </div>
            <div className="v">
              <span>{translate("Knowledge")}</span>
              <b>{translate("Local data")}</b>
            </div>
            <div className="v">
              <span>{translate("Data")}</span>
              <b className="ok">
                <AppIcon name="shieldCheck" />
                {translate("Tightly controlled")}
              </b>
            </div>
          </div>
          <div className="cx-dot cx-ai">
            <AppIcon name="sparkles" />
          </div>
          <div className="cx-dot cx-heart">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M9 3.5h6a1 1 0 0 1 1 1V8h3.5a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H16v3.5a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V16H4.5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1H8V4.5a1 1 0 0 1 1-1z" fill="#fff" />
            </svg>
          </div>
          <div className="cx-ring">
            <Logo />
          </div>
        </div>
      </div>
      <div className="cx-by">
        <span>MedAssist {appVersion}</span>
      </div>
    </section>
  );
}
