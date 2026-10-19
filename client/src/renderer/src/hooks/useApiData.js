import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'

// Trước đây: MỖI trang tự viết 3 dòng useState + 1 khối useEffect y hệt nhau để gọi apiGet().
// Giờ 1 trang chỉ cần:
//   const { data: patients, loading, error } = useApiData('/admin/patients')
// Cần nhiều endpoint trong 1 trang? Gọi hook này nhiều lần — mỗi hook độc lập, các request
// vẫn chạy song song vì React chạy tất cả effect của lần render đầu cùng lúc (không phải nối tiếp).
export function useApiData(path) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    apiGet(path)
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError(err.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [path])

  return { data, loading, error }
}
