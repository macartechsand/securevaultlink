import { describe, expect, it } from 'vitest'
import { emptyItem } from './items'
import { offlineReaderHtml, openBackupStandalone } from './offlineReader'
import { encryptExport } from './vaultExport'

const payload = {
  exportedAt: '2026-11-06T10:00:00.000Z',
  items: [{ ...emptyItem('login'), title: 'Banco', username: 'ana', password: 'alpha-secret-123', url: 'https://banco.example' }],
  folders: [{ id: 'f1', name: 'Pessoal' }],
}

describe('offline backup reader', () => {
  it('opens an export made by the app, without the app code', async () => {
    const file = await encryptExport(payload, 'senha-de-exportacao-1')
    const opened = await openBackupStandalone(file, 'senha-de-exportacao-1')
    expect(opened.exportedAt).toBe(payload.exportedAt)
    expect(opened.folders).toEqual(payload.folders)
    expect(opened.items[0]).toMatchObject({ title: 'Banco', username: 'ana', password: 'alpha-secret-123' })
  })

  it('rejects a wrong password, a tampered file and weak parameters', async () => {
    const file = await encryptExport(payload, 'senha-de-exportacao-1')
    await expect(openBackupStandalone(file, 'outra-senha-qualquer')).rejects.toThrow(/incorreta/)
    const tampered = JSON.parse(file)
    tampered.ciphertext = tampered.ciphertext.slice(0, -4) + (tampered.ciphertext.endsWith('AAAA') ? 'BBBB' : 'AAAA')
    await expect(openBackupStandalone(JSON.stringify(tampered), 'senha-de-exportacao-1')).rejects.toThrow(/incorreta|corrompido/)
    const weak = { ...JSON.parse(file), kdf: { ...JSON.parse(file).kdf, iterations: 1000 } }
    await expect(openBackupStandalone(JSON.stringify(weak), 'senha-de-exportacao-1')).rejects.toThrow(/Parâmetros/)
    await expect(openBackupStandalone('not json', 'x')).rejects.toThrow(/inválido/)
  })

  it('the page blocks the network, never renders HTML from the backup and its script compiles', () => {
    const html = offlineReaderHtml()
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain("default-src 'none'")
    expect(html).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|https?:\/\//)
    const script = html.slice(html.indexOf('<script>') + 8, html.indexOf('</script>'))
    // Compiles without running (no DOM needed); a syntax error from the embedding would throw here.
    expect(() => new Function(script)).not.toThrow()
  })
})
