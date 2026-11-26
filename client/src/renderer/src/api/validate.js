import { z } from 'zod'

// Kiểm hình dạng response lúc chạy bằng schema zod sinh từ OpenAPI (schemas.gen.js).
// Không bao giờ chặn dữ liệu: bản phát hành bỏ qua; bản dev báo console.warn một lần cho mỗi endpoint để lập trình
// viên thấy ngay khi server đổi hợp đồng mà client chưa theo. Test dùng server giả rút gọn nên tắt mặc định.
const MODE = import.meta.env?.MODE
let report = MODE === 'development' || MODE === 'eval' ? (label, issues) => console.warn(`[api] ${label} lệch hợp đồng`, issues) : null
const warned = new Set()

export const setShapeReporter = (fn) => {
  report = fn
  warned.clear()
}

export function checkShape(schema, data, label) {
  if (!report) return data
  const r = schema.safeParse(data)
  if (!r.success && !warned.has(label)) {
    warned.add(label)
    report(label, r.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`))
  }
  return data
}

export const listOf = (schema) => z.array(schema)
