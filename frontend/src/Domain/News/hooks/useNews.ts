import { useEffect } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import { onSocketReconnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'
import type { News, Page } from '@/Domain/types/models'

export const newsKeys = {
  all: ['news'] as const,
  page: (page: number, size: number) => ['news', page, size] as const,
}

/** One page of news, newest first; refreshes live when leadership publishes/edits/deletes. */
export function useNewsPage(page: number, size = 1) {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeTopicEffect('/topic/news', () => {
        queryClient.invalidateQueries({ queryKey: newsKeys.all })
      }),
    [queryClient],
  )
  useEffect(() => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: newsKeys.all })), [queryClient])

  return useQuery({
    queryKey: newsKeys.page(page, size),
    queryFn: () => apiClient<Page<News>>(`/news?page=${page}&size=${size}`),
    placeholderData: keepPreviousData,
  })
}

type NewsInput = { title: string; contentHtml: string }

export function useCreateNews() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: NewsInput) => apiClient<News>('/news', { method: 'POST', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: newsKeys.all }),
  })
}

export function useUpdateNews() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: NewsInput & { id: number }) =>
      apiClient<News>(`/news/${id}`, { method: 'PUT', body }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: newsKeys.all }),
  })
}

export function useDeleteNews() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => apiClient<void>(`/news/${id}`, { method: 'DELETE' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: newsKeys.all }),
  })
}
