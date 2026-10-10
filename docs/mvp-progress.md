# SecureVault MVP: progresso e retomada dos testes

Última atualização: 2026-10-11 · Branch: `dev`

Este documento registra o que foi feito até agora e o passo a passo para continuar a validação. Detalhes de segurança: [`docs/security/mvp-security-model.md`](security/mvp-security-model.md).

---

## 1. Contexto e decisões

| Decisão | Escolha |
|---|---|
| Produto do MVP | Web (`web-saas/`: React 19 + Vite + Supabase). App Expo da raiz **congelado como legado** (não criptografa; não usar com senhas reais). |
| Backend | Só Supabase (Auth, Postgres com RLS, Edge Functions). Sem Firebase, sem FastAPI. |
| Criptografia | Zero-knowledge no navegador: PBKDF2-SHA256 (600k) → chave que embrulha uma DEK AES-256-GCM. O servidor só vê ciphertext. |
| Recuperação | **Nenhuma.** A senha mestra é a única chave; se esquecida, o cofre é perdido. A chave de recuperação foi removida (decisão do responsável pelo produto). |
| MFA | TOTP opcional por usuário, exigido no banco (RLS `aal2`) para quem ativou. |
| URL suspeita | Heurísticas locais + Google Safe Browsing via Edge Function (gratuito só para uso não comercial; migrar para Web Risk quando houver cobrança). |
| KDF | PBKDF2 agora; Argon2id como evolução (parâmetros versionados no perfil). |
| Ambiente de testes | Projeto Supabase **de desenvolvimento**, com contas descartáveis. |

---

## 2. O que foi implementado

### Web (`web-saas/src/`)
| Área | Arquivos |
|---|---|
| Criptografia | `lib/crypto/vaultCrypto.ts`, `lib/crypto/encoding.ts` |
| Sessão do cofre (estado, auto-lock 5 min, MFA, erros) | `state/useVaultSession.ts` |
| Acesso a dados (sem fallback silencioso) | `services/vaultService.ts`, `services/authService.ts`, `services/mfaService.ts`, `services/urlReputation.ts` |
| Gerador seguro (CSPRNG, sem viés) | `lib/passwordGenerator.ts` |
| Saúde: fraca/reutilizada (zxcvbn-ts) e exposta (HIBP k-anonymity) | `lib/health/passwordHealth.ts`, `lib/health/pwned.ts` |
| URL: `href` só http(s) + heurísticas | `lib/urlCheck.ts` |
| Telas | `App.tsx`, `components/AuthScreen.tsx`, `VaultGate.tsx`, `MfaChallenge.tsx`, `MfaSettings.tsx`, `EntryForm.tsx`, `PasswordTable.tsx`, `Generator.tsx`, `Settings.tsx`, `Sidebar.tsx`, `StatCard.tsx` |

Funcionalidades disponíveis:
- Conta (Supabase Auth) e senha mestra separada; cofre criado no primeiro acesso.
- Criar, editar, excluir, categorizar, buscar, mostrar e copiar credenciais (área de transferência limpa após 30 s).
- Gerador de senhas.
- Painel com dados reais: total, fracas, reutilizadas, expostas e sites perigosos ("Run security check").
- Verificação automática do site ao salvar um item (se for perigoso, salvar exige confirmação).
- Troca da senha mestra; bloqueio manual e automático.
- MFA: ativar e desativar em Settings; código pedido no login.

Removido: dados e métricas falsos (`mockData.ts`), cache de senhas em texto puro (`localPersistence.ts`), serviço antigo (`supabaseService.ts`), telas fictícias (Monitoring, Reports, plano).

### Banco (`supabase/migrations/`), em ordem de aplicação
| Arquivo | Conteúdo | Aplicado no dev? |
|---|---|---|
| `20261009000000_vault_e2ee.sql` | Tabelas `vault_profiles`, `vault_entries`, RLS por usuário | ✅ Sim |
| `20261009000100_drop_legacy_plaintext_tables.sql` | **Destrutivo:** apaga `vault_items` e `secure_links` (aprovado) | ⚠️ Não confirmado |
| `20261010000000_mfa_and_remove_recovery_key.sql` | Remove a recuperação; políticas `aal2` | ✅ Sim |
| `20261010000100_fix_mfa_policy_permissions.sql` | Corrige "permission denied for table mfa_factors" (função `private.vault_mfa_satisfied()`) | ✅ Sim (fluxos testados pelo usuário) |
| `20261011000000_file_vault.sql` | Cofre de arquivos: tabelas, bucket `vault-files`, políticas de storage, cotas, funções | ⏳ Não aplicado |

### Cofre de arquivos (2026-10-11)
- Criptografia: `web-saas/src/lib/crypto/fileCrypto.ts` (18 testes em `fileCrypto.test.ts`).
- Serviço: `web-saas/src/services/fileService.ts`; telas: `components/FilesView.tsx` (Meus arquivos, Compartilhados comigo, Transferências) e `components/TransferDownload.tsx` (página pública `/?transfer=<id>#k=<segredo>`).
- Testes de isolamento: `web-saas/src/services/files.integration.test.ts` (8 testes; mesmas contas do RLS).
- Detalhes e limitações: seção "Cofre de arquivos" em `docs/security/mvp-security-model.md`.

### Edge Functions
- `supabase/functions/transfer/index.ts`: download público de transferências (deploy com `--no-verify-jwt`).
- `supabase/functions/cleanup-files/index.ts`: limpeza agendada (secret `CLEANUP_SECRET`).
- `supabase/functions/check-url/index.ts`: Safe Browsing, JWT obrigatório, até 50 URLs por chamada, 60 chamadas/hora por usuário, chave em `SAFE_BROWSING_API_KEY`. Deploy e secret: informados como feitos, mas o funcionamento não foi testado.

### Infra e repositório
- `netlify.toml`: CSP, HSTS, `frame-ancestors`/`X-Frame-Options`, nosniff, Referrer-Policy, Permissions-Policy, COOP; build com `npm ci`.
- `.gitignore` ampliado; `coverage/`, `bin/` e `GoogleService-Info.plist` retirados do git (os arquivos continuam no disco).

### Commits (branch `dev`)
```
def8fb2 test: allow RLS integration credentials from git-ignored .env.test.local
62734f2 fix(db): run MFA aal2 check in a security definer function
3675c2f fix(web): surface vault load errors instead of falling back to the unlock screen
d0f0096 feat: TOTP MFA enforced by RLS (aal2), proactive Safe Browsing checks, remove recovery key
6bda832 docs: record RLS isolation validation on dev project
a0a4d1a test: default RLS integration tests to the dev project from .env.local
61b7bd6 feat: Safe Browsing URL reputation via Edge Function; drop legacy plaintext tables migration
5448e07 test+docs: add RLS integration tests and MVP security model
be9745d feat(web): encrypted vault MVP (auth, setup/unlock, CRUD, health, HIBP, URL checks)
ec62db0 feat(web): add client-side vault crypto module with real tests
2280a47 chore: untrack generated/vendored/config files and mark mobile app as legacy
```

---

## 3. Estado dos testes

| Teste | Situação |
|---|---|
| Unitários (`npm test` em `web-saas`): criptografia real, gerador, saúde, HIBP, URL | ✅ 23 passaram (última execução: 2026-10-10) |
| Typecheck (`tsc -b`), lint (`oxlint`), build (`vite build`) | ✅ Passaram |
| RLS: isolamento entre usuários (`src/services/rls.integration.test.ts`) | ✅ 6/6 em 2026-10-09; ⏳ **repetir** após as migrations de MFA |
| RLS com MFA (`aal2`) | ⏳ Sem teste automatizado; validar manualmente |
| Fluxo completo no navegador | ⏳ Pendente |
| Safe Browsing (Edge Function) | ⏳ Pendente |
| `npm audit` (web-saas) | ✅ 0 vulnerabilidades |

**Último problema encontrado:** ao criar uma conta, a tela mostrava `Loading vault profile failed: permission denied for table mfa_factors`. A correção é a migration `20261010000100_fix_mfa_policy_permissions.sql`, cuja aplicação ainda não foi confirmada.

---

## 4. Como retomar os testes

### Passo 1: aplicar a correção do MFA
No Supabase de desenvolvimento, abra **SQL Editor**, cole `supabase/migrations/20261010000100_fix_mfa_policy_permissions.sql` e execute. Resultado esperado: *Success. No rows returned*.

### Passo 2: testes de isolamento (RLS)
1. Crie `web-saas/.env.test.local` (o git ignora este arquivo; use **somente contas descartáveis**):
   ```
   TEST_USER_A_EMAIL=teste-a@exemplo.invalid
   TEST_USER_A_PASSWORD=<senha da conta A>
   TEST_USER_B_EMAIL=teste-b@exemplo.invalid
   TEST_USER_B_PASSWORD=<senha da conta B>
   ```
   A URL e a chave pública do Supabase são lidas de `web-saas/.env.local`. As contas são criadas em **Authentication → Users → Add user**, com **Auto Confirm User** marcado.
2. Execute:
   ```powershell
   cd "C:\Users\hiago\Documents\security app\securityvaultclone\web-saas"
   npm test -- rls.integration
   ```
   Esperado: **6 passed**. Se aparecer **6 skipped**, as variáveis não foram lidas.
3. Opcional: apague `.env.test.local` ao terminar.

### Passo 3: roteiro manual no navegador
`npm run dev` em `web-saas`, e então:
1. **Conta nova:** cadastrar → deve aparecer "Choose a master password" (não "Unlock"). Criar o cofre.
2. **CRUD:** adicionar 3 itens (um com senha fraca, dois com a mesma senha) → editar, excluir, mostrar e copiar.
3. **Persistência:** recarregar (Ctrl+F5) → "Unlock" → senha mestra → itens intactos.
4. **Senha errada:** deve dar erro e não abrir o cofre.
5. **Cifragem no servidor:** no Table Editor, `vault_entries` deve mostrar só texto ilegível em `ciphertext`.
6. **Painel:** "Run security check" → fracas, reutilizadas, expostas (HIBP) e sites.
7. **Safe Browsing:** salvar um item com o site `http://testsafebrowsing.appspot.com/s/malware.html` → deve alertar e pedir "Save anyway".
8. **MFA:** Settings → ativar (QR + código) → sair e entrar → deve pedir o código e depois a senha mestra. Recarregar → pede o código de novo.
9. **Bloqueio:** "Lock" e auto-lock após 5 min sem interação.
10. **Troca da senha mestra** (Settings) → bloquear → desbloquear com a nova senha.

Se surgir "Could not load your vault", anote a mensagem exibida.

### Passo 3b: cofre de arquivos
1. SQL Editor: aplicar `supabase/migrations/20261011000000_file_vault.sql`.
2. Deploy das funções (na raiz do repositório):
   ```powershell
   npx supabase functions deploy transfer --no-verify-jwt
   npx supabase secrets set CLEANUP_SECRET=<valor aleatório com 32+ caracteres>
   npx supabase functions deploy cleanup-files --no-verify-jwt
   ```
3. Agendar a limpeza: Dashboard → Integrations → Cron → novo job a cada hora, do tipo "Supabase Edge Function", chamando `cleanup-files` com método POST e header `x-cleanup-secret: <CLEANUP_SECRET>`.
4. Testes automáticos: `npm test -- files.integration` (esperado: 8 passed).
5. Roteiro no navegador:
   - Files → Upload de um arquivo → Download → comparar com o original.
   - No Storage do Supabase, o objeto em `vault-files` deve ser ilegível.
   - Entrar com a conta B e abrir Files uma vez (cria o par de chaves). Com a conta A: Share → e-mail da B → comparar a impressão digital com a mostrada na conta B → Confirm. Na conta B, o arquivo aparece em "Shared with me" e baixa corretamente. Revoke → some para B.
   - Transfers → criar link com 1 download e senha → abrir o link numa janela anônima → senha → Download. Abrir de novo → "not available".
   - Tentar enviar um arquivo > 25 MB → erro claro.

### Passo 4: limpeza do legado (opcional, irreversível)
Conferir no Table Editor que `vault_items` e `secure_links` não têm dados úteis e rodar `20261009000100_drop_legacy_plaintext_tables.sql`.

---

## 5. Pendências e próximos passos

| Item | Prioridade |
|---|---|
| Passos 1 a 3 acima | Alta |
| Teste automatizado das políticas `aal2` (exige TOTP de teste) | Média |
| Revisão externa/pentest antes de guardar credenciais reais | Alta, antes da produção |
| Trocar Safe Browsing por Web Risk ao lançar o plano pago | Antes da cobrança |
| Exportação/importação cifrada do cofre | MVP 1 (adiado) |
| Cofre de arquivos: aplicar migration, deploy das funções, cron e testes (Passo 3b) | Alta |
| Arquivos: streaming para arquivos grandes, pastas, troca de chave ao revogar, backend S3 com classes de armazenamento | Premium |
| Code-splitting (bundle > 500 kB por causa do dicionário zxcvbn) | Baixa |
| Monitoramento contínuo, notificações, rotação de senhas, planos | MVP 2 |
| Extensão de navegador (Safe Browsing proativo fora do app) | Pós-MVP / Premium |
| Reconstruir o app mobile sobre `lib/crypto` | MVP 3 |
| PR `dev` → `main` após a validação | Após os passos 1 a 3 |

## 6. Limitações conhecidas

- Esquecer a senha mestra = perda definitiva do cofre (sem recuperação).
- Perder o autenticador do MFA exige que um administrador remova o fator no painel do Supabase.
- XSS no app exporia o cofre desbloqueado; mitigado por CSP e pela ausência de HTML dinâmico.
- Safe Browsing só cobre o que passa pelo app; "No known threats" não é garantia.
- Metadados (quantidade de itens, tamanhos, datas) são visíveis ao servidor.
