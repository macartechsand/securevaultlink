# SecureVault MVP: modelo de segurança e limitações

Escopo: `web-saas/` (React + Vite + Supabase). O app Expo da raiz é um protótipo **legado e congelado**, que não criptografa o cofre e não deve guardar senhas reais.

## Modelo de criptografia (zero-knowledge)

| Elemento | Detalhe |
|---|---|
| Senha mestra | Separada da senha da conta Supabase. Nunca sai do navegador. |
| KDF | PBKDF2-HMAC-SHA256, 600 000 iterações, salt de 16 bytes (WebCrypto). Parâmetros salvos no perfil; o cliente recusa valores abaixo do mínimo ou acima do máximo enviados pelo servidor. |
| Chave de dados (DEK) | 256 bits aleatórios. Cifra todos os itens. Mantida só em memória, como `CryptoKey` não extraível. |
| Envelope | A DEK é embrulhada com AES-256-GCM duas vezes: pela chave derivada da senha mestra e pela chave de recuperação (256 bits aleatórios). |
| Itens | Todo o conteúdo (título, usuário, senha, URL, notas, categoria) vai em um blob AES-256-GCM com IV aleatório de 96 bits. O AAD liga o blob a `user_id` e ao `id` da linha, impedindo troca de blobs entre linhas ou usuários. |
| Servidor | Guarda apenas ciphertext, IVs, salt/parâmetros do KDF e chaves embrulhadas. |

Implementação: `web-saas/src/lib/crypto/`. Evolução prevista: Argon2id (os parâmetros do KDF já ficam versionados no perfil).

## Perda da senha mestra

- **Não há recuperação pelo servidor.** Isso é inerente ao modelo zero-knowledge.
- A **chave de recuperação** é exibida uma única vez no cadastro e não é armazenada. Com ela é possível definir uma nova senha mestra sem perder os dados.
- Sem a senha mestra **e** sem a chave de recuperação, o cofre é irrecuperável, inclusive para os administradores.
- Redefinir a senha da *conta* (Supabase Auth) não recupera o cofre.

## Isolamento entre usuários

- Migration: `supabase/migrations/20261009000000_vault_e2ee.sql` (`vault_profiles`, `vault_entries`).
- RLS habilitado e forçado. Políticas `auth.uid() = user_id` em USING e WITH CHECK; `anon` sem acesso.
- Testes de isolamento: `web-saas/src/services/rls.integration.test.ts` (executam apenas contra um projeto Supabase **de desenvolvimento**, com contas de teste e variáveis de ambiente).
- **Validado em 2026-10-09** no projeto de desenvolvimento: 6/6 testes passaram (leitura, alteração, exclusão e inserção cruzadas bloqueadas; reatribuição de `user_id` bloqueada; acesso anônimo bloqueado; perfis isolados).

## Dados em repouso e em trânsito no cliente

- Nenhum segredo do cofre é gravado em `localStorage`, `sessionStorage` ou IndexedDB. A sessão Supabase usa o armazenamento padrão da biblioteca (token de acesso).
- O cofre trava após 5 minutos de inatividade, no logout, e descarta a DEK e os itens decifrados.
- A cópia de senhas para a área de transferência é limpa após 30 s, se ela ainda contiver o valor copiado e o navegador permitir a leitura.
- Falhas de rede ou de RLS são exibidas como erro. Não há mais fallback silencioso nem sucesso falso.

## Verificações

- **Fraca/reutilizada:** calculadas localmente (zxcvbn-ts e comparação em memória).
- **Exposta:** HIBP Pwned Passwords com k-anonymity (só os 5 primeiros caracteres do SHA-1 saem do dispositivo; cabeçalho `Add-Padding`). Falha de rede aparece como "Check failed", nunca como "seguro".
- **URL:** apenas heurísticas locais (esquema, IP, punycode, credenciais embutidas, TLD, subdomínios). `href` só aceita http(s). Reputação remota (Safe Browsing/Web Risk) ainda **não** está integrada; deve passar por uma Edge Function, com a chave como secret.

## Cabeçalhos (Netlify)

CSP restritiva, HSTS, `X-Frame-Options`/`frame-ancestors`, `nosniff`, `Referrer-Policy: no-referrer`, `Permissions-Policy`, COOP. Ver `netlify.toml`.

## Limitações conhecidas

- **XSS** em qualquer parte do app expõe o cofre desbloqueado (memória) e o token de sessão. Mitigação: CSP, sem HTML dinâmico, dependências mínimas.
- Metadados de tamanho, quantidade de itens e datas de criação/alteração são visíveis ao servidor.
- Sem MFA no MVP: o login da conta depende de e-mail e senha. A senha mestra protege os dados mesmo se a conta for comprometida, mas um atacante com a conta pode apagar o cofre.
- Sem proteção contra malware/keylogger no dispositivo do usuário.
- PBKDF2 é resistente a CPU, mas menos que Argon2id contra GPU. A senha mestra deve ser longa (mínimo de 12 caracteres e validação de força no cadastro).
- Sem exportação/importação, compartilhamento, rotação de senhas, notificações ou planos pagos (adiados).
- Dados do protótipo antigo (tabelas `vault_items`/`secure_links`, texto puro) **não** são lidos nem migrados; as tabelas permanecem intactas. Sem dados reais, devem ser removidas manualmente no projeto de desenvolvimento, após aprovação.
- Não há revisão externa de segurança. Fazer pentest/revisão antes de armazenar credenciais reais de usuários.
