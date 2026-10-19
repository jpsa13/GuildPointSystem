import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { DiscordProfileModal } from '@/Features/Auth/DiscordProfileModal'
import { WaitingApprovalPage } from '@/Features/Auth/WaitingApprovalPage'

export function ProtectedRoute() {
  const { isAuthenticated, isLoading, user, logout } = useAuthContext()

  useEffect(() => {
    if (user?.status === 'REJEITADO') {
      logout()
    }
  }, [user?.status, logout])

  if (isLoading) {
    return (
      <div className="loading-screen">
        <p>Carregando...</p>
      </div>
    )
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />
  }

  if (!user.profileComplete) {
    return <DiscordProfileModal />
  }

  if (user.status === 'PENDENTE') {
    return <WaitingApprovalPage />
  }

  if (user.status === 'REJEITADO') {
    return (
      <div className="loading-screen">
        <p>Conta rejeitada. Redirecionando...</p>
      </div>
    )
  }

  return <Outlet />
}

export function ModeratorRoute() {
  const { hasRole } = useAuthContext()
  if (!hasRole('MODERADOR')) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}

/** Administrador and Líder (e.g. who is online and where). */
export function AdminRoute() {
  const { hasRole } = useAuthContext()
  if (!hasRole('ADMINISTRADOR')) {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
