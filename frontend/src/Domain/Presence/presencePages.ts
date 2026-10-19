/** Page keys the server accepts (PresenceRegistry.PAGES); anything else is reported as "other". */
export type PresencePage =
  | 'dashboard'
  | 'donate'
  | 'logs'
  | 'objectives'
  | 'events'
  | 'party'
  | 'items'
  | 'auctions'
  | 'auction'
  | 'profile'
  | 'admin'
  | 'server-info'
  | 'other'

export const PRESENCE_PAGE_LABELS: Record<PresencePage, string> = {
  dashboard: 'Dashboard',
  donate: 'Doar Disena',
  logs: 'Logs',
  objectives: 'Objetivos',
  events: 'Eventos',
  party: 'Party',
  items: 'Itens',
  auctions: 'Leilões',
  auction: 'Leilão',
  profile: 'Perfil',
  admin: 'Administração',
  'server-info': 'Cerberus',
  other: 'Outra página',
}

const SECTIONS: Record<string, PresencePage> = {
  donate: 'donate',
  logs: 'logs',
  objectives: 'objectives',
  events: 'events',
  party: 'party',
  items: 'items',
  admin: 'admin',
  'server-info': 'server-info',
}

/** Route → page key plus a short detail (auction or profile id) shown on the leadership panel. */
export function pageFromPath(pathname: string): { page: PresencePage; detail: string | null } {
  const [section, id] = pathname.split('/').filter(Boolean)
  if (!section) return { page: 'dashboard', detail: null }
  if (section === 'auctions') return id ? { page: 'auction', detail: `#${id}` } : { page: 'auctions', detail: null }
  if (section === 'profile') return { page: 'profile', detail: id ? `#${id}` : null }
  return { page: SECTIONS[section] ?? 'other', detail: null }
}

export function presencePageLabel(page: string, detail?: string | null): string {
  const label = PRESENCE_PAGE_LABELS[page as PresencePage] ?? PRESENCE_PAGE_LABELS.other
  return detail ? `${label} ${detail}` : label
}
