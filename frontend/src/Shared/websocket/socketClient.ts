import { Client, type IMessage, type StompSubscription } from '@stomp/stompjs'
import SockJS from 'sockjs-client'
import { getToken } from '@/Shared/api/client'
import { getWsBaseUrl } from '@/Shared/utils/env'

const CONNECT_TIMEOUT_MS = 10_000

function getWsUrl(): string {
  return getWsBaseUrl()
}

export const WS_URL = getWsUrl()

export type SocketState = 'disconnected' | 'connecting' | 'connected'

interface SubscriptionEntry {
  topic: string
  handler: (message: IMessage) => void
  stomp: StompSubscription | null
}

let stompClient: Client | null = null
let connectResolve: ((c: Client) => void) | null = null
let connectReject: ((err: Error) => void) | null = null
let connectPromise: Promise<Client> | null = null
let connectTimeoutId: ReturnType<typeof setTimeout> | null = null

const subscriptions = new Map<symbol, SubscriptionEntry>()
const reconnectListeners = new Set<() => void>()
let hasConnectedBefore = false

/**
 * Fires after the socket comes back from a drop. Events published while offline are lost,
 * so screens that rely on WS pushes should refetch here.
 */
export function onSocketReconnect(listener: () => void): () => void {
  reconnectListeners.add(listener)
  return () => {
    reconnectListeners.delete(listener)
  }
}

function clearConnectTimeout() {
  if (connectTimeoutId !== null) {
    clearTimeout(connectTimeoutId)
    connectTimeoutId = null
  }
}

function rejectPendingConnect(err: Error) {
  clearConnectTimeout()
  connectPromise = null
  if (connectReject) {
    connectReject(err)
    connectReject = null
    connectResolve = null
  }
}

function resolvePendingConnect(client: Client) {
  clearConnectTimeout()
  connectPromise = null
  if (connectResolve) {
    connectResolve(client)
    connectResolve = null
    connectReject = null
  }
}

function resubscribeAll() {
  if (!stompClient?.connected) return
  subscriptions.forEach((entry) => {
    entry.stomp?.unsubscribe()
    entry.stomp = stompClient!.subscribe(entry.topic, entry.handler)
  })
}

function getOrCreateClient(): Client {
  if (stompClient) return stompClient

  stompClient = new Client({
    webSocketFactory: () => new SockJS(getWsUrl()),
    reconnectDelay: 3000,
    heartbeatIncoming: 10000,
    heartbeatOutgoing: 10000,
    beforeConnect: () => {
      const token = getToken()
      stompClient!.connectHeaders = token ? { Authorization: `Bearer ${token}` } : {}
    },
    onConnect: () => {
      resubscribeAll()
      resolvePendingConnect(stompClient!)
      if (hasConnectedBefore) reconnectListeners.forEach((listener) => listener())
      hasConnectedBefore = true
    },
    onStompError: (frame) => {
      console.error('[WS] STOMP error:', frame.headers.message)
      rejectPendingConnect(new Error(frame.headers.message ?? 'STOMP error'))
    },
    onWebSocketError: (event) => {
      console.error('[WS] WebSocket error:', event)
    },
    onWebSocketClose: () => {
      subscriptions.forEach((entry) => {
        entry.stomp = null
      })
      if (connectPromise && stompClient && !stompClient.active) {
        rejectPendingConnect(new Error('WebSocket closed before connect'))
      }
    },
  })

  return stompClient
}

export function getSocketState(): SocketState {
  if (!stompClient) return 'disconnected'
  if (stompClient.connected) return 'connected'
  if (stompClient.active) return 'connecting'
  return 'disconnected'
}

export function connectSocket(): Promise<Client> {
  const c = getOrCreateClient()

  if (c.connected) return Promise.resolve(c)
  if (connectPromise) return connectPromise

  connectPromise = new Promise<Client>((resolve, reject) => {
    connectResolve = resolve
    connectReject = reject

    connectTimeoutId = setTimeout(() => {
      rejectPendingConnect(new Error('WebSocket connect timeout'))
    }, CONNECT_TIMEOUT_MS)

    if (!c.active) {
      c.activate()
    }
  })

  return connectPromise
}

export async function subscribeTopic(
  topic: string,
  handler: (message: IMessage) => void,
): Promise<() => void> {
  const key = Symbol()
  const entry: SubscriptionEntry = { topic, handler, stomp: null }
  subscriptions.set(key, entry)

  try {
    const c = await connectSocket()
    if (c.connected && subscriptions.has(key) && !entry.stomp) {
      entry.stomp = c.subscribe(topic, handler)
    }
  } catch (err) {
    console.error(`[WS] Failed to subscribe to ${topic}:`, err)
    subscriptions.delete(key)
  }

  return () => {
    entry.stomp?.unsubscribe()
    subscriptions.delete(key)
  }
}

/**
 * Effect-friendly subscribe: returns the cleanup synchronously. Use this inside `useEffect` —
 * with the async variant a cleanup that runs before the subscription resolves (StrictMode's
 * mount → unmount → mount) can't unsubscribe, leaving a duplicate handler.
 */
export function subscribeTopicEffect(
  topic: string,
  handler: (message: IMessage) => void,
): () => void {
  let cancelled = false
  let unsubscribe: (() => void) | undefined
  subscribeTopic(topic, handler).then((fn) => {
    if (cancelled) fn()
    else unsubscribe = fn
  })
  return () => {
    cancelled = true
    unsubscribe?.()
  }
}

/** STOMP SEND to an application destination (`/app/...`). Throws if the socket is not connected. */
export function sendSocketMessage(destination: string, body: unknown): void {
  if (!stompClient?.connected) {
    throw new Error('WebSocket desconectado')
  }
  stompClient.publish({ destination, body: JSON.stringify(body) })
}

export function disconnectSocket(): void {
  clearConnectTimeout()
  subscriptions.clear()
  hasConnectedBefore = false
  stompClient?.deactivate()
  stompClient = null
  connectPromise = null
  connectResolve = null
  connectReject = null
}
