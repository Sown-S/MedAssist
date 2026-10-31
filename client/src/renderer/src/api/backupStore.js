// Sao lưu / khôi phục của bản demo: dữ liệu nằm trong localStorage (khoá medassist_*), sao lưu là một file JSON
// có checksum SHA-256. Chạy thật: máy chủ tự sao lưu hằng ngày (deploy/scripts/backup.ps1).
import { useSyncExternalStore } from 'react'
import { logEvent } from './activityStore'
import { version } from '../../../../package.json'

const LOG_KEY = 'medassist_backup_log_v1'
const FORMAT = 'medassist-backup'
// Nhật ký hoạt động không bị khôi phục đè: nhật ký chỉ ghi thêm.
const AUDIT_KEY = 'medassist_audit_v2'
// Không thuộc dữ liệu phòng khám nên không sao lưu: ngôn ngữ, mã máy trạm, token, lịch sử sao lưu.
const SKIP = ['medassist_lang', 'medassist_ws', 'medassist_token', LOG_KEY]

function dataKeys() {
  const out = []
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k.startsWith('medassist_') && !SKIP.includes(k)) out.push(k)
    }
  } catch {
    /* localStorage không khả dụng */
  }
  return out.sort()
}

async function sha256(text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, '0')).join('')
}

function readLog() {
  try {
    return JSON.parse(localStorage.getItem(LOG_KEY)) ?? []
  } catch {
    return []
  }
}
let log = readLog()
const listeners = new Set()
const subscribe = (fn) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
const getLog = () => log
export function useBackupLog() {
  return useSyncExternalStore(subscribe, getLog)
}
export const lastBackup = () => log[0] ?? null
function saveLog(next) {
  log = next
  try {
    localStorage.setItem(LOG_KEY, JSON.stringify(log))
  } catch {/* không lưu được thì chỉ giữ trong phiên */}
  listeners.forEach((fn) => fn())
}
const pushLog = (entry) => saveLog([entry, ...log].slice(0, 20))

const stamp = (d) => d.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-')

export async function createBackup(user) {
  const data = {}
  for (const k of dataKeys()) data[k] = localStorage.getItem(k)
  const body = JSON.stringify(data)
  const now = new Date()
  const file = {
    format: FORMAT,
    appVersion: version,
    createdAt: now.toISOString(),
    createdBy: user.name,
    checksum: await sha256(body),
    data
  }
  const text = JSON.stringify(file)
  const name = `medassist-backup-${stamp(now)}.json`
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.click()
  URL.revokeObjectURL(url)
  pushLog({ at: file.createdAt, by: user.name, file: name, size: text.length, keys: Object.keys(data).length, checksum: file.checksum, kind: 'manual', verified: null })
  logEvent(user, 'backup.create', { target: { kind: 'backup', id: name }, params: { file: name, size: text.length } })
}

export async function verifyBackupFile(fileObj) {
  let parsed
  try {
    parsed = JSON.parse(await fileObj.text())
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }
  if (parsed?.format !== FORMAT || typeof parsed.data !== 'object') return { ok: false, error: 'This is not a MedAssist backup file.' }
  if ((await sha256(JSON.stringify(parsed.data))) !== parsed.checksum)
    return { ok: false, error: 'Checksum mismatch — the file is damaged or was edited after the backup.' }
  const parts = []
  for (const [k, v] of Object.entries(parsed.data)) {
    try {
      const x = JSON.parse(v)
      parts.push({ key: k, count: Array.isArray(x) ? x.length : x && typeof x === 'object' ? Object.keys(x).length : 1 })
    } catch {
      return { ok: false, error: 'A section of the backup cannot be read: ' + k }
    }
  }
  if (!parts.some((p) => p.key.startsWith('medassist_accounts'))) return { ok: false, error: 'The backup has no staff accounts — restoring it would lock everyone out.' }
  // File do chính máy này tạo → đánh dấu đã kiểm tra.
  if (log.some((e) => e.checksum === parsed.checksum))
    saveLog(log.map((e) => (e.checksum === parsed.checksum ? { ...e, verified: new Date().toISOString() } : e)))
  return { ok: true, file: parsed, parts, name: fileObj.name }
}

// Thay toàn bộ dữ liệu bằng bản sao lưu (trừ nhật ký hoạt động) rồi tải lại ứng dụng.
export function restoreBackup(verified, user) {
  logEvent(user, 'backup.restore', {
    target: { kind: 'backup', id: verified.name },
    params: { file: verified.name, from: verified.file.createdAt }
  })
  for (const k of dataKeys()) if (k !== AUDIT_KEY) localStorage.removeItem(k)
  for (const [k, v] of Object.entries(verified.file.data)) if (k !== AUDIT_KEY && !SKIP.includes(k)) localStorage.setItem(k, v)
  window.location.reload()
}
