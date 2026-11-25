import { useQuery } from '@tanstack/react-query'
import { apiGet } from '../api/client'
import { errorMessage } from '../api/errors'
import { queryClient } from '../lib/queryClient'

// GET một đường dẫn API qua TanStack Query (dùng chung cache theo path).
// path = null → không gọi (data null, không loading, không lỗi). error là câu hiển thị được; reload() tải lại.
export function useApiData(path) {
  const q = useQuery({ queryKey: ['api', path], queryFn: () => apiGet(path), enabled: path != null }, queryClient)
  return {
    data: q.data ?? null,
    loading: path != null && q.isPending && !q.isError,
    error: q.error ? errorMessage(q.error) : null,
    reload: () => q.refetch()
  }
}
