# Ações pendentes: cofre de arquivos

Última atualização: 2026-10-11 · Projeto: Supabase **de desenvolvimento** · Branch: `dev`

Tarefas que dependem do responsável pelo projeto (acesso ao painel do Supabase e às contas de teste). Siga a ordem: cada etapa depende da anterior. Marque `[x]` ao concluir.

Contexto do que foi implementado: [`mvp-progress.md`](mvp-progress.md). Modelo de segurança: [`security/mvp-security-model.md`](security/mvp-security-model.md).

---

## Resumo

| # | Tarefa | Onde | Tempo aprox. | Situação |
|---|---|---|---|---|
| 1 | Aplicar a migration do cofre de arquivos | Supabase → SQL Editor | 2 min | ⬜ |
| 2 | Publicar as funções `transfer` e `cleanup-files` e definir `CLEANUP_SECRET` | Terminal | 5 min | ⬜ |
| 3 | Agendar a limpeza de hora em hora | Supabase → Integrations → Cron | 3 min | ⬜ |
| 4 | Criar `web-saas/.env.test.local` e avisar o Claude para rodar os testes | VS Code | 2 min | ⬜ |
| 5 | Roteiro de testes no navegador | Navegador | 15 min | ⬜ |

---

## 1. Aplicar a migration do cofre de arquivos

- [ ] No Supabase de desenvolvimento, abra **SQL Editor → New query**.
- [ ] Cole o conteúdo de `supabase/migrations/20261011000000_file_vault.sql` e clique em **Run**.
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

- [ ] Secret `CLEANUP_SECRET` definido.
- [ ] `transfer` publicada.
- [ ] `cleanup-files` publicada.
- [ ] Conferir em **Edge Functions** no painel: `check-url`, `transfer` e `cleanup-files` aparecem como ativas.

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

- [ ] Crie o arquivo `web-saas\.env.test.local` (o git ignora este arquivo) com as **contas de teste descartáveis**:
  ```
  TEST_USER_A_EMAIL=teste-a@exemplo.invalid
  TEST_USER_A_PASSWORD=<senha da conta A>
  TEST_USER_B_EMAIL=teste-b@exemplo.invalid
  TEST_USER_B_PASSWORD=<senha da conta B>
  ```
- [ ] Avise o Claude. Ele vai rodar:
  - `npm test -- rls.integration`: 6 testes do cofre de senhas.
  - `npm test -- files.integration`: 8 testes do cofre de arquivos.

  Resultado esperado: **14 passed**.
- [ ] Opcional: apague o `.env.test.local` depois.

Regras: nunca use credenciais reais nesse arquivo e nunca envie as senhas pelo chat.

---

## 5. Roteiro de testes no navegador

```powershell
cd "C:\Users\hiago\Documents\security app\securityvaultclone\web-saas"
npm run dev
```

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
