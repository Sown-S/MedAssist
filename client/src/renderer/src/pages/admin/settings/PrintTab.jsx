import Icon from '../../../components/Icon'
import { Switch } from '../ui'
import { translate } from '../../../i18n'
import { PAPERS, PRINT_DOCS } from '../../../api/settingsStore'
import { useDevice, setDevice, getDevice } from '../../../api/deviceSettings'
import { printHtml, printHeaderHtml, fmtMoney } from '../inventory/shared'
import { Field } from './Field'

// Tab “In ấn”: logo, dòng tiêu đề, chân trang dùng chung mọi máy (clinic.profile, lưu bằng nút Lưu, khoá khi mất kết nối);
// khổ giấy theo máy in của máy này (deviceSettings, lưu ngay).
export function PrintTab({ form, draft, readOnly }) {
  const { fp, text, val, set } = form
  const dev = useDevice()
  return (
    <>
      <div className="card">
        <div className="card-title">Applies to every computer</div>
        <div className="set-split">
          <fieldset className="set-fieldset" disabled={readOnly}>
            <div className="set-grid">
              <Field {...fp('print.showLogo')}>
                <Switch checked={val('print.showLogo')} onChange={(v) => set('print.showLogo', v)} />
              </Field>
              <Field {...fp('print.header')} wide hint="Optional, e.g. opening hours or a hotline. Shown under the clinic details.">
                <input {...text('print.header', { maxLength: 500 })} />
              </Field>
              <Field {...fp('print.footer')} wide hint="Optional, e.g. a thank-you line. Leave empty to print no footer.">
                <input {...text('print.footer', { maxLength: 500 })} />
              </Field>
            </div>
          </fieldset>
          <div>
            <div className="ai-small ai-soft" style={{ marginBottom: 6 }}>
              Header preview
            </div>
            <div className="set-print-preview" dangerouslySetInnerHTML={{ __html: printHeaderHtml(draft) }} />
            {val('print.footer') && <div className="set-print-preview foot">{val('print.footer')}</div>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 14 }}>
        <div className="card-title">This computer only</div>
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
        <div className="card-title">Document numbering</div>
        <p className="ai-soft" style={{ fontSize: 13, margin: 0 }}>
          {translate('Read-only: the clinic server numbers documents when they are saved (e.g. invoices HD-20261017-0001) and issues queue numbers, so two computers never get the same number.')}
        </p>
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
