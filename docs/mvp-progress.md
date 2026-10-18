# SecureVault MVP: progresso e retomada

Última atualização: 2026-10-19 · Branch: `dev`

Este documento reúne tudo o que foi feito até agora, o estado dos testes e como retomar o trabalho.

| Documento | Conteúdo |
|---|---|
| **[`pending-actions.md`](pending-actions.md)** | **Checklist do que o responsável precisa fazer agora** (cofre de arquivos) |
| [`security/mvp-security-model.md`](security/mvp-security-model.md) | Modelo de criptografia, isolamento, MFA, arquivos e limitações |
| [`architecture/connectors-rotation.md`](architecture/connectors-rotation.md) | Arquitetura de conectores e rotação de senhas |
| Este arquivo | Histórico, decisões, inventário, testes e roadmap |

---

## 1. Decisões do produto

| Tema | Decisão |
|---|---|
| Produto do MVP | Web (`web-saas/`: React 19 + Vite + TypeScript + Supabase). App Expo da raiz **congelado como legado** (não criptografa; não usar com senhas reais). |
| Backend | Só Supabase: Auth, Postgres com RLS, Storage, Edge Functions. Sem Firebase, sem FastAPI. |
| Criptografia | Zero-knowledge no navegador (WebCrypto). O servidor só vê ciphertext e chaves embrulhadas. |
| KDF | PBKDF2-SHA256, 600k iterações; Argon2id como evolução (parâmetros versionados). |
| Recuperação | **Recovery key opcional** (decisão de 2026-10-18; antes não havia recuperação). Ativada em Settings, mostrada uma vez, pode ser regenerada ou desativada com a senha mestra. Sem ela, esquecer a senha mestra significa perder o cofre. |
| MFA | TOTP opcional por usuário, exigido no banco (RLS `aal2`) para quem ativou. |
| URL suspeita | Heurísticas locais + Google Safe Browsing via Edge Function (não comercial; trocar por Web Risk quando houver cobrança). |
| Arquivos | Supabase Storage no MVP; S3 com classes de armazenamento (Standard/IA/Glacier) para Premium. |
| Transferências e compartilhamentos | Link para qualquer pessoa (chave no fragmento `#`), senha opcional, 1–20 downloads. **Free: até 48 h. Premium: até 30 dias**, e compartilhamentos entre usuários Premium podem não expirar. Limites aplicados no banco. |
| Planos | Tabela `user_plans`, alterada só pelo servidor. Free: 100 MB no total e 25 MB por arquivo. Premium: 10 GB (no R2, depois). |
| Auditoria | `audit_events`, só de inclusão: eventos gravados pelo banco (triggers) e eventos informados pelo app (marcados como `client`). Retenção de 365 dias. |
| Testes | Somente em projeto Supabase **de desenvolvimento**, com contas descartáveis. |

---

## 2. Linha do tempo

| Data | Etapa |
|---|---|
| 2026-10-09 | Auditoria do protótipo (Bolt). Achados críticos: senhas em texto puro, "criptografia" por hash, sem RLS. |
| 2026-10-09 | Higiene do repositório; módulo de criptografia; schema com RLS; nova UI sem dados falsos; saúde das senhas; HIBP; heurísticas de URL; headers de segurança. |
| 2026-10-09 | RLS validado no projeto de desenvolvimento (6/6). |
| 2026-10-10 | Chave de recuperação removida; MFA TOTP; Safe Browsing proativo no app; correção do erro de permissão em `mfa_factors`. |
| 2026-10-10 | Usuário validou no navegador: cadastro, cofre de credenciais, MFA e edição. Tudo ok. |
| 2026-10-11 | Cofre de arquivos: arquivos do cofre, compartilhamento assimétrico, transferências temporárias. |
| 2026-10-18 | Nova rodada de requisitos, inspirada no CyberArk Identity. Decisões: recovery key **opcional**; Free com compartilhamentos e transferências de até 48 h e Premium customizado; armazenamento pago no **Cloudflare R2**; visual console escuro + tema claro, em português; rotação assistida agora e conectores no servidor depois. **Fase A implementada**: recovery opcional, planos no banco, validade nos compartilhamentos, log de auditoria e tela Activity. Migration `20261018000100` pendente de aplicação. |
| 2026-10-19 | Visual aprovado. **Fases C a F implementadas**: Secured Items com chave por item, postura e sessões, administração e diagnóstico, catálogo de conectores com troca assistida e programada, e backend Cloudflare R2. Pendente: 4 migrations, deploy de funções e testes (ver `pending-actions.md`). |
| 2026-10-18 | Migrations e Edge Functions dos arquivos aplicadas. Testes de integração acharam 2 defeitos: recursão nas políticas de compartilhamento e permissões padrão do Supabase que deixavam o dono editar colunas protegidas (status, tamanho, contador de downloads). Corrigidos em `20261018000000`; **15/15 testes de isolamento passando**. Pendente: cron da limpeza e roteiro no navegador. |

---

## 3. Inventário

### 3.1 Funcionalidades
**Validadas pelo usuário no navegador:**
- Conta (Supabase Auth) e senha mestra separada; cofre criado no primeiro acesso.
- Credenciais: criar, editar, excluir, categorizar, buscar, mostrar e copiar (área de transferência limpa após 30 s).
- MFA: ativar em Settings; código pedido no login.

**Implementadas, ainda sem validação completa no navegador:**
- Gerador de senhas (CSPRNG, sem viés).
- Painel com dados reais: total, fracas, reutilizadas, expostas (HIBP) e sites perigosos (**Run security check**).
- Verificação de reputação do site ao salvar um item (Safe Browsing).
- Troca da senha mestra; bloqueio manual e automático (5 min).
- Desativar MFA.
- **Cofre de arquivos:**
  - Upload, download e exclusão cifrados.
  - Uso da cota.
  - Compartilhamento por e-mail com impressão digital da chave, revogação e "Shared with me".
  - Transferências por link (senha opcional, expiração, limite de downloads, revogação) e página pública de download.

**Removido do protótipo:** dados e métricas falsos, cache de senhas em texto puro (`localStorage`), fallback silencioso que mostrava sucesso falso, telas fictícias (Monitoring, Reports, plano).

### 3.2 Código (`web-saas/src/`)
| Área | Arquivos |
|---|---|
| Criptografia do cofre | `lib/crypto/vaultCrypto.ts`, `lib/crypto/encoding.ts` |
| Criptografia de arquivos, ECDH e transferências | `lib/crypto/fileCrypto.ts` |
| Sessão (estado, auto-lock, MFA, chaves em memória, erros) | `state/useVaultSession.ts` |
| Serviços | `services/authService.ts`, `vaultService.ts`, `mfaService.ts`, `urlReputation.ts`, `fileService.ts` |
| Gerador, saúde, HIBP, URL | `lib/passwordGenerator.ts`, `lib/health/passwordHealth.ts`, `lib/health/pwned.ts`, `lib/urlCheck.ts` |
| Telas | `App.tsx` e `components/`: `AuthScreen`, `VaultGate`, `MfaChallenge`, `MfaSettings`, `EntryForm`, `PasswordTable`, `Generator`, `Settings`, `FilesView`, `TransferDownload`, `Sidebar`, `StatCard` |
| Testes | `lib/crypto/vaultCrypto.test.ts`, `lib/crypto/fileCrypto.test.ts`, `lib/lib.test.ts`, `services/rls.integration.test.ts`, `services/files.integration.test.ts` |

### 3.3 Banco (`supabase/migrations/`), em ordem de aplicação
| Arquivo | Conteúdo | Aplicado no dev? |
|---|---|---|
| `20261009000000_vault_e2ee.sql` | `vault_profiles`, `vault_entries`, RLS por usuário | ✅ |
| `20261009000100_drop_legacy_plaintext_tables.sql` | **Destrutivo:** apaga `vault_items` e `secure_links` (aprovado) | ⚠️ Não confirmado (opcional) |
| `20261010000000_mfa_and_remove_recovery_key.sql` | Remove a recuperação; políticas `aal2` | ✅ |
| `20261010000100_fix_mfa_policy_permissions.sql` | Checagem `aal2` via `private.vault_mfa_satisfied()` | ✅ |
| `20261011000000_file_vault.sql` | `user_keys`, `vault_files`, `file_shares`, `transfers`, bucket `vault-files`, políticas de storage, cotas, funções | ✅ |
| `20261018000000_fix_file_vault_policies.sql` | Quebra a recursão de RLS (funções `private.*`); revoga os privilégios padrão de `authenticated` e concede só as colunas necessárias (arquivos e cofre de senhas) | ✅ |

### 3.4 Edge Functions (`supabase/functions/`)
| Função | Papel | Acesso | Situação |
|---|---|---|---|
| `check-url` | Reputação de URLs (Safe Browsing), até 50 por chamada | Usuário logado | Publicada (informado); sem teste de ponta a ponta |
| `transfer` | Download público de transferências; consome o download e gera URL assinada de 60 s | Público (`--no-verify-jwt`) | ✅ Publicada; sem teste de ponta a ponta |
| `cleanup-files` | Remove transferências vencidas e uploads abandonados | Header `x-cleanup-secret` | ✅ Publicada; ⏳ agendamento não confirmado (`pending-actions.md` §3) |

Secrets: `SAFE_BROWSING_API_KEY` e `CLEANUP_SECRET` (definidos, informado).

### 3.5 Infra e repositório
- `netlify.toml`: CSP, HSTS, `frame-ancestors`/`X-Frame-Options`, nosniff, Referrer-Policy, Permissions-Policy, COOP; build com `npm ci`.
- `.gitignore` ampliado: `.env*`, `coverage/`, `bin/`, `GoogleService-Info.plist`, keystores (retirados do git; continuam no disco).
- `README.md` atualizado: aponta para estes documentos e marca o mobile como legado.

### 3.6 Commits (branch `dev`, do mais recente ao mais antigo)
```
064ea63 feat: encrypted file vault with user sharing and temporary transfer links
730ff06 feat(web): client-side file encryption, ECDH sharing and transfer link keys
175762d docs: add MVP progress and test-resume guide
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

## 4. Estado dos testes

| Teste | Situação |
|---|---|
| Unitários (`npm test` em `web-saas`): criptografia do cofre e de arquivos, ECDH, transferências, gerador, saúde, HIBP, URL | ✅ 41 passaram (2026-10-11) |
| Typecheck (`tsc -b`), lint (`oxlint`), build (`vite build`) | ✅ Sem erros nem avisos relevantes (2026-10-11) |
| `npm audit` (web-saas) | ✅ 0 vulnerabilidades (2026-10-09) |
| RLS do cofre de senhas (`rls.integration`, 6 testes) | ✅ 6/6 em 2026-10-18 (após as migrations de MFA) |
| Isolamento do cofre de arquivos (`files.integration`, 9 testes) | ✅ 9/9 em 2026-10-18 (após a correção `20261018000000`) |
| Políticas `aal2` (MFA no banco) | ⏳ Sem teste automatizado; MFA validado manualmente pelo usuário |
| Navegador: cadastro, credenciais, MFA, edição | ✅ Validado pelo usuário (2026-10-10) |
| Navegador: painel, Safe Browsing, troca de senha, auto-lock | ⏳ Não confirmado |
| Navegador: cofre de arquivos | ⏳ Pendente → `pending-actions.md` §5 |

Para rodar os testes de integração, credenciais das contas de teste ficam em `web-saas/.env.test.local` (git-ignored; URL e chave pública vêm de `web-saas/.env.local`).

---

## 5. Como retomar

1. **Agora:** seguir [`pending-actions.md`](pending-actions.md) (migration, funções, cron, testes e roteiro de arquivos).
2. **Validações complementares do cofre de senhas:** roteiro abaixo, para os itens ainda não confirmados.
3. **Opcional:** apagar as tabelas legadas com `20261009000100_drop_legacy_plaintext_tables.sql` (irreversível; conferir antes que estão vazias).
4. Com tudo validado: PR `dev` → `main` e deploy no Netlify (variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel do Netlify).

### Roteiro complementar: cofre de senhas
`npm run dev` em `web-saas`, e então:
1. **Persistência:** recarregar (Ctrl+F5) → Unlock → itens intactos. Senha mestra errada → erro, cofre fechado.
2. **Cifragem no servidor:** Table Editor → `vault_entries.ciphertext` ilegível.
3. **Painel:** adicionar uma senha fraca e duas iguais → **Run security check** → fracas, reutilizadas e expostas.
4. **Safe Browsing:** salvar um item com `http://testsafebrowsing.appspot.com/s/malware.html` → alerta e **Save anyway**.
5. **Bloqueio:** **Lock** e auto-lock após 5 min sem interação.
6. **Troca da senha mestra** (Settings) → bloquear → desbloquear com a nova.
7. **MFA:** recarregar a página com MFA ativo → pede o código de novo; desativar em Settings.

Se surgir "Could not load your vault", anote a mensagem exibida na tela.

---

## 6. Roadmap e pendências

### Fases acordadas em 2026-10-18
| Fase | Conteúdo | Situação |
|---|---|---|
| A. Base de segurança | Recovery key opcional, planos, 48 h no Free, auditoria | ✅ Código; ⏳ migration e testes |
| B. Novo visual | Design system escuro + claro, interface em português | ✅ Aprovado pelo responsável (2026-10-19) |
| C. Secured Items | Tipos (login, nota segura, segredo/API key, cartão), campos personalizados, anexos por item, pastas, tags, filtros, histórico de senhas, compartilhamento com permissão de ver ou editar | ✅ Código (2026-10-19); ⏳ migration e testes |
| D. Postura e saúde | Score real (senhas, MFA, recovery, sites, compartilhamentos, idade das senhas), sessões e dispositivos, recomendações | ✅ Código (2026-10-19); ⏳ migration e testes |
| E. Admin e troubleshooting | Painel de admin sem acesso ao conteúdo dos cofres; resetar MFA; saúde do sistema; página de diagnóstico do usuário | ✅ Código (2026-10-19); ⏳ migration, deploy e testes |
| F. Conectores e rotação | Rotação assistida, catálogo de conectores, troca programada, fila de correção, armazenamento Premium no Cloudflare R2. Conectores automáticos especificados ("Planejado") | ✅ Código (2026-10-19); ⏳ migration, deploy, R2 e testes |

### Itens gerais

| Item | Prioridade / fase |
|---|---|
| Ações restantes de `pending-actions.md` (cron e roteiro no navegador) | **Alta, agora** |
| Revisão externa / pentest antes de guardar dados reais | Alta, antes da produção |
| Teste automatizado das políticas `aal2` (TOTP de teste) | Média |
| Exportação e importação cifrada do cofre | MVP 1 |
| Trocar Safe Browsing por Web Risk | Antes de cobrar |
| Planos e cobrança (Stripe na web; IAP/RevenueCat no mobile); cotas por plano | MVP 2 |
| Arquivos Premium: backend S3 com classes (Standard/IA/Glacier), streaming para arquivos grandes, pastas, troca de chave ao revogar | MVP 2 / Premium |
| Monitoramento contínuo de exposição, notificações, rotação assistida de senhas | MVP 2 |
| Extensão de navegador (proteção proativa fora do app) | Pós-MVP / Premium |
| Reconstruir o app mobile sobre `lib/crypto` | MVP 3 |
| Equipes e funções empresariais | MVP 4 |
| Code-splitting (bundle > 500 kB por causa do dicionário zxcvbn) | Baixa |

---

## 7. Limitações conhecidas (resumo)

Detalhes em [`security/mvp-security-model.md`](security/mvp-security-model.md).

- Esquecer a senha mestra = perda definitiva do cofre e dos arquivos.
- Perder o autenticador do MFA exige que um administrador remova o fator no painel do Supabase.
- XSS exporia o cofre desbloqueado; mitigado por CSP e pela ausência de HTML dinâmico.
- Safe Browsing só cobre o que passa pelo app; "No known threats" não é garantia.
- Revogar um compartilhamento não apaga cópias já baixadas.
- A impressão digital deve ser conferida, porque um servidor comprometido poderia trocar a chave pública.
- O destinatário precisa abrir **Files** uma vez para criar o par de chaves antes de receber compartilhamentos.
- Quem tem o link de transferência (e a senha, se houver) baixa o arquivo.
- Arquivos são cifrados inteiros em memória (adequado até 25 MB).
- Metadados (quantidade, tamanhos e datas) são visíveis ao servidor.
- Limites de requisição nas Edge Functions são aproximados.
