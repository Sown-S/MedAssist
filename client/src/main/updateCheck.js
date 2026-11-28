// Kiểm tra bản phát hành mới trên GitHub (chỉ thông báo, không tự tải hay cài). Thuần JS, không import Electron để kiểm thử được.
// Gọi từ main process: renderer bị chặn gọi ra ngoài, kết quả chuyển sang qua IPC (update:check).
export const RELEASES_URL = 'https://github.com/Sown-S/MedAssist/releases/latest'
// Danh sách mọi bản phát hành: cài lại bản trước khi bản mới có lỗi (xem client/README.md › Quay lại bản trước).
export const ALL_RELEASES_URL = 'https://github.com/Sown-S/MedAssist/releases'
export const LATEST_RELEASE_API = 'https://api.github.com/repos/Sown-S/MedAssist/releases/latest'
const TIMEOUT_MS = 8000

// "v0.2.4" / "0.2.4" → [0, 2, 4]; tag khác dạng (rc, beta…) → null, coi như không có bản mới.
export function parseVersion(s) {
  const m = String(s ?? '')
    .trim()
    .match(/^v?(\d+)\.(\d+)\.(\d+)$/)
  return m ? m.slice(1).map(Number) : null
}

export function isNewer(candidate, current) {
  const a = parseVersion(candidate)
  const b = parseVersion(current)
  if (!a || !b) return false
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

// Ghi chú phát hành (Markdown của GitHub) → chữ thường ngắn để hiện trong thông báo: bỏ ký hiệu Markdown, HTML,
// link (giữ chữ), gộp dòng trống, tối đa 800 ký tự. Không hiện HTML từ Internet trong app.
export function releaseNotes(body, max = 800) {
  const text = String(body ?? '')
    .replace(/\r/g, '')
    .replace(/<[^>]*>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}[ \t]*/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')
    .replace(/[*_`~]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return text.length > max ? text.slice(0, max).replace(/\s+\S*$/, '') + '…' : text
}

// { version: 'X.Y.Z', notes } khi GitHub có bản mới hơn; còn lại (bằng / cũ hơn, mất mạng, lỗi, hết lượt gọi) → null, không báo lỗi.
export async function fetchLatestRelease(fetchFn, currentVersion) {
  try {
    const res = await fetchFn(LATEST_RELEASE_API, {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'MedAssist-Desktop' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
    if (!res.ok) return null
    const body = await res.json()
    const v = parseVersion(body?.tag_name)
    return v && isNewer(body.tag_name, currentVersion) ? { version: v.join('.'), notes: releaseNotes(body.body) } : null
  } catch {
    return null
  }
}
