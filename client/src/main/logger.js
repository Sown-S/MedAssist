// Nhật ký lỗi của app trên máy (thư mục userData/logs): mỗi dòng một JSON, xoay vòng khi file quá 1 MB, giữ 3 file cũ.
// Chỉ ghi lỗi kỹ thuật (thông điệp, stack, đường dẫn API, mã yêu cầu) — không ghi token, mật khẩu, nội dung bệnh án.
// "Lưu thông tin lỗi" (Cài đặt, màn lỗi) gộp các file này kèm phiên bản app / hệ điều hành thành một file .txt để gửi nhóm.
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'fs'
import { join } from 'path'

const LEVELS = new Set(['error', 'warn', 'info'])
const MAX_TEXT = { message: 2000, stack: 6000, context: 2000 }

// Che token / mật khẩu nếu lỡ lọt vào thông điệp lỗi.
export function redact(s) {
  return String(s ?? '')
    .replace(/Bearer\s+[\w.~+/=-]+/gi, 'Bearer ***')
    .replace(/("?(?:access_token|refresh_token|password|new_password|old_password|token)"?\s*[:=]\s*)"?[^",\s}&]+"?/gi, '$1***')
}
const clip = (s, n) => {
  const t = redact(s)
  return t.length > n ? t.slice(0, n) + '…' : t
}

export function createLogger(dir, { maxBytes = 1024 * 1024, keep = 3, now = () => new Date() } = {}) {
  const file = (i) => join(dir, i ? `medassist.${i}.log` : 'medassist.log')
  const rotate = () => {
    if (!existsSync(file(0)) || statSync(file(0)).size < maxBytes) return
    rmSync(file(keep), { force: true })
    for (let i = keep - 1; i >= 0; i--) if (existsSync(file(i))) renameSync(file(i), file(i + 1))
  }
  return {
    write(level, message, extra = {}) {
      try {
        mkdirSync(dir, { recursive: true })
        rotate()
        const entry = { t: now().toISOString(), level: LEVELS.has(level) ? level : 'info', message: clip(message, MAX_TEXT.message) }
        if (extra.stack) entry.stack = clip(extra.stack, MAX_TEXT.stack)
        if (extra.context) entry.context = clip(typeof extra.context === 'string' ? extra.context : JSON.stringify(extra.context), MAX_TEXT.context)
        if (extra.source) entry.source = clip(extra.source, 40)
        appendFileSync(file(0), JSON.stringify(entry) + '\n', 'utf8')
      } catch {
        /* ghi nhật ký hỏng không được làm hỏng app */
      }
    },
    // Toàn bộ nhật ký, cũ nhất trước.
    read() {
      const parts = []
      for (let i = keep; i >= 0; i--) if (existsSync(file(i))) parts.push(readFileSync(file(i), 'utf8'))
      return parts.join('')
    },
    files: () => Array.from({ length: keep + 1 }, (_, i) => file(i)).filter((f) => existsSync(f))
  }
}

// Nội dung file "thông tin lỗi": đầu file là phiên bản và môi trường, sau đó là nhật ký.
export function diagnosticsText({ app, versions, platform, serverUrl, profile, logs, now = new Date() }) {
  const head = [
    'MedAssist — thông tin lỗi để gửi nhóm phát triển',
    `Thời điểm: ${now.toISOString()}`,
    `Phiên bản app: ${app}`,
    `Electron ${versions.electron} · Chromium ${versions.chrome} · Node ${versions.node}`,
    `Hệ điều hành: ${platform}`,
    `Máy chủ: ${serverUrl || '(mặc định)'}`,
    ...(profile ? [`Hồ sơ máy: ${profile}`] : []),
    '',
    '--- Nhật ký (mỗi dòng một JSON, cũ nhất trước) ---',
    ''
  ]
  return head.join('\n') + (logs || '(chưa có lỗi nào được ghi)\n')
}
