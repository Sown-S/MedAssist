import { useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { createSource } from '../../../api/knowledgeApi'
import { Empty } from '../ui'
import { errorText } from './shared'

// Mọi quan hệ, trích dẫn và luật phải trích một nguồn.
export default function SourcesTab({ data, canEdit, onChanged }) {
  const { showToast } = useToast()
  const [adding, setAdding] = useState(false)
  return (
    <>
      <div className="ai-toolbar">
        <span className="ai-soft ai-small">Every symptom–condition link, guideline excerpt and rule must cite one of these sources.</span>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            + New source
          </button>
        )}
      </div>
      {!data.sources.length ? (
        <Empty icon="folder" title="No source yet" />
      ) : (
        <table className="dt">
          <thead>
            <tr>
              <th>Organization</th>
              <th>Title</th>
              <th>Edition</th>
              <th>Published</th>
              <th>Link</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.sources.map((s) => (
              <tr key={s.source_id}>
                <td>
                  <b>{s.organization}</b>
                </td>
                <td>{s.title}</td>
                <td className="mono ai-small">{s.edition ?? '—'}</td>
                <td className="ai-small">{s.publication_date ?? '—'}</td>
                <td className="ai-small kb-url">{s.url ?? '—'}</td>
                <td>{s.is_active ? <span className="badge ok">In use</span> : <span className="badge muted">Not in use</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SourceModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={() => {
          setAdding(false)
          showToast(translate('Source added'))
          onChanged()
        }}
      />
    </>
  )
}

const EMPTY = { organization: '', title: '', edition: '', publication_date: '', url: '', accessed_date: '', license_note: '' }

function SourceModal({ open, onClose, onSaved }) {
  const [f, setF] = useState(EMPTY)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!open) return null
  const set = (patch) => setF((x) => ({ ...x, ...patch }))
  const ok = f.organization.trim() && f.title.trim() && f.edition.trim()

  async function save() {
    setBusy(true)
    setErr('')
    try {
      const opt = (s) => (s.trim() ? s.trim() : null)
      await createSource({
        organization: f.organization.trim(),
        title: f.title.trim(),
        edition: f.edition.trim(),
        publication_date: opt(f.publication_date),
        url: opt(f.url),
        accessed_date: opt(f.accessed_date),
        license_note: opt(f.license_note)
      })
      setF(EMPTY)
      onSaved()
    } catch (e) {
      setErr(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open onClose={onClose} wide>
      <ModalHeader title="New source" onClose={onClose} />
      <div className="modal-body">
        <div className="form-grid cols-2">
          <div className="field">
            <label>Organization</label>
            <input value={f.organization} onChange={(e) => set({ organization: e.target.value })} placeholder="vd: Bộ Y tế, WHO" />
          </div>
          <div className="field">
            <label>Document number / edition</label>
            <input value={f.edition} onChange={(e) => set({ edition: e.target.value })} placeholder="vd: QĐ 4068/QĐ-BYT" />
          </div>
          <div className="field full">
            <label>Title</label>
            <input value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="field">
            <label>Publication date (optional)</label>
            <input type="date" value={f.publication_date} onChange={(e) => set({ publication_date: e.target.value })} />
          </div>
          <div className="field">
            <label>Accessed on (optional)</label>
            <input type="date" value={f.accessed_date} onChange={(e) => set({ accessed_date: e.target.value })} />
          </div>
          <div className="field full">
            <label>Link (optional)</label>
            <input value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
          </div>
          <div className="field full">
            <label>License / usage note (optional)</label>
            <input value={f.license_note} onChange={(e) => set({ license_note: e.target.value })} />
          </div>
        </div>
        {err && <div className="kb-error">{err}</div>}
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!ok || busy} onClick={save}>
          Add source
        </button>
      </div>
    </Modal>
  )
}
