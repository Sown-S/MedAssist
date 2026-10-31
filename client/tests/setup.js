import { afterEach, vi } from 'vitest'

// Store giả lập log các lời gọi POST mẫu — tắt cho kết quả test dễ đọc.
vi.spyOn(console, 'log').mockImplementation(() => {})

afterEach(() => {
  vi.useRealTimers()
})
