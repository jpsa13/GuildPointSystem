import { useEffect } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '@/Shared/api/client'
import { onSocketReconnect, subscribeTopicEffect } from '@/Shared/websocket/socketClient'
import { memberKeys } from '@/Domain/Member/hooks/useMembers'
import type { Donation, DonationSettings, Page } from '@/Domain/types/models'

export const donationKeys = {
  all: ['donations'] as const,
  settings: ['donations', 'settings'] as const,
  mine: (page: number, size: number) => ['donations', 'mine', page, size] as const,
  pending: ['donations', 'pending'] as const,
}

/** Refreshes every donation query when a donation is sent/reviewed or the rate changes. */
export function useDonationsSubscription() {
  const queryClient = useQueryClient()

  useEffect(
    () =>
      subscribeTopicEffect('/topic/donations', () => {
        queryClient.invalidateQueries({ queryKey: donationKeys.all })
      }),
    [queryClient],
  )
  useEffect(
    () => onSocketReconnect(() => queryClient.invalidateQueries({ queryKey: donationKeys.all })),
    [queryClient],
  )
}

export function useDonationSettings() {
  return useQuery({
    queryKey: donationKeys.settings,
    queryFn: () => apiClient<DonationSettings>('/donations/settings'),
  })
}

export function useMyDonations(page: number, size = 10) {
  return useQuery({
    queryKey: donationKeys.mine(page, size),
    queryFn: () => apiClient<Page<Donation>>(`/donations/mine?page=${page}&size=${size}`),
    placeholderData: keepPreviousData,
  })
}

/** Líder/Administrador only. */
export function usePendingDonations() {
  return useQuery({
    queryKey: donationKeys.pending,
    queryFn: () => apiClient<Donation[]>('/donations/pending'),
  })
}

export function useCreateDonation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (amountKk: number) =>
      apiClient<Donation>('/donations', { method: 'POST', body: { amountKk } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: donationKeys.all }),
  })
}

export function useUpdateDonationSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (pointsPerKk: number) =>
      apiClient<DonationSettings>('/donations/settings', { method: 'PUT', body: { pointsPerKk } }),
    onSuccess: (settings) => queryClient.setQueryData(donationKeys.settings, settings),
  })
}

export function useReviewDonation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, decision }: { id: number; decision: 'accept' | 'reject' }) =>
      apiClient<Donation>(`/donations/${id}/${decision}`, { method: 'POST' }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: donationKeys.all })
      // The donor's points changed (ranking, profile).
      queryClient.invalidateQueries({ queryKey: memberKeys.all })
    },
  })
}
