const TTL_MS = 6 * 60 * 60 * 1000

/** Marca a chave no localStorage; false se ela já foi usada (por esta ou outra aba). */
function claim(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false
    localStorage.setItem(key, String(Date.now()))
    const prefix = key.slice(0, key.indexOf(':') + 1)
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(prefix) && Date.now() - Number(localStorage.getItem(k)) > TTL_MS) localStorage.removeItem(k)
    }
  } catch {
    /* sem storage: executa nesta aba */
  }
  return true
}

/**
 * Executa `run` uma única vez por chave, entre todas as abas abertas e entregas repetidas.
 * A chave deve ter um prefixo com ":" (ex.: "schedule-alert:pb-hq|...") para a limpeza.
 * Abas recebem o mesmo aviso juntas: o lock deixa uma de cada vez conferir a marca.
 */
export function onceAcrossTabs(key: string, run: () => void) {
  if (typeof navigator === 'undefined' || !navigator.locks) {
    if (claim(key)) run()
    return
  }
  void navigator.locks.request(key, () => {
    if (claim(key)) run()
  })
}
