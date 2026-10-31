import Icon from '../../../components/Icon'
import { Switch } from '../ai/ui'
import { translate } from '../../../i18n'
import { PAPERS, PRINT_DOCS } from '../../../api/settingsStore'
import { useDevice, setDevice, getDevice } from '../../../api/deviceSettings'
import { printHtml, fmtMoney } from '../inventory/shared'

// Cài đặt riêng máy này (khổ giấy, bảng gọi bệnh nhân) — lưu ngay trên máy, không qua nút Lưu chung.
export function DeviceTab({ draft }) {
  const dev = useDevice()
  return (
    <>
      <div className="card">
        <div className="card-title">Paper size on this computer</div>
        <table className="dt">
          <thead>
            <tr>
              <th>Document</th>
              <th>Paper size</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {PRINT_DOCS.map((d) => (
              <tr key={d.key}>
                <td>{d.label}</td>
                <td>
                  <select className="ai-select" value={dev.papers[d.key]} onChange={(e) => setDevice({ papers: { [d.key]: e.target.value } })}>
                    {PAPERS.map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="ai-actions">
                  <button className="btn btn-ghost btn-sm" title="Print a test page" onClick={() => printTest(d, draft)}>
                    <Icon name="printer" /> <span>Test</span>
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="ai-foot-note">
          <Icon name="settings" /> <span>Saved on this computer only — e.g. the front-desk PC prints receipts on an 80 mm thermal printer, the doctor’s PC prints prescriptions on A5.</span>
        </p>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">Patient call board (front desk)</div>
        <div className="set-grid">
          <div className="field set-field">
            <label>
              <span>Show patient names</span>
            </label>
            <Switch checked={dev.queue.showNames} onChange={(v) => setDevice({ queue: { showNames: v } })} />
            <small className="ai-soft">Turn off if this screen faces the waiting room — only the number and room are shown.</small>
          </div>
          <div className="field set-field">
            <label>
              <span>Next patients shown</span>
            </label>
            <select value={dev.queue.nextCount} onChange={(e) => setDevice({ queue: { nextCount: Number(e.target.value) } })}>
              {[3, 6, 10].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </>
  )
}

export function printTest(doc, draft) {
  const t = translate
  printHtml(
    t('Test page'),
    `<h1>${t('Test page')} — ${t(doc.label)}</h1><p class="meta">${t('Paper size')}: ${getDevice().papers[doc.key]}</p>
    <table><thead><tr><th>${t('Line item')}</th><th class="num">${t('Amount')}</th></tr></thead>
    <tbody><tr><td>${t('Consultation fee')}</td><td class="num">${fmtMoney(draft.ops.consultFee)}</td></tr></tbody></table>`,
    doc.key,
    draft
  )
}
