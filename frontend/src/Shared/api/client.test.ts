import { describe, expect, it } from 'vitest'
import { withRequestCode } from './client'

describe('withRequestCode', () => {
  it('appends the request id to server errors', () => {
    expect(withRequestCode('Erro inesperado no servidor.', 500, 'abc23xyz9k')).toBe(
      'Erro inesperado no servidor. (código abc23xyz9k)',
    )
  })

  it('leaves validation errors and missing ids alone', () => {
    expect(withRequestCode('Saldo insuficiente.', 400, 'abc23xyz9k')).toBe('Saldo insuficiente.')
    expect(withRequestCode('Erro inesperado.', 502, null)).toBe('Erro inesperado.')
  })
})
