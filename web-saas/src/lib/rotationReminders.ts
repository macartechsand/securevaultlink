/**
 * Device-local state of the rotation reminders (browser storage, per user):
 *  - when each risk was first seen (item ids and dates only, no contents);
 *  - whether browser notifications are on, and the last day one was shown;
 *  - the last day the automatic breach/site check ran.
 * Every access is wrapped: private windows and blocked storage simply turn the feature off.
 */
import { type DeadlineSummary, type RiskSince, notificationText } from './rotationDeadlines'

const key = (name: string, userId: string) => `sv.${name}.${userId}`

function read(name: string, userId: string): string | null {
  try {
    return localStorage.getItem(key(name, userId))
  } catch {
    return null
  }
}

function write(name: string, userId: string, value: string | null) {
  try {
    if (value === null) localStorage.removeItem(key(name, userId))
    else localStorage.setItem(key(name, userId), value)
  } catch {
    /* storage unavailable: reminders just reset */
  }
}

const today = (now = Date.now()) => new Date(now).toISOString().slice(0, 10)

export function loadRiskSince(userId: string): RiskSince {
  try {
    const parsed = JSON.parse(read('riskSince', userId) ?? '{}')
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as RiskSince) : {}
  } catch {
    return {}
  }
}

export function saveRiskSince(userId: string, since: RiskSince) {
  write('riskSince', userId, JSON.stringify(since))
}

/** True once per day: the breach and site check runs by itself after unlocking. */
export function claimDailyCheck(userId: string, now = Date.now()): boolean {
  if (read('autoCheck', userId) === today(now)) return false
  write('autoCheck', userId, today(now))
  return true
}

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window

export function notificationsEnabled(userId: string): boolean {
  return notificationsSupported() && read('rotationNotify', userId) === 'on' && Notification.permission === 'granted'
}

/** Turns browser notifications on (asks the browser's permission) or off. Returns the final state. */
export async function setNotifications(userId: string, on: boolean): Promise<boolean> {
  if (!on || !notificationsSupported()) {
    write('rotationNotify', userId, null)
    return false
  }
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
  if (permission !== 'granted') {
    write('rotationNotify', userId, null)
    return false
  }
  write('rotationNotify', userId, 'on')
  return true
}

/** Shows at most one notification per day, and only when something is overdue or due soon. */
export function maybeNotify(userId: string, summary: DeadlineSummary, onOpen: () => void, now = Date.now()): boolean {
  const body = notificationText(summary)
  if (!body || !notificationsEnabled(userId) || read('notifiedOn', userId) === today(now)) return false
  try {
    const n = new Notification('SecureLink Vault: trocas de senha', { body, tag: 'securelink-rotation', icon: '/icons/icon-192.png' })
    n.onclick = () => {
      window.focus()
      onOpen()
      n.close()
    }
  } catch {
    return false
  }
  write('notifiedOn', userId, today(now))
  return true
}
