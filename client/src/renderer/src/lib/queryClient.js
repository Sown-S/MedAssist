import { QueryClient } from '@tanstack/react-query'

// Một QueryClient cho cả app. Hook gọi useQuery(opts, queryClient) nên không cần bọc Provider — các trang cũ và
// renderPage trong test chạy nguyên như trước. Thử lại do màn hình tự quyết (đa số là poll định kỳ), nên tắt retry.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: false, refetchOnWindowFocus: false, staleTime: 2000 }
  }
})
