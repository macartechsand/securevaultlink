/**
 * Portuguese messages for errors raised by Supabase, WebCrypto helpers and services.
 * Unknown messages are shown as-is (they never contain secrets).
 */
const EXACT: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha da conta incorretos.',
  'Email not confirmed': 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).',
  'User already registered': 'Já existe uma conta com este e-mail.',
  // The closed-beta trigger rejects the insert; Supabase Auth reports it generically.
  'Database error saving new user':
    'Cadastro indisponível: o acesso está restrito a convidados ou as vagas do beta acabaram. Fale com o administrador.',
  'Wrong master password': 'Senha mestra incorreta.',
  'Wrong recovery key': 'Chave de recuperação incorreta.',
  'Invalid recovery key': 'Chave de recuperação inválida. Confira se copiou todos os grupos.',
  'Recovery is not enabled for this vault': 'A recuperação não está ativada para este cofre.',
  'Unsupported or unsafe key derivation parameters': 'Parâmetros de criptografia do cofre inválidos ou inseguros.',
  'Invalid or expired code. Try again.': 'Código inválido ou expirado. Tente novamente.',
  'No authenticator is enrolled for this account.': 'Nenhum autenticador está configurado nesta conta.',
  'The vault is locked.': 'O cofre está bloqueado.',
  'Not signed in.': 'Você não está conectado.',
  'No vault found.': 'Cofre não encontrado.',
  'Master passwords do not match.': 'As senhas mestras não coincidem.',
  'This file is already shared with that person.': 'Este arquivo já está compartilhado com essa pessoa.',
  'Download failed.': 'Falha no download.',
  'Invalid link': 'Link inválido.',
  'Wrong password or link': 'Senha incorreta.',
  'This transfer is not available (expired, revoked or used up).':
    'Esta transferência não está mais disponível (expirada, revogada ou com downloads esgotados).',
  'Too many requests. Try again later.': 'Muitas tentativas. Tente novamente mais tarde.',
  'Storage quota exceeded': 'Espaço do seu plano esgotado.',
  'File exceeds the per-file size limit': 'O arquivo excede o tamanho máximo permitido pelo seu plano.',
}

const PATTERNS: [RegExp, string][] = [
  [/Password should be at least (\d+) characters/i, 'A senha da conta deve ter pelo menos $1 caracteres.'],
  [/Shares on the free plan must expire within (\d+) hours/i, 'No plano gratuito, compartilhamentos expiram em até $1 horas.'],
  [/(Share|Transfer) duration exceeds your plan limit \((\d+) hours\)/i, 'A duração excede o limite do seu plano ($2 horas).'],
  [/could not be decrypted/i, 'Não foi possível descriptografar (dados corrompidos, chave errada ou adulteração).'],
  [/Failed to fetch|NetworkError|network/i, 'Sem conexão com o servidor. Verifique sua internet e tente novamente.'],
  [/rate limit/i, 'Muitas tentativas. Aguarde um pouco e tente novamente.'],
]

export function friendlyError(error: unknown, fallback = 'Algo deu errado. Tente novamente.'): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : ''
  if (!raw) return fallback
  for (const [key, value] of Object.entries(EXACT)) {
    if (raw === key || raw.endsWith(`: ${key}`)) return value
  }
  for (const [pattern, value] of PATTERNS) {
    const match = raw.match(pattern)
    if (match) return value.replace(/\$(\d)/g, (_, i) => match[Number(i)] ?? '')
  }
  return raw
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1).replace('.', ',')} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
  return `${(n / 1024 / 1024 / 1024).toFixed(1).replace('.', ',')} GB`
}
