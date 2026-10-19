import { useState, useEffect } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useLogin } from '@/Domain/Auth/hooks/useAuth'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'

export function LoginPage() {
  const { isAuthenticated } = useAuthContext()
  const login = useLogin()
  const [searchParams] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (searchParams.get('expired') === '1') {
      setError('Sua sessão expirou. Entre novamente.')
      return
    }
    if (searchParams.get('error') === 'discord') {
      setError(
        searchParams.get('message') ??
          'Não foi possível entrar com Discord. Tente novamente.',
      )
    }
  }, [searchParams])

  if (isAuthenticated) return <Navigate to="/" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    try {
      await login.mutateAsync({ email, password })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao entrar')
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="auth-field">
        <label htmlFor="login-email">Email</label>
        <input
          id="login-email"
          type="email"
          placeholder="seuemail@dominio.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      <div className="auth-field">
        <label htmlFor="login-password">Senha</label>
        <input
          id="login-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </div>

      {error && <p className="auth-error">{error}</p>}

      <button
        type="submit"
        className="auth-btn-primary"
        disabled={login.isPending}
      >
        {login.isPending ? 'Entrando...' : 'Entrar no sistema'}
      </button>
    </form>
  )
}
