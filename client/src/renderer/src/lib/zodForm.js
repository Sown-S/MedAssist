import { useForm } from 'react-hook-form'

// Nối zod vào react-hook-form (thay @hookform/resolvers, gói đó xung đột phụ thuộc ajv-formats của test hợp đồng).
// Thông báo lỗi trong schema viết bằng tiếng Anh như mọi chữ giao diện; <Field> hiện chúng trong thẻ <span> nên tự dịch.
export const zodResolver = (schema) => async (values) => {
  const r = await schema.safeParseAsync(values)
  if (r.success) return { values: r.data, errors: {} }
  const errors = {}
  for (const i of r.error.issues) {
    const key = i.path.join('.') || 'root'
    errors[key] ??= { type: i.code, message: i.message }
  }
  return { values: {}, errors }
}

// useForm với schema zod; mode 'onTouched': báo lỗi khi rời ô hoặc bấm lưu, không báo ngay khi đang gõ ký tự đầu.
export const useZodForm = (schema, options = {}) => useForm({ mode: 'onTouched', resolver: zodResolver(schema), ...options })
