import { afterEach, vi } from 'vitest'

// Giao diện mặc định tiếng Việt; test kiểm chữ gốc tiếng Anh nên chọn sẵn tiếng Anh trước khi nạp i18n.
localStorage.setItem('medassist_lang', 'en')

// Store giả lập log các lời gọi POST mẫu — tắt cho kết quả test dễ đọc.
vi.spyOn(console, 'log').mockImplementation(() => {})

afterEach(() => {
  vi.useRealTimers()
})
