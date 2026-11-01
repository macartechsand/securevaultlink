import { describe, expect, it } from 'vitest'
import { emptyItem } from './items'
import { ExportError, decryptExport, encryptExport, itemsFromCsv, parseCsv } from './vaultExport'

describe('encrypted export', () => {
  it('round-trips and never contains plaintext', async () => {
    const payload = {
      exportedAt: '2026-10-21T00:00:00Z',
      items: [{ ...emptyItem('login'), title: 'Banco', password: 'S3nha!secreta-123' }],
      folders: [{ id: 'f1', name: 'Finanças' }],
    }
    const file = await encryptExport(payload, 'senha-de-exportacao-forte')
    expect(file).not.toContain('Banco')
    expect(file).not.toContain('S3nha')
    const back = await decryptExport(file, 'senha-de-exportacao-forte')
    expect(back.items[0]).toMatchObject({ title: 'Banco', password: 'S3nha!secreta-123' })
    expect(back.folders).toEqual([{ id: 'f1', name: 'Finanças' }])
  })

  it('rejects wrong passwords, tampering, weak export passwords and foreign files', async () => {
    const file = await encryptExport({ exportedAt: '', items: [], folders: [] }, 'senha-de-exportacao-forte')
    await expect(decryptExport(file, 'errada-errada-errada')).rejects.toBeInstanceOf(ExportError)
    const tampered = JSON.parse(file)
    tampered.ciphertext = tampered.ciphertext.replace(/^./, (c: string) => (c === 'A' ? 'B' : 'A'))
    await expect(decryptExport(JSON.stringify(tampered), 'senha-de-exportacao-forte')).rejects.toBeInstanceOf(ExportError)
    const weakKdf = { ...JSON.parse(file), kdf: { ...JSON.parse(file).kdf, iterations: 1 } }
    await expect(decryptExport(JSON.stringify(weakKdf), 'senha-de-exportacao-forte')).rejects.toBeInstanceOf(ExportError)
    await expect(encryptExport({ exportedAt: '', items: [], folders: [] }, 'curta')).rejects.toBeInstanceOf(ExportError)
    await expect(decryptExport('{"format":"other"}', 'x')).rejects.toBeInstanceOf(ExportError)
    await expect(decryptExport('not json', 'x')).rejects.toBeInstanceOf(ExportError)
  })
})

describe('CSV import', () => {
  it('parses quotes, escaped quotes, CRLF and semicolons', () => {
    expect(parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'he said "hi"'],
    ])
    expect(parseCsv('a;b\n1;2')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('imports Chrome/Edge exports', () => {
    const csv = 'name,url,username,password,note\nGitHub,https://github.com,ana,pw1,\n,https://banco.com.br/login,ana,pw2,conta salário\nsem senha,https://x.com,ana,,'
    const r = itemsFromCsv(csv)
    expect(r.items).toHaveLength(2)
    expect(r.skipped).toBe(1)
    expect(r.items[0]).toMatchObject({ type: 'login', title: 'GitHub', username: 'ana', password: 'pw1' })
    expect(r.items[1]).toMatchObject({ title: 'banco.com.br', notes: 'conta salário' })
    expect(r.items[0].tags).toContain('importado')
  })

  it('imports Bitwarden exports with folders and TOTP as a hidden field', () => {
    const csv = 'folder,favorite,type,name,notes,fields,reprompt,login_uri,login_username,login_password,login_totp\nTrabalho,,login,VPN,,,0,https://vpn.empresa.com,joao,pw,JBSWY3DPEHPK3PXP'
    const r = itemsFromCsv(csv)
    expect(r.source).toBe('Bitwarden')
    expect(r.folders).toEqual(['Trabalho'])
    expect(r.items[0].tags).toEqual(['importado', 'Trabalho'])
    expect(r.items[0].customFields[0]).toMatchObject({ label: 'TOTP', hidden: true })
  })

  it('requires a password column', () => {
    expect(() => itemsFromCsv('name,url\nA,b')).toThrow(ExportError)
  })
})
