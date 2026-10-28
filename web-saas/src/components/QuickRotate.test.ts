import { describe, expect, it } from 'vitest'
import { emptyItem } from '../lib/items'
import type { VaultItem } from '../state/itemOps'
import { canRotateFromList } from './ItemList'
import { quickRotateMode } from './RotationView'

const item = (patch: Partial<VaultItem['data']>, access: VaultItem['access'] = 'owner') =>
  ({ id: 'i', access, createdAt: '2026-01-01T00:00:00Z', data: { ...emptyItem(patch.type ?? 'login'), ...patch } }) as unknown as VaultItem

const auto = { connectorId: 'gitlab-pat' as const, consentAt: '2026-10-28T10:00:00Z', config: {}, lastRotatedAt: null, expiresAt: null }

describe('quickRotateMode', () => {
  it('logins rotate with the one-click assisted flow', () => {
    expect(quickRotateMode(item({ type: 'login' }))).toBe('assisted')
    expect(quickRotateMode(item({ type: 'login' }, 'edit'))).toBe('assisted')
  })
  it('secrets rotate automatically only with consent and only for the owner', () => {
    expect(quickRotateMode(item({ type: 'secret', autoRotation: auto }))).toBe('auto')
    expect(quickRotateMode(item({ type: 'secret' }))).toBeNull()
    expect(quickRotateMode(item({ type: 'secret', autoRotation: auto }, 'edit'))).toBeNull()
  })
  it('logins with the AWS console connector rotate automatically (owner only)', () => {
    const consoleAuto = { ...auto, connectorId: 'aws-iam-console' as const }
    expect(quickRotateMode(item({ type: 'login', autoRotation: consoleAuto }))).toBe('auto')
    expect(quickRotateMode(item({ type: 'login', autoRotation: consoleAuto }, 'edit'))).toBe('assisted')
  })
  it('view-only items never rotate', () => {
    expect(quickRotateMode(item({ type: 'login' }, 'view'))).toBeNull()
  })
})

describe('rotate button in the item list', () => {
  it('shows for logins (owner or edit) and for the owner's secrets; never for view-only, notes or cards', () => {
    expect(canRotateFromList(item({ type: 'login' }))).toBe(true)
    expect(canRotateFromList(item({ type: 'login' }, 'edit'))).toBe(true)
    expect(canRotateFromList(item({ type: 'secret' }))).toBe(true)
    expect(canRotateFromList(item({ type: 'secret' }, 'edit'))).toBe(false)
    expect(canRotateFromList(item({ type: 'login' }, 'view'))).toBe(false)
    expect(canRotateFromList(item({ type: 'note' }))).toBe(false)
    expect(canRotateFromList(item({ type: 'card' }))).toBe(false)
  })
})
