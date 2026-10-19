import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { usePresenceReporter } from '@/Domain/Presence/hooks/usePresence'

/** Mounted once for the whole app (pages inside and outside the Layout) while the member is approved. */
export function PresenceReporter() {
  const { user, isAuthenticated } = useAuthContext()
  usePresenceReporter(isAuthenticated && user?.status === 'APROVADO' && !!user.profileComplete)
  return null
}
