# Ações pendentes

Última atualização: 2026-10-20 · Projeto: Supabase **de desenvolvimento** · Branch: `dev`

Tarefas que dependem do responsável pelo projeto (acesso ao painel do Supabase e às contas de teste). Siga a ordem: cada etapa depende da anterior. Marque `[x]` ao concluir.

Contexto do que foi implementado: [`mvp-progress.md`](mvp-progress.md). Modelo de segurança: [`security/mvp-security-model.md`](security/mvp-security-model.md).

---

## Administrador master e cadastro sem e-mail (2026-10-20)

**Por que os links não chegam:** o e-mail padrão do Supabase só envia para membros da equipe do projeto, com limite de cerca de 2 por hora. Até existir um SMTP próprio, use os **links de acesso** gerados no painel. A função `admin` já foi publicada e `APP_ORIGINS` já foi configurado.

1. [ ] **Administrador master:** siga `supabase/admin/create-master-admin.sql`:
   - parte A no SQL Editor;
   - *Add user* no painel, com **Auto Confirm User**;
   - parte B no SQL Editor;
   - no app: criar o cofre, ativar a verificação em duas etapas, sair e entrar com o código.
2. [ ] **Supabase → Authentication → URL Configuration:**
   - *Site URL* = `https://securelinkvaultdev.netlify.app`
   - *Redirect URLs* = `https://securelinkvaultdev.netlify.app/**` e `http://localhost:5173/**`

   Sem isso, os links levam ao endereço errado.
3. **Para cada testador:** Administração → Beta e limites → digite o e-mail → **Convidar e gerar link** → envie o link por mensagem direta. A pessoa abre o link, define a senha da conta e cria o cofre.
4. **Senha da conta esquecida:** Administração → Usuários → (usuário) → **Gerar link de redefinição**.
5. **Opcional:** configurar um SMTP próprio, para que cadastro, confirmação e "Esqueci a senha" funcionem por e-mail.

## Lançamento do beta fechado (10 usuários): fazer agora

Deploy feito em **2026-10-20** em `https://securelinkvaultdev.netlify.app`, a partir do commit `a08ea58`. A versão nova substituiu o protótipo, e os cabeçalhos de segurança e o `noindex` foram verificados de fora.

**Até o passo 1 ser feito, qualquer pessoa consegue criar conta.**

1. [ ] **SQL Editor:** rodar `supabase/migrations/20261020000000_closed_beta.sql`. Ela libera cadastro só para convidados, limita a 10 contas e ajusta as cotas (80 MB por usuário no gratuito). As contas que já existem entram automaticamente na lista de convidados.
2. [ ] **SQL Editor:** rodar `supabase/migrations/20261009000100_drop_legacy_plaintext_tables.sql` (apaga as tabelas em texto puro do protótipo; irreversível).
3. [ ] **Supabase → Authentication → URL Configuration:**
   - *Site URL:* `https://securelinkvaultdev.netlify.app`
   - *Redirect URLs:* `https://securelinkvaultdev.netlify.app/**` e `http://localhost:5173/**`
4. [ ] **Supabase → Authentication → Providers → Email** (ou *Auth Settings*):
   - **Confirm email** ligado. Isso impede que alguém cadastre o e-mail de um convidado antes dele.
   - **Minimum password length**: 10.
5. [ ] **E-mails de confirmação.** O SMTP padrão do Supabase envia **só ~2 e-mails por hora**. Escolha um caminho:
   - **(a) Recomendado:** configurar um SMTP próprio em *Authentication → SMTP Settings*. O Resend, por exemplo, tem plano gratuito.
   - **(b)** Criar cada conta você mesmo em *Authentication → Users → Add user*, com **Auto Confirm User**, e passar a senha temporária à pessoa **por outro canal**, pedindo que ela troque. O e-mail precisa estar convidado (passo 6).
6. [ ] **Convidar os testadores:** Administração → **Beta e limites** → Convidar (exige ser administrador e ter MFA; ver "Tornar-se administrador" abaixo). Avise cada pessoa para se cadastrar com **exatamente** esse e-mail.
7. [ ] **Agendar a limpeza** (`cleanup-files`) de hora em hora no Cron. O painel de Administração mostra se ela rodou.
8. [ ] Se usar o R2: incluir `https://securelinkvaultdev.netlify.app` em `AllowedOrigins` no CORS do bucket.

**Orientações para os testadores:**
- Use uma senha mestra longa e ative a chave de recuperação e a verificação em duas etapas em Configurações.
- **Não guarde senhas reais e importantes durante o beta.** O produto ainda não passou por auditoria externa.
- Para problemas: Configurações → Diagnóstico → Copiar relatório e enviar ao administrador.

**Limites do plano gratuito do Supabase a acompanhar:**
- **Armazenamento:** 1 GB, e a cota de 80 MB × 10 usuários usa 800 MB.
- **Projeto pausado:** acontece após 7 dias sem uso; ao reativar, tudo volta.
- **Tráfego de saída:** 5 GB por mês.
- **Ajuste:** as cotas e o número de contas mudam em Administração → Beta e limites, sem nova migration.

## (Resolvido em 2026-10-20) Protótipo antigo no Netlify

`https://securelinkvaultdev.netlify.app` ainda serve o **protótipo antigo**: métricas fictícias, sem CSP, gravando senhas **em texto puro** na tabela `vault_items` do mesmo projeto Supabase de desenvolvimento.

- [ ] Rodar `supabase/migrations/20261009000100_drop_legacy_plaintext_tables.sql` no SQL Editor. Ele apaga `vault_items` e `secure_links` e é irreversível.
- [x] Versão atual publicada pelo Netlify CLI em 2026-10-20 (o protótipo saiu do ar).

## Fases A a F (2026-10-18 e 2026-10-19): aplicar em ordem

O código de todas as fases está na `dev`. Nada disso funciona no banco até as migrations serem aplicadas **nesta ordem**: cada uma depende da anterior.

### 1. Migrations (SQL Editor, uma por vez)
- [ ] `supabase/migrations/20261018000100_plans_audit_expiry.sql`: planos, 48 h, recovery opcional, auditoria (Fase A)
- [ ] `supabase/migrations/20261019000000_secured_items.sql`: Secured Items, pastas, compartilhamento de itens (Fase C)
- [ ] `supabase/migrations/20261019000100_posture_sessions.sql`: sessões e exposição (Fase D)
- [ ] `supabase/migrations/20261019000200_admin_troubleshooting.sql`: administração (Fase E)
- [ ] `supabase/migrations/20261019000300_r2_storage.sql`: backend R2 para Premium (Fase F)

Resultado esperado em cada uma: *Success. No rows returned*. Se alguma der erro, pare e envie a mensagem ao Claude.

### 2. Edge Functions (terminal, na raiz do repositório)
```powershell
cd "C:\Users\hiago\Documents\security app\securityvaultclone"
npx supabase functions deploy cleanup-files --no-verify-jwt
npx supabase functions deploy transfer --no-verify-jwt
npx supabase functions deploy admin
npx supabase functions deploy storage-r2
```
- [ ] As 4 funções publicadas (`admin` e `storage-r2` **com** verificação de JWT, que é o padrão).

### 3. Testes automáticos
- [ ] Avisar o Claude. Ele roda `rls.integration`, `files.integration` e `items.integration`. Esperado: **22 passed** (6 + 11 + 5).

### 4. Tornar-se administrador (opcional, para o painel de Administração)
1. Ative a verificação em duas etapas na sua conta (Configurações).
2. No SQL Editor, troque o e-mail e rode:
   ```sql
   insert into public.app_admins (user_id, role)
   select id, 'admin' from auth.users where email = 'SEU-EMAIL-AQUI';
   ```
3. Saia e entre de novo informando o código. O item **Administração** aparece no menu.

- [ ] Administrador configurado.

### 5. Armazenamento Premium no Cloudflare R2 (opcional; sem ele, o Premium usa o Supabase Storage)
1. No painel da Cloudflare: **R2 → Create bucket**, por exemplo `securevault-premium`, privado.
2. **R2 → Manage API tokens → Create API token** com *Object Read & Write* **só nesse bucket**. Anote o Account ID, o Access Key ID e o Secret Access Key, sem compartilhar com ninguém.
3. No bucket, em **Settings → CORS policy**, cole o bloco abaixo, trocando a origem pela do app (e `http://localhost:5173` para testes):
   ```json
   [{ "AllowedOrigins": ["http://localhost:5173"], "AllowedMethods": ["PUT", "GET"], "AllowedHeaders": ["Content-Type"], "MaxAgeSeconds": 600 }]
   ```
4. No terminal:
   ```powershell
   npx supabase secrets set R2_ACCOUNT_ID=<id> R2_ACCESS_KEY_ID=<key> R2_SECRET_ACCESS_KEY=<secret> R2_BUCKET=securevault-premium
   ```
5. Para testar, coloque uma conta de teste no plano Premium (Administração → Usuários → Plano Premium) e envie um arquivo. No painel do R2, o objeto aparece cifrado.

- [ ] R2 configurado e testado (ou adiado).

### 6. Roteiro no navegador (`npm run dev` em `web-saas`)
- **Recovery key:** Configurações → Ativar chave de recuperação → guardar → Bloquear → "Esqueci a senha mestra" → chave + nova senha mestra. O cofre abre com os itens.
- **Secured Items:** Novo item → criar um de cada tipo (Login, Nota segura, Segredo, Cartão) com um campo personalizado oculto, uma tag, uma pasta e um anexo. Filtrar por tipo, pasta, tag e risco.
- **Histórico:** editar a senha de um login → aba "Histórico de senhas" → a anterior aparece → Restaurar.
- **Compartilhar item:** com a conta B, permissão *Visualizar*, por 1 hora. B vê o item (somente leitura) e baixa o anexo. Mude para *Editar*: B consegue editar. Revogar: o item some para B.
- **Arquivos:** o compartilhamento oferece no máximo 48 horas (plano gratuito).
- **Postura:** a Visão geral mostra o score e as recomendações. Os botões levam ao filtro certo.
- **Sessões:** Configurações → Sessões ativas. Abra outra janela anônima com a mesma conta e encerre essa sessão daqui.
- **Rotação:** defina "Troca programada" em um login; na página Rotação, use "Trocar com assistência".
- **Diagnóstico:** Configurações → Executar diagnóstico → todos OK (ou anote as falhas).
- **Atividade:** os eventos novos aparecem (item compartilhado, sessão encerrada etc.).

## Histórico: cofre de arquivos (concluído, exceto o Cron)

| # | Tarefa | Onde | Tempo aprox. | Situação |
|---|---|---|---|---|
| 1 | Aplicar as migrations do cofre de arquivos (`20261011000000` e a correção `20261018000000`) | Supabase → SQL Editor | 2 min | ✅ 2026-10-18 |
| 2 | Publicar as funções `transfer` e `cleanup-files` e definir `CLEANUP_SECRET` | Terminal | 5 min | ✅ 2026-10-18 |
| 3 | Agendar a limpeza de hora em hora | Supabase → Integrations → Cron | 3 min | ⬜ Não confirmado (o painel de Administração mostra a última execução) |
| 4 | Criar `web-saas/.env.test.local` e avisar o Claude para rodar os testes | VS Code | 2 min | ✅ 15/15 em 2026-10-18 |
| 5 | Roteiro de testes no navegador | Navegador | 15 min | ⬜ |

---

## 1. Aplicar a migration do cofre de arquivos

- [x] No Supabase de desenvolvimento, abra **SQL Editor → New query**.
- [x] Cole o conteúdo de `supabase/migrations/20261011000000_file_vault.sql` e clique em **Run**.
- [x] Aplique também a correção `supabase/migrations/20261018000000_fix_file_vault_policies.sql` (recursão nas políticas de compartilhamento e permissões de colunas; encontrada pelos testes em 2026-10-18).
- [ ] Resultado esperado: *Success. No rows returned*.
- [ ] Conferir:
  - **Table Editor:** tabelas `user_keys`, `vault_files`, `file_shares` e `transfers`, todas com RLS ativo.
  - **Storage:** bucket `vault-files`, marcado como **privado**.

Se der erro, copie a mensagem completa (não contém senhas) e envie ao Claude. Não tente corrigir o SQL manualmente.

---

## 2. Publicar as Edge Functions

Pré-requisito: Supabase CLI autenticada e projeto vinculado. Se você já publicou `check-url`, isso já está feito. Caso contrário:

```powershell
cd "C:\Users\hiago\Documents\security app\securityvaultclone"
npx supabase login
npx supabase link --project-ref <ref do projeto de desenvolvimento>
```

### 2.1 Gerar o segredo da limpeza
No PowerShell, gere um valor aleatório com 64 caracteres. **Não o envie a ninguém** e guarde-o para o passo 3:

```powershell
$bytes = [byte[]]::new(32)
[System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
$secret = -join ($bytes | ForEach-Object { $_.ToString('x2') })
$secret
```

### 2.2 Publicar
```powershell
npx supabase secrets set CLEANUP_SECRET=$secret
npx supabase functions deploy transfer --no-verify-jwt
npx supabase functions deploy cleanup-files --no-verify-jwt
```

- [x] Secret `CLEANUP_SECRET` definido.
- [x] `transfer` publicada.
- [x] `cleanup-files` publicada.
- [x] Conferir em **Edge Functions** no painel: `check-url`, `transfer` e `cleanup-files` aparecem como ativas.

O `--no-verify-jwt` é intencional nessas duas funções. `transfer` atende pessoas sem conta (quem recebe o link), e `cleanup-files` é protegida pelo `CLEANUP_SECRET`. A `check-url` continua exigindo login.

---

## 3. Agendar a limpeza automática

A limpeza apaga transferências vencidas, esgotadas ou revogadas, e uploads abandonados.

- [ ] No painel: **Integrations → Cron** (habilite a integração se for pedido) → **Create job**.
- [ ] Configuração:
  | Campo | Valor |
  |---|---|
  | Nome | `cleanup-files-hourly` |
  | Agenda | `0 * * * *` (de hora em hora) |
  | Tipo | **Supabase Edge Function** |
  | Função | `cleanup-files` |
  | Método | `POST` |
  | Header | `x-cleanup-secret` = o valor gerado no passo 2.1 |
- [ ] Salvar e, se houver a opção, executar uma vez manualmente. A resposta esperada é `{"removed":0}` (ou um número, se houver itens vencidos).

Se a resposta for `forbidden`, o header está errado. Se for `cleanup not configured`, o secret não foi definido ou tem menos de 32 caracteres.

---

## 4. Testes automáticos de isolamento

- [x] Crie o arquivo `web-saas\.env.test.local` (o git ignora este arquivo) com as **contas de teste descartáveis**:
  ```
  TEST_USER_A_EMAIL=teste-a@exemplo.invalid
  TEST_USER_A_PASSWORD=<senha da conta A>
  TEST_USER_B_EMAIL=teste-b@exemplo.invalid
  TEST_USER_B_PASSWORD=<senha da conta B>
  ```
- [x] Avise o Claude. Ele vai rodar:
  - `npm test -- rls.integration`: 6 testes do cofre de senhas.
  - `npm test -- files.integration`: 9 testes do cofre de arquivos.

  Resultado esperado: **15 passed**. **Resultado em 2026-10-18: 15 passed.**
- [ ] Opcional: apague o `.env.test.local` depois.

Regras: nunca use credenciais reais nesse arquivo e nunca envie as senhas pelo chat.

---

## 5. Roteiro de testes no navegador

```powershell
cd "C:\Users\hiago\Documents\security app\securityvaultclone\web-saas"
npm run dev
```

Antes do roteiro de arquivos, confira rapidamente no cofre de senhas que **editar uma credencial** e **trocar a senha mestra** (Settings) continuam funcionando. As permissões de colunas dessas tabelas foram restringidas na correção de 2026-10-18.

### 5.1 Upload e download
- [ ] Entre com a conta A → **Files → My files → Upload file** com um arquivo pequeno (PDF ou imagem).
- [ ] Clique em **Download** e confirme que o arquivo abre igual ao original.
- [ ] No painel: **Storage → vault-files → pasta da conta A**. O objeto deve ser ilegível, e o nome é um UUID, não o nome original.
- [ ] Tente enviar um arquivo **maior que 25 MB**. Deve aparecer uma mensagem de limite.

### 5.2 Compartilhamento entre as contas A e B
- [ ] Entre com a conta **B** → abra **Files** uma vez, o que cria o par de chaves dela. Em **Shared with me**, anote a **impressão digital** (*Your sharing key fingerprint*).
- [ ] Saia e entre com a conta **A** → **Files → Share** no arquivo → informe o e-mail da B → **Find**.
- [ ] A impressão digital exibida deve ser **idêntica** à anotada na conta B. Só então clique em **Confirm and share**.
- [ ] Entre com a conta **B** → **Shared with me**. O arquivo aparece com "from <e-mail da A>" e o **Download** funciona.
- [ ] Volte à conta **A** → **Share** → **Revoke**. Na conta **B**, o arquivo deve sumir (recarregue a página).

### 5.3 Link de transferência temporária
- [ ] Conta A → **Files → Transfers**: escolha um arquivo, **1 dia**, **1 download**, com **senha** → **Create transfer link** → **Copy**.
- [ ] Abra o link numa **janela anônima** (sem login) → informe a senha → **Download**. O arquivo deve abrir corretamente.
- [ ] Abra o link de novo. Deve aparecer "not available", porque o download foi esgotado.
- [ ] Crie outro link sem senha → **Revoke** na lista → abra o link. Deve aparecer "not available".
- [ ] Abra um link sem a parte depois do `#`. Deve aparecer "the decryption key (after #) is missing".

### O que relatar ao Claude
Para cada item que falhar: o passo, o que aconteceu e a mensagem exibida na tela. Não envie senhas, links de transferência nem o `CLEANUP_SECRET`.

---

## Depois destas ações

Com tudo marcado, os próximos passos são:
1. Atualizar `mvp-progress.md` com os resultados.
2. Abrir o PR `dev` → `main`.
3. Planejar os próximos itens do roadmap (seção 6 de `mvp-progress.md`).
