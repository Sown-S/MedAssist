// Ghi lỗi giao diện vào nhật ký trên máy (qua preload window.api.log; chạy trong trình duyệt / test thì bỏ qua).
// Chỉ gửi thông điệp, stack và ngữ cảnh kỹ thuật — main process còn che token / mật khẩu lần nữa trước khi ghi.
const api = () => (typeof window !== 'undefined' ? window.api?.log : undefined)

export function reportError(error, context) {
  try {
    api()?.write('error', error?.message ?? String(error), { stack: error?.stack, context })
  } catch {
    /* không có preload */
  }
}

export function reportWarning(message, context) {
  try {
    api()?.write('warn', message, { context })
  } catch {
    /* không có preload */
  }
}

// Lỗi không ai bắt (trong hàm xử lý sự kiện, promise quên catch) cũng vào nhật ký.
export function installErrorReporting() {
  window.addEventListener('error', (e) => reportError(e.error ?? e.message, { at: `${e.filename}:${e.lineno}` }))
  window.addEventListener('unhandledrejection', (e) => reportError(e.reason, { kind: 'unhandledrejection' }))
}

export const canExportDiagnostics = () => !!api()?.exportFile
export const exportDiagnostics = () => api()?.exportFile() ?? Promise.resolve({ ok: false })
