import { useState } from 'react'
import {
  useCreateDonation,
  useDonationSettings,
  useDonationsSubscription,
  useMyDonations,
  usePendingDonations,
  useReviewDonation,
  useUpdateDonationSettings,
} from '@/Domain/Donation/hooks/useDonations'
import { useAuthContext } from '@/Features/Auth/contexts/AuthContext'
import type { Donation, DonationStatus } from '@/Domain/types/models'
import { useAppToast } from '@/Shared/ui/components/AppToast/AppToast'
import { Button } from '@/Shared/ui/components/Button/Button'
import { Panel } from '@/Shared/ui/components/Panel/Panel'
import './Donation.styles.scss'

const MIN_KK = 1
const MY_DONATIONS_PAGE_SIZE = 10

const STATUS_LABELS: Record<DonationStatus, string> = {
  PENDENTE: 'Pendente',
  ACEITA: 'Aceita',
  RECUSADA: 'Recusada',
}

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })

const formatNumber = (value: number) => value.toLocaleString('pt-BR')

/** Whole number ≥ min, or null. */
function parseWhole(value: string, min: number): number | null {
  const n = Number(value)
  return value.trim() !== '' && Number.isInteger(n) && n >= min ? n : null
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Algo deu errado. Tente novamente.'
}

export function DonationPage() {
  const { hasRole } = useAuthContext()
  const isAdmin = hasRole('ADMINISTRADOR')
  const { data: settings } = useDonationSettings()

  useDonationsSubscription()

  return (
    <div className="donation-page">
      <DonateForm pointsPerKk={settings?.pointsPerKk} />
      {isAdmin && <PendingDonations pointsPerKk={settings?.pointsPerKk} />}
      {isAdmin && settings && (
        <RateSettings
          key={settings.pointsPerKk}
          pointsPerKk={settings.pointsPerKk}
          updatedBy={settings.updatedByNickname}
          updatedAt={settings.updatedAt}
        />
      )}
      <MyDonations />
    </div>
  )
}

function DonateForm({ pointsPerKk }: { pointsPerKk: number | undefined }) {
  const createDonation = useCreateDonation()
  const { showToast } = useAppToast()
  const [amount, setAmount] = useState('')
  const amountKk = parseWhole(amount, MIN_KK)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (amountKk === null) return
    try {
      await createDonation.mutateAsync(amountKk)
      setAmount('')
      showToast(`Doação de ${formatNumber(amountKk)}kk enviada! Aguarde a liderança confirmar.`, 'success')
    } catch (error) {
      showToast(errorMessage(error), 'error')
    }
  }

  return (
    <Panel title="Doar Disena" code="DSN">
      <form className="donation-form" onSubmit={handleSubmit}>
        <label className="donation-form__field">
          <span>Quantidade</span>
          <div className="donation-form__input">
            <input
              id="donation-amount"
              type="number"
              inputMode="numeric"
              min={MIN_KK}
              step={1}
              placeholder="Ex.: 50"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
            />
            <span className="donation-form__suffix">kk</span>
          </div>
        </label>
        <Button type="submit" loading={createDonation.isPending} disabled={amountKk === null}>
          Enviar doação
        </Button>
      </form>
      <p className="donation-form__hint">
        Mínimo {MIN_KK}kk.
        {pointsPerKk !== undefined && (
          <>
            {' '}Cada 1kk vale <strong>{formatNumber(pointsPerKk)} pts</strong>
            {amountKk !== null && (
              <>
                {' '}· esta doação ≈ <strong>{formatNumber(amountKk * pointsPerKk)} pts</strong>
              </>
            )}
            .
          </>
        )}{' '}
        Os pontos entram quando um líder ou administrador aceitar a doação.
      </p>
    </Panel>
  )
}

function RateSettings({
  pointsPerKk,
  updatedBy,
  updatedAt,
}: {
  pointsPerKk: number
  updatedBy: string | null
  updatedAt: string | null
}) {
  const updateSettings = useUpdateDonationSettings()
  const { showToast } = useAppToast()
  const [value, setValue] = useState(String(pointsPerKk))
  const parsed = parseWhole(value, 1)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (parsed === null) return
    try {
      await updateSettings.mutateAsync(parsed)
      showToast(`Cada 1kk agora vale ${formatNumber(parsed)} pts.`, 'success')
    } catch (error) {
      showToast(errorMessage(error), 'error')
    }
  }

  return (
    <Panel title="Valor da doação" variant="amber" code="ADM">
      <form className="donation-form" onSubmit={handleSubmit}>
        <label className="donation-form__field">
          <span>Pontos por 1kk</span>
          <div className="donation-form__input">
            <input
              id="donation-rate"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              required
            />
            <span className="donation-form__suffix">pts</span>
          </div>
        </label>
        <Button
          type="submit"
          loading={updateSettings.isPending}
          disabled={parsed === null || parsed === pointsPerKk}
        >
          Salvar
        </Button>
      </form>
      <p className="donation-form__hint">
        Vale para as doações aceitas daqui em diante.
        {updatedBy && updatedAt && ` Alterado por ${updatedBy} em ${formatDateTime(updatedAt)}.`}
      </p>
    </Panel>
  )
}

function PendingDonations({ pointsPerKk }: { pointsPerKk: number | undefined }) {
  const { data: pending = [], isLoading } = usePendingDonations()
  const review = useReviewDonation()
  const { showToast } = useAppToast()

  const handleReview = async (donation: Donation, decision: 'accept' | 'reject') => {
    try {
      const result = await review.mutateAsync({ id: donation.id, decision })
      showToast(
        decision === 'accept'
          ? `Doação de ${donation.memberNickname} aceita: +${formatNumber(result.pointsAwarded ?? 0)} pts.`
          : `Doação de ${donation.memberNickname} recusada.`,
        decision === 'accept' ? 'success' : 'info',
      )
    } catch (error) {
      showToast(errorMessage(error), 'error')
    }
  }

  const reviewingId = review.isPending ? review.variables?.id : undefined

  return (
    <Panel title="Doações pendentes" variant="danger" code={`${pending.length} PND`} flush>
      {isLoading ? (
        <p className="donation-list__empty">Carregando doações...</p>
      ) : pending.length === 0 ? (
        <p className="donation-list__empty">Nenhuma doação aguardando aprovação.</p>
      ) : (
        <ul className="donation-list">
          {pending.map((donation) => (
            <li key={donation.id} className="donation-list__item">
              <span className="donation-list__kk">{formatNumber(donation.amountKk)}kk</span>
              <div className="donation-list__info">
                <strong>{donation.memberNickname ?? '—'}</strong>
                <small>
                  {formatDateTime(donation.createdAt)}
                  {pointsPerKk !== undefined &&
                    ` · ≈ ${formatNumber(donation.amountKk * pointsPerKk)} pts`}
                </small>
              </div>
              <div className="donation-list__actions">
                <Button
                  size="sm"
                  loading={reviewingId === donation.id && review.variables?.decision === 'accept'}
                  disabled={reviewingId !== undefined}
                  onClick={() => handleReview(donation, 'accept')}
                >
                  Aceitar
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  loading={reviewingId === donation.id && review.variables?.decision === 'reject'}
                  disabled={reviewingId !== undefined}
                  onClick={() => handleReview(donation, 'reject')}
                >
                  Recusar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

function MyDonations() {
  const [page, setPage] = useState(0)
  const { data, isLoading } = useMyDonations(page, MY_DONATIONS_PAGE_SIZE)
  const donations = data?.content ?? []
  const totalPages = data?.totalPages ?? 0

  return (
    <Panel title="Minhas doações" code={`${data?.totalElements ?? 0} DOA`} flush>
      {isLoading ? (
        <p className="donation-list__empty">Carregando doações...</p>
      ) : donations.length === 0 ? (
        <p className="donation-list__empty">Você ainda não fez nenhuma doação.</p>
      ) : (
        <ul className="donation-list">
          {donations.map((donation) => (
            <li key={donation.id} className="donation-list__item">
              <span className="donation-list__kk">{formatNumber(donation.amountKk)}kk</span>
              <div className="donation-list__info">
                <span
                  className={`donation-list__status donation-list__status--${donation.status.toLowerCase()}`}
                >
                  {STATUS_LABELS[donation.status]}
                </span>
                <small>
                  Enviada em {formatDateTime(donation.createdAt)}
                  {donation.reviewedAt &&
                    ` · ${donation.status === 'ACEITA' ? 'aceita' : 'recusada'} por ${donation.reviewedByNickname ?? '—'} em ${formatDateTime(donation.reviewedAt)}`}
                </small>
              </div>
              {donation.pointsAwarded !== null && (
                <span className="donation-list__points">+{formatNumber(donation.pointsAwarded)} pts</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {totalPages > 1 && (
        <div className="donation-list__pager">
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
            Anterior
          </Button>
          <span>
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="secondary"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </Button>
        </div>
      )}
    </Panel>
  )
}
