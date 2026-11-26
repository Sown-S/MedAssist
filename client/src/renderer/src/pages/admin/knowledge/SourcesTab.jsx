import { useState } from 'react'
import Modal, { ModalHeader } from '../../../components/Modal'
import { useToast } from '../../../context/ToastContext'
import { translate } from '../../../i18n'
import { createSource } from '../../../api/knowledgeApi'
import { Empty } from '../ui'
import { errorText } from './shared'
import { ErrorNote } from '../../../components/DataState'
import DateField from '../../../components/DateField'
import Badge from '../../../components/ui/Badge'

// Mọi quan hệ, trích dẫn và luật phải trích một nguồn.
export default function SourcesTab({ data, canEdit, onChanged }) {
  const { showToast } = useToast()
  const [adding, setAdding] = useState(false)
  return (
    <>
      <div className="toolbar">
        <span className="muted small">Every symptom–condition link, guideline excerpt and rule must cite one of these sources.</span>
        {canEdit && (
          <button className="btn btn-primary btn-sm" onClick={() => setAdding(true)}>
            + New source
          </button>
        )}
      </div>
      {!data.sources.length ? (
        <Empty icon="folder" title="No source yet" />
      ) : (
        <div className="tbl-wrap" tabIndex={0}>
          <table>
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
                  <td className="num small">{s.edition ?? '—'}</td>
                  <td className="small">{s.publication_date ?? '—'}</td>
                  <td className="small kb-url">{s.url ?? '—'}</td>
                  <td>{s.is_active ? <Badge tone="success">In use</Badge> : <Badge tone="neutral">Not in use</Badge>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
      <div className="modal-b">
        <div className="fg">
          <div className="field">
            <label>Organization</label>
            <input className="input" value={f.organization} onChange={(e) => set({ organization: e.target.value })} placeholder="vd: Bộ Y tế, WHO" />
          </div>
          <div className="field">
            <label>Document number / edition</label>
            <input className="input" value={f.edition} onChange={(e) => set({ edition: e.target.value })} placeholder="vd: QĐ 4068/QĐ-BYT" />
          </div>
          <div className="field full">
            <label>Title</label>
            <input className="input" value={f.title} onChange={(e) => set({ title: e.target.value })} />
          </div>
          <div className="field">
            <label>Publication date (optional)</label>
            <DateField value={f.publication_date} onChange={(v) => set({ publication_date: v })} />
          </div>
          <div className="field">
            <label>Accessed on (optional)</label>
            <DateField value={f.accessed_date} onChange={(v) => set({ accessed_date: v })} />
          </div>
          <div className="field full">
            <label>Link (optional)</label>
            <input className="input" value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://" />
          </div>
          <div className="field full">
            <label>License / usage note (optional)</label>
            <input className="input" value={f.license_note} onChange={(e) => set({ license_note: e.target.value })} />
          </div>
        </div>
        <ErrorNote>{err}</ErrorNote>
      </div>
      <div className="modal-f">
        <button className="btn btn-outline" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" disabled={!ok || busy} onClick={save}>
          Add source
        </button>
      </div>
    </Modal>
  )
}
