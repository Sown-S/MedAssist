import { Switch } from '../ui'
import { useDevice, setDevice } from '../../../api/deviceSettings'

// Cài đặt riêng máy này — lưu ngay, không qua nút Lưu chung. Khổ giấy nằm ở tab In ấn (nhóm “Riêng máy này”).
export function DeviceTab() {
  const dev = useDevice()
  return (
    <>
      <div className="card">
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
