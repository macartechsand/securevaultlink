# SecureLink Vault: documento de continuidade do MVP

Última atualização: 2026-10-21 · Branch: `dev` · Commit do MVP: `8d7b06a`

Documento principal para quem vai **operar, recriar ou evoluir** o sistema. Reúne o que existe, como montar um ambiente novo do zero, como operar no dia a dia e o que falta.

| Documento | Para quê |
|---|---|
| **Este arquivo** | Visão completa, ambiente novo, operação, testes, checklist de produção |
| [`security/mvp-security-model.md`](security/mvp-security-model.md) | Modelo de segurança detalhado e limitações |
| [`security/oauth.md`](security/oauth.md) | Login com Google e GitHub (OAuth + PKCE) |
| [`architecture/connectors-rotation.md`](architecture/connectors-rotation.md) | Conectores e rotação de senhas |
| [`mvp-progress.md`](mvp-progress.md) | Histórico, decisões e linha do tempo |
| [`pending-actions.md`](pending-actions.md) | Checklist de ações do responsável no ambiente atual |

---

## 1. Ambiente atual

| Item | Valor |
|---|---|
| App publicado | `https://securelinkvaultdev.netlify.app` (Netlify, site `securelinkvaultdev`, deploy por CLI) |
| Supabase | Projeto de **desenvolvimento**, ref `sueemdqyhwnmbqokpefz`, plano **Free** |
| Código | `web-saas/` (app), `supabase/migrations/` (banco), `supabase/functions/` (Edge Functions), `supabase/admin/` (scripts de operação) |
| Repositório | GitHub `macartechsand/securevaultlink`. **A branch `dev` local não foi enviada ao GitHub** |
| Legado | O app Expo da raiz está congelado; não usar |

---

## 2. Funcionalidades do MVP

### 2.1 Usuário final
| Área | Funcionalidades |
|---|---|
| **Conta** | Cadastro só para convidados (beta fechado); login com e-mail e senha, **Google** ou **GitHub** (OAuth + PKCE); "Esqueci a senha da conta"; links de acesso gerados pelo administrador; **verificação em duas etapas** (TOTP); sessões ativas com encerramento remoto |
| **Cofre** | Senha mestra (zero-knowledge); **chave de recuperação** opcional; troca da senha mestra; bloqueio manual e automático (5 min) |
| **Secured Items** | Tipos **Login, Nota segura, Segredo/chave de API, Cartão**; até 10 campos personalizados (com opção de ocultar); notas de até 4.000 caracteres; até 10 **anexos**; **pastas** (nome cifrado), **tags**, favoritos; busca; filtros por tipo, pasta, tag, risco e compartilhamento |
| **Histórico** | Últimas 10 senhas de cada item, visíveis só para o dono, com "Restaurar" |
| **Compartilhar (conectar usuários)** | Itens com permissão **Visualizar** ou **Editar**; arquivos; validade de até **48 h no gratuito** (Premium até 30 dias ou sem expiração); conferência da **impressão digital** da chave; revogação com **troca de chave** |
| **Arquivos** | Cofre de arquivos cifrados; "Compartilhados comigo"; **transferências por link** para qualquer pessoa (senha opcional, expiração, limite de downloads, revogação) |
| **Saúde e postura** | Senhas fracas, reutilizadas, antigas e com troca vencida; **Verificar segurança**: vazamentos (Have I Been Pwned, k-anonimato) e sites perigosos (Google Safe Browsing); **score de postura** 0–100 com recomendações |
| **Rotação** | **1 clique**: logins geram e copiam a nova senha e abrem `/.well-known/change-password`, e a senha só é salva após confirmação. Segredos da **AWS IAM (access key)**, **GitLab (PAT)** e **Cloudflare (token)** rotacionam **automaticamente** via API, com consentimento por item (beta). Também: troca assistida passo a passo, **troca programada** (30 dias a 1 ano), **fila de correção** por risco e catálogo de **conectores** |
| **Gerador** | Senhas com CSPRNG, sem viés |
| **Atividade** | Log de auditoria da própria conta |
| **Backup e migração** | **Exportação cifrada** (senha própria, PBKDF2 600k + AES-GCM); importação do backup; **importação de CSV** (Chrome, Edge, Firefox, Bitwarden, 1Password, LastPass) |
| **Privacidade (LGPD)** | Aviso de privacidade; controle das métricas enviadas ao suporte; **excluir conta e todos os dados** |
| **Diagnóstico** | Testes do navegador, conexão, cofre, chaves, armazenamento e funções; relatório copiável ou **enviado ao suporte** |
| **Interface** | Tema escuro e claro, português, responsiva |

### 2.2 Administração
Nenhuma função administrativa devolve conteúdo de cofre.

| Aba | Conteúdo |
|---|---|
| Visão geral | Usuários, MFA, recuperação, Premium, itens, arquivos, transferências e sinais operacionais de 24 h |
| **Usuários (IAM)** | Lista com papel, plano, provedores, MFA e score. A ficha tem: **Insights de segurança** (postura em números e metadados do servidor), **Identidade e acesso** (plano, MFA obrigatório, link de redefinição, reset de MFA, encerrar sessões, suspender), **Eventos** e **Suporte** (relatórios recebidos) |
| **Acesso privilegiado (PAM)** | Revisão de quem tem privilégio, até quando, por quê e com que MFA; concessão **temporária** (just-in-time) com justificativa. Só o **Administrador master** concede |
| **Conformidade** | 16 controles marcados como OK, atenção ou falha |
| **Eventos** | Feed global de auditoria com filtros |
| **Beta e limites** | Convites (Gratuito ou **Premium com prazo opcional**), "convidar e gerar link", máximo de contas, cotas, modo de cadastro, MFA obrigatório para todos |
| Saúde do sistema | Bucket, chaves configuradas, limpeza |

Papéis:

| Papel | Pode |
|---|---|
| `owner` (Administrador master) | Tudo, inclusive conceder e revogar papéis |
| `admin` | Gerenciar usuários e configurações |
| `support` / `auditor` | Somente leitura |

Todo papel exige MFA.

---

## 3. Arquitetura

```
Navegador (React 19 + Vite, web-saas/)
  ├─ WebCrypto: senha mestra → PBKDF2 600k → KEK → DEK (AES-256-GCM)
  │   ├─ itens: chave por item (v2), AAD = dono + item + versão
  │   ├─ arquivos: chave por arquivo, blocos de 1 MiB autenticados
  │   └─ compartilhamento: ECDH P-256 → HKDF → AES-GCM
  ├─ Supabase Auth (e-mail/senha, OAuth Google/GitHub com PKCE, TOTP)
  ├─ Supabase Postgres (RLS em todas as tabelas, triggers de auditoria e limites)
  ├─ Supabase Storage (bucket privado vault-files) │ Cloudflare R2 (Premium, opcional)
  └─ Edge Functions: check-url · transfer · cleanup-files · admin · storage-r2 · account
Terceiros: Have I Been Pwned (k-anonimato) · Google Safe Browsing (pela função check-url)
Hospedagem: Netlify (CSP, HSTS, noindex)
```

### 3.1 Banco (principais tabelas)
| Tabela | Conteúdo (cifrado = ilegível ao servidor) |
|---|---|
| `vault_profiles` | Parâmetros do KDF, DEK embrulhada (senha e recuperação) |
| `vault_entries` | Itens (cifrados), chave do item embrulhada, histórico cifrado |
| `vault_folders` | Nome da pasta (cifrado) |
| `item_shares`, `file_shares` | Chave selada ao destinatário, permissão, validade |
| `vault_files`, `transfers` | Metadados cifrados, chaves embrulhadas, backend (Supabase/R2), contadores |
| `user_keys` | Chave pública de compartilhamento; privada embrulhada pela DEK |
| `audit_events` | Log só de inclusão (servidor e app); retenção de 365 dias |
| `user_plans`, `app_settings`, `beta_allowlist`, `user_policies` | Planos, limites, convites, MFA obrigatório |
| `app_admins` | Papéis privilegiados (com validade e justificativa) |
| `posture_snapshots`, `user_preferences`, `support_reports` | Métricas numéricas (opt-out), preferência e relatórios de suporte |

### 3.2 Edge Functions
| Função | JWT | Papel | Secrets |
|---|---|---|---|
| `check-url` | sim | Reputação de URLs (Safe Browsing) | `SAFE_BROWSING_API_KEY` |
| `transfer` | **não** (público) | Download de transferências por link | (service role, automático) |
| `cleanup-files` | **não** (protegida por header) | Limpeza de vencidos e abandonados; heartbeat | `CLEANUP_SECRET` |
| `admin` | sim | MFA reset, suspender, links de convite e redefinição, saúde | `APP_ORIGINS` |
| `storage-r2` | sim | URLs assinadas do R2 (Premium) | `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` |
| `account` | sim | Exclusão da própria conta (LGPD) e "recomeçar cofre" | — |
| `rotate` | sim | Rotação automática em 1 clique (AWS IAM, GitLab, Cloudflare); não guarda nem registra valores; 20 por hora por usuário | — |

---

## 4. Montar um ambiente novo do zero

Use este roteiro para um projeto de **produção** separado do de desenvolvimento.

### 4.1 Supabase
1. Crie o projeto. Para dados reais, use o **plano Pro**: backups diários, 100 GB de storage, sem pausa por inatividade.
2. No terminal, na raiz do repositório:
   ```powershell
   npx supabase login
   npx supabase link --project-ref <REF_NOVO>
   npx supabase db push            # aplica TODAS as migrations, em ordem
   ```
   Isso cria tabelas, RLS, triggers, o bucket `vault-files`, o beta fechado e os papéis. As 15 migrations ficam em `supabase/migrations/` e já estão na ordem certa (`20261009…` → `20261023…`).
3. Edge Functions:
   ```powershell
   npx supabase functions deploy check-url
   npx supabase functions deploy admin
   npx supabase functions deploy storage-r2
   npx supabase functions deploy account
   npx supabase functions deploy transfer --no-verify-jwt
   npx supabase functions deploy cleanup-files --no-verify-jwt
   ```
4. Secrets (gere o `CLEANUP_SECRET` com o gerador seguro, ver `pending-actions.md`):
   ```powershell
   npx supabase secrets set SAFE_BROWSING_API_KEY=<chave> CLEANUP_SECRET=<64 hex> APP_ORIGINS=https://<dominio-do-app>
   ```
5. **Authentication:**
   - **URL Configuration:**
     - Site URL: `https://<dominio-do-app>`
     - Redirect URLs: `https://<dominio-do-app>/**`
   - **Email:**
     - "Confirm email" ligado;
     - senha mínima de 10 caracteres;
     - **SMTP próprio** (Resend, Brevo…). Sem ele, os e-mails só chegam a membros da equipe do projeto.
   - **Providers:** Google e GitHub, ver `security/oauth.md`.
   - **Multi-Factor:** TOTP habilitado.
6. **Cron:** job a cada hora chamando `cleanup-files` (POST, header `x-cleanup-secret`).
7. **Administrador master:** `supabase/admin/create-master-admin.sql` (partes A e B) e depois ative o MFA no app.
8. **Limites:** `supabase/admin/set-mvp-limits.sql`, ou pelo painel em Administração → Beta e limites.

### 4.2 App (Netlify)
1. `web-saas/.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` do projeto novo. A chave anon é pública; **nunca** use a service role no app.
2. Site novo: `npx netlify-cli link --name <site>` na raiz.
3. Build e publicação:
   ```powershell
   cd web-saas; npm ci; npm run build; cd ..
   npx netlify-cli deploy --prod --dir web-saas/dist
   ```
   Publique a partir da **raiz**, para que os cabeçalhos do `netlify.toml` (CSP, HSTS, noindex) sejam aplicados.
4. Para build automático pelo GitHub: configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em Site configuration → Environment variables. O `netlify.toml` já tem o comando.
5. Confira: `curl -sI https://<dominio>` precisa mostrar `Content-Security-Policy`, `Strict-Transport-Security` e `X-Robots-Tag`.

### 4.3 Opcionais
- **Cloudflare R2 (Premium):** bucket privado, token restrito ao bucket, CORS com o domínio do app, secrets `R2_*`. Ver `pending-actions.md`.
- **Web Risk** no lugar do Safe Browsing ao cobrar pelo produto (o Safe Browsing é para uso não comercial).

---

## 5. Operação (runbook)

| Tarefa | Como |
|---|---|
| Convidar usuário | Administração → Beta e limites → **Convidar e gerar link** → enviar o link por mensagem direta |
| Convidar já no **Premium** | Mesmo fluxo, escolhendo **Premium** e, se quiser, os dias (vazio = sem prazo). O plano vale a partir do cadastro; se a conta já existir, vale na hora. Conta no limite de usuários. Quando o prazo acaba, a conta volta ao Gratuito sozinha: novos uploads respeitam a cota menor, e os arquivos e links que já existem continuam. Trocar o plano manualmente em Usuários remove o prazo. Eventos: `plan.granted_by_invite`, `admin.plan_changed` |
| Usuário esqueceu a senha da **conta** | Usuários → ficha → **Gerar link de redefinição** |
| Usuário esqueceu a **senha mestra** | Ninguém consegue redefini-la (nem o admin). Com a **chave de recuperação**: Desbloquear → "Esqueci a senha mestra" → chave + nova senha, sem perder nada. Sem a chave: Desbloquear → "Esqueci a senha mestra" → digitar `APAGAR COFRE`. Isso apaga o cofre (itens, arquivos, pastas, compartilhamentos enviados e recebidos) e mantém conta, MFA e papéis; a pessoa cria uma nova senha mestra. Registrado como `vault.reset` em Eventos (Edge Function `account`, ação `reset_vault`) |
| Usuário perdeu o autenticador | Confirmar a identidade por outro canal → Usuários → ficha → **Resetar MFA** |
| Conta comprometida | **Encerrar sessões** e **Suspender**; pedir troca da senha da conta |
| Dar acesso ao suporte | PAM → conceder **Suporte (leitura)** por 1 a 8 horas, com justificativa |
| Acompanhar riscos | **Conformidade** (falhas em vermelho) e **Eventos** (filtrar `admin.`, `vault.unlock_failed`, `client.error`) |
| Usuário com problema | Pedir que use Configurações → Diagnóstico → **Enviar ao suporte**; ver na ficha → Suporte |
| Limpeza parada | Conformidade → "Horas desde a última limpeza"; conferir o Cron |
| Backup do banco (Free) | Semanal: `npx supabase db dump -f backup-AAAA-MM-DD.sql` (pede a senha do banco). No Pro há backup diário automático |
| Backup dos arquivos | O backup do banco **não inclui os objetos do Storage**; no Pro, considere exportar o bucket periodicamente. Os objetos são cifrados |
| Capacidade (Free) | 1 GB de arquivos (15 × 60 MB), 5 GB de tráfego por mês, projeto pausa após 7 dias sem uso |

**Incidentes:**
- **Vazou a service role ou o `CLEANUP_SECRET`:** gere uma nova no painel do Supabase e atualize os secrets.
- **Vazou a chave anon:** não é segredo, o RLS protege os dados.

---

## 6. Testes

```powershell
cd web-saas
npm test                       # todos os testes (unitários + integração se configurados)
npm test -- src/lib            # só unitários (criptografia, itens, saúde, conectores, backup, postura)
npm test -- integration        # integração contra o Supabase de DESENVOLVIMENTO
```

**Integração:** usa as contas descartáveis A e B em `web-saas/.env.test.local` (git-ignored). Nunca use contas reais.

| Suíte | Cobre |
|---|---|
| `rls.integration` | Isolamento do cofre de senhas |
| `files.integration` | Isolamento de arquivos, storage, cotas, compartilhamento, transferências, planos, auditoria |
| `items.integration` | Secured Items: compartilhamento ver/editar, proteção da chave e do histórico, pastas |
| `iam.integration` | Bloqueio de funções administrativas, métricas de postura, relatórios de suporte |
| `core.integration` | **Ponta a ponta**: persistência, rotação com histórico, conectar usuários, auditoria, HIBP, Safe Browsing ao vivo, transferência anônima |

Última execução (2026-10-21): **107 de 107** (duas vezes seguidas).

---

## 7. Checklist para liberar 15 usuários (MVP produtivo)

| # | Item | Situação |
|---|---|---|
| 1 | Migrations aplicadas e testes de integração passando | ✅ 111/111 total (aplicar `20261022…` e `20261023…` no projeto de dev) |
| 2 | Funcionalidades core validadas de ponta a ponta | ✅ `core.integration` |
| 3 | Cabeçalhos de segurança no site publicado | ✅ Verificados |
| 4 | Cadastro só para convidados | ✅ (trigger + painel) |
| 5 | Limites para 15 usuários | ⬜ Rodar `supabase/admin/set-mvp-limits.sql` |
| 6 | Administrador master com MFA | ⬜ Confirmar |
| 7 | URL Configuration, Confirm email e senha mínima | ⬜ Confirmar |
| 8 | SMTP próprio (ou onboarding só por links do admin) | ⬜ Escolher |
| 9 | Cron da limpeza | ⬜ Confirmar (a Conformidade mostra) |
| 10 | **Backups**: plano Pro **ou** `db dump` semanal | ⬜ **Necessário antes de dados reais** |
| 11 | MFA obrigatório para todos (recomendado) | ⬜ Opcional (Beta e limites) |
| 12 | Revisar o aviso de privacidade (texto rascunho) | ⬜ Responsável |
| 13 | Orientar os usuários: chave de recuperação, MFA, backup cifrado | ⬜ |
| 14 | Enviar a branch `dev` ao GitHub (cópia do código fora desta máquina) | ⬜ Pedir ao Claude |
| 15 | Auditoria externa de segurança | ⬜ Antes de abrir ao público |

---

## 8. Limitações conhecidas
- **Senha mestra:** sem a chave de recuperação, esquecê-la significa perder o cofre.
- **Tamanho de arquivo:** até 25 MB, porque a cifragem é feita em memória. Arquivos maiores exigem streaming.
- **Conectores automáticos de rotação:** AWS IAM, GitLab e Cloudflare funcionam em 1 clique, mas estão em **beta**. Foram testados contra as APIs reais só com credenciais falsas (falham na autenticação, sem alterar nada), e ainda falta validar cada um com uma credencial real de baixo risco. Os demais seguem planejados. Não existe rotação agendada sem o usuário presente: exigiria custódia da credencial.
- **Revogação:** não apaga cópias que o destinatário já tinha. O endpoint autenticado do Storage pode servir um objeto em cache por alguns segundos; o app usa URLs assinadas e não é afetado.
- **Metadados visíveis ao servidor:** quantidade de itens, tamanhos e datas.
- **Confirmação por e-mail com PKCE:** precisa ser aberta no mesmo navegador do cadastro.
- **Supabase Free:** sem backup automático e pausa após 7 dias sem uso.

## 9. Próximos passos sugeridos
1. Itens 5 a 14 do checklist.
2. Projeto de produção separado (seção 4) no plano Pro.
3. Primeiro conector automático (AWS IAM access key) e o agente local (PostgreSQL), conforme `architecture/connectors-rotation.md`.
4. Cifragem em streaming para arquivos grandes (Premium no R2).
5. Planos pagos (Stripe) e equipes e organizações (MVP 4).
6. Auditoria externa / pentest.
