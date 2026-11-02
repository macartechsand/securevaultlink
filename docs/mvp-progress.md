# SecureVault MVP: progresso e retomada

Última atualização: 2026-10-20 · Branch: `dev`

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
| 2026-10-21 | IAM/PAM (owner/admin/support/auditor, acesso temporário), MFA obrigatório por política, suporte por metadados (postura numérica opt-out, relatórios), conformidade e eventos globais. OAuth Google/GitHub com PKCE. **MVP finalizado**: backup cifrado, importação CSV, exclusão de conta (LGPD), aviso de privacidade e testes ponta a ponta das funcionalidades core. **107/107 testes.** Documento de continuidade: `HANDOVER.md`. |
| 2026-10-20 | Migrations e funções das fases A a F aplicadas; **22/22 testes de isolamento passando**. Beta fechado implementado (convites, limite de 10 contas, cotas para o Supabase Free). Corrigido: depois de revogar um compartilhamento, o endpoint autenticado do Storage ainda servia o arquivo por alguns segundos (cache); os downloads agora usam URLs assinadas novas. **Deploy de teste no Netlify** (`securelinkvaultdev.netlify.app`) com os cabeçalhos verificados. |
| 2026-10-19 | Visual aprovado. **Fases C a F implementadas**: Secured Items com chave por item, postura e sessões, administração e diagnóstico, catálogo de conectores com troca assistida e programada, e backend Cloudflare R2. Pendente: 4 migrations, deploy de funções e testes (ver `pending-actions.md`). |
| 2026-10-19 (noite) | Investigação de cadastro e desbloqueio: `my_vault_status()` garante que quem já tem cofre sempre chegue ao desbloqueio, mesmo bloqueado pela política de MFA; falha de carga não aparece mais como senha errada; erros de envio de e-mail (SMTP padrão do Supabase) viram orientação clara. **"Recomeçar cofre"** para quem esqueceu a senha mestra sem chave de recuperação. **Convites Premium** com prazo opcional. Branch `dev` enviada ao GitHub e **PR #1** aberto. |
| 2026-10-28 | **Rotação em 1 clique**: troca assistida rápida para qualquer site e rotação **automática** via API (Edge Function `rotate`), com consentimento por item: AWS IAM (access key e senha do console), Google Cloud (chave de service account), Entra ID (client secret), GitLab e Cloudflare. Assinatura AWS SigV4 validada contra o exemplo oficial. Botão de rotação na lista de itens e no editor. |
| 2026-10-29 | Rotação automática de **senhas de login** do Microsoft 365 / Entra ID e do Google Workspace, com credencial administrativa vinculada de outro item do cofre. Páginas diretas de troca de senha para Instagram, Facebook, Gmail e conta Microsoft pessoal, que não têm API. |
| 2026-11-01 | **Licenças** (Administração → Licenças): 10 licenças Premium por padrão, atribuição com prazo, observação, controle de vagas e vencimentos. Documento de produção [`PRODUCTION.md`](PRODUCTION.md) para 10 usuários Premium com credenciais reais. **130/130 testes.** |
| 2026-11-02 | Escopo do beta reduzido a **5 licenças Premium de 30 dias** (manual, sem cobrança; 6 contas). **Auditoria imutável e encadeada por SHA-256**, com verificação no painel. **Backup externo cifrado** (banco + arquivos, AES-256-GCM/scrypt) e restauração verificada (`scripts/backup`). Documentos de armazenamento/backup e de aderência à CyberArk. |
| 2026-11-02 (tarde) | **Recertificação de acesso**: só o dono e o destinatário ativo acessam cada item (matriz, evidências, riscos residuais). Novos testes: recompartilhamento recusado, destinatário não vê outros compartilhamentos nem chaves do dono, expiração imediata. **Interruptor global da rotação automática** (desligado por padrão em instalação nova). **132/132 testes.** |
| 2026-11-01 (extensão) | **Interface renovada** (menu agrupado com estado da proteção, navegação inferior no celular, medidor de postura, ações rápidas, PWA instalável). **Extensão de navegador, fase 1** (Chrome/Edge, MV3): entrar com MFA, desbloquear, preencher com correspondência de domínio anti-phishing, copiar com limpeza, gerador, bloqueio após 10 min. **142/142 testes** + 6 ponta a ponta no Edge. |
| 2026-11-01 (produção) | **Piloto em produção no plano Free** (15 dias): projeto `securelink-prod` (São Paulo) com as 19 migrations e 7 funções, site https://securelinkvault.netlify.app, PR #1 mesclado em `master`. Extensão com login Google/GitHub e pacote de produção. |
| 2026-11-01 (mobile) | **App Android** (Capacitor 7, `web-saas/android/`): mesmo código e criptografia do app web, empacotado. Bloqueio após 1 min em segundo plano, captura de tela bloqueada, sem backup do sistema, sem depuração na release, login Google/GitHub por deep link, download pelo menu Compartilhar. Validado em emulador Android 13 (fluxos) e Android 16 de usuário (segurança da release). APK de produção assinado. **149/149 testes.** |
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
| Arquivo | Conteúdo |
|---|---|
| `20261009000000_vault_e2ee.sql` | `vault_profiles`, `vault_entries`, RLS por usuário |
| `20261009000100_drop_legacy_plaintext_tables.sql` | **Destrutivo (aprovado):** apaga as tabelas antigas em texto puro |
| `20261010000000_mfa_and_remove_recovery_key.sql` | Políticas `aal2` (MFA) |
| `20261010000100_fix_mfa_policy_permissions.sql` | `private.vault_mfa_satisfied()` |
| `20261011000000_file_vault.sql` | Cofre de arquivos, compartilhamento, transferências, bucket, cotas |
| `20261018000000_fix_file_vault_policies.sql` | Sem recursão de RLS; permissões só por coluna |
| `20261018000100_plans_audit_expiry.sql` | Planos, validade de compartilhamentos, recuperação opcional, auditoria |
| `20261019000000_secured_items.sql` | Secured Items, chave por item, histórico, pastas, compartilhamento de itens |
| `20261019000100_posture_sessions.sql` | Postura e sessões |
| `20261019000200_admin_troubleshooting.sql` | Painel administrativo e diagnóstico |
| `20261019000300_r2_storage.sql` | Backend Cloudflare R2 |
| `20261020000000_closed_beta.sql` | Beta fechado: convites, limite de contas, cotas |
| `20261021000000_iam_pam_support.sql` | IAM/PAM, MFA por política, métricas de suporte, conformidade, eventos |
| `20261022000000_vault_status.sql` | `my_vault_status()` (desbloqueio mesmo com política de MFA) |
| `20261023000000_premium_invites.sql` | Convites Premium com prazo; validade da licença |
| `20261101000000_licenses.sql` | Licenças: vagas Premium (`premium_seats`), atribuição com prazo e observação, resumo para o painel |
| `20261104000000_extension_fill_event.sql` | Evento de auditoria `item.filled` (preenchimento pela extensão; só o ID do item) |
| `20261103000000_auto_rotation_switch.sql` | Interruptor global `auto_rotation` (desligado em instalação nova; ligado onde já foi usado) |
| `20261102000000_beta_scope_audit_integrity.sql` | Beta com 5 licenças/6 contas; auditoria append-only com cadeia de hashes, verificação, retenção que preserva a cadeia; Conformidade com integridade da auditoria e idade do backup externo |

### 3.4 Edge Functions (`supabase/functions/`)
| Função | Papel |
|---|---|
| `check-url` | Reputação de URLs (Safe Browsing) |
| `transfer` | Download público de transferências (sem JWT) |
| `cleanup-files` | Limpeza de vencidos e abandonados (header secreto) |
| `admin` | Reset de MFA, suspensão, links de convite e redefinição, saúde |
| `storage-r2` | URLs assinadas do R2 (Premium) |
| `account` | Exclusão da conta (LGPD) e "recomeçar cofre" |
| `rotate` | Rotação automática em 1 clique (módulos `common`, `google`, `entra`; SigV4 em `_shared/sigv4.ts`) |

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

> **Estado atual (2026-11-01): 130/130** (unitários + integração). Suítes descritas em [`HANDOVER.md`](HANDOVER.md), seção 6. A tabela abaixo é o histórico inicial.

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
