import { describe, expect, it } from 'vitest'
import { pageFromPath, presencePageLabel } from './presencePages'

describe('pageFromPath', () => {
  it('maps the app routes to page keys', () => {
    expect(pageFromPath('/')).toEqual({ page: 'dashboard', detail: null })
    expect(pageFromPath('/party')).toEqual({ page: 'party', detail: null })
    expect(pageFromPath('/auctions')).toEqual({ page: 'auctions', detail: null })
    expect(pageFromPath('/admin/online')).toEqual({ page: 'admin', detail: null })
    expect(pageFromPath('/server-info/some-topic.123')).toEqual({ page: 'server-info', detail: null })
  })

  it('keeps the auction and profile id as detail', () => {
    expect(pageFromPath('/auctions/42')).toEqual({ page: 'auction', detail: '#42' })
    expect(pageFromPath('/profile/7')).toEqual({ page: 'profile', detail: '#7' })
    expect(pageFromPath('/profile')).toEqual({ page: 'profile', detail: null })
  })

  it('reports unknown routes as other', () => {
    expect(pageFromPath('/something-new')).toEqual({ page: 'other', detail: null })
  })
})

describe('presencePageLabel', () => {
  it('appends the detail and falls back for unknown keys', () => {
    expect(presencePageLabel('auction', '#42')).toBe('Leilão #42')
    expect(presencePageLabel('party')).toBe('Party')
    expect(presencePageLabel('bogus')).toBe('Outra página')
  })
})
