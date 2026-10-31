import { useEffect, useState } from 'react'
import { apiGet } from '../api/client'

// path = null → không gọi (data null, không loading, không lỗi).
export function useApiData(path) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(path != null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (path == null) return
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
