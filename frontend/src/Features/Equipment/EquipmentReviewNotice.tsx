import { Link } from 'react-router-dom'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import { useEquipmentReviews } from '@/Domain/Equipment/hooks/useEquipment'

export function EquipmentReviewNotice() {
  const { user } = useAuthContext()
  const { data = [] } = useEquipmentReviews()
  const request = data.find(r => r.memberId === user?.memberId && r.status !== 'CONFIRMED')
  if (!request) return null
  return <aside role="status" className="equipment-review-notice">
    <strong>{request.overdue ? 'Revisão de equipamentos em atraso.' : 'Atualize seus equipamentos.'}</strong>{' '}
    Prazo: {new Date(request.dueAt).toLocaleString('pt-BR')}.{' '}
    <Link to="/equipment">Revisar meus equipamentos</Link>
  </aside>
}
