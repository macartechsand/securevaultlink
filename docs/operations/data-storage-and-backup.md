# Armazenamento e backup dos dados (produção)

Última atualização: 2026-11-02 · Escopo: beta com **5 usuários Premium por 30 dias**, sem cobrança, em projeto Supabase de produção separado (plano Pro, `sa-east-1`).

Responde a três perguntas antes de colocar credenciais, itens e usuários reais: **onde cada dado fica e de que forma**, **como ele é copiado** e **como se prova que a cópia restaura**.

---

## 1. Onde cada dado fica

| Dado | Onde | Forma armazenada | Quem consegue ler o conteúdo |
|---|---|---|---|
| Itens do cofre (senha, usuário, URL, notas, campos, nome, tipo) | Postgres `vault_entries.ciphertext` | **AES-256-GCM** com chave própria do item; a chave do item é embrulhada pela DEK do usuário (`wrapped_key`) | Só o dono (e quem recebeu compartilhamento, pela chave selada) |
| Histórico de senhas do item | `vault_entries.history_ciphertext` | Cifrado com a chave do item | Só o dono |
| Nomes das pastas | `vault_folders.name_ciphertext` | Cifrado com a DEK | Só o dono |
| DEK (chave de dados do cofre) | `vault_profiles.wrapped_dek_password` / `wrapped_dek_recovery` | Embrulhada pela KEK (PBKDF2-SHA-256, 600 mil iterações, sobre a senha mestra) e, se ativada, pela chave de recuperação | Ninguém além do usuário. A senha mestra **nunca** sai do navegador |
| Chave privada de compartilhamento (ECDH P-256) | `user_keys.wrapped_private_key` | Embrulhada pela DEK | Só o dono. A chave pública fica em claro (é pública) |
| Arquivos do cofre e transferências | Supabase Storage, bucket privado `vault-files` (ou R2, se configurado) | Cifrados no navegador em blocos AES-GCM; nome e tipo em `vault_files.encrypted_meta` | Só o dono / destinatário / quem tem o link com a chave no fragmento `#` |
| Compartilhamentos | `item_shares`, `file_shares` | Chave do item **selada** para o destinatário (ECDH); e-mails das partes em claro | Só as partes |
| Conta (e-mail, hash da senha da conta, fatores MFA) | Schema `auth` do Supabase | Senha da conta em **bcrypt**; segredo TOTP gerido pelo Supabase | Supabase Auth |
| Planos, licenças, convites, configurações, papéis | `user_plans`, `beta_allowlist`, `app_settings`, `app_admins` | Em claro (metadados) | Admins, por funções `SECURITY DEFINER` |
| Auditoria | `audit_events` | Em claro, **append-only e encadeada por SHA-256** (migration `20261102000000`) | O próprio usuário (seus eventos) e admins. Nunca contém valores secretos |
| Postura (contagens de senhas fracas, vazadas etc.) | `posture_snapshots` | Só números agregados | Admins |
| Segredos da plataforma (service role, `CLEANUP_SECRET`, Safe Browsing, R2) | Secrets das Edge Functions | Cifrados pelo Supabase | Só as funções |

**Criptografia em repouso adicional:** o Supabase cifra disco e backups com AES-256; o TLS 1.2+ protege todo o tráfego (HSTS com preload no site).

### O que um vazamento do banco ou de um backup expõe
- **Não expõe:** nenhuma senha, nota, arquivo ou chave do cofre. Para abrir um cofre é preciso a senha mestra do usuário (ou a chave de recuperação), atacada offline contra PBKDF2 de 600 mil iterações; por isso a senha mestra precisa ser uma **frase longa**.
- **Expõe:** e-mails, hashes bcrypt das senhas de conta, datas, contagens, quem compartilhou com quem, eventos de auditoria. Por isso o backup externo é **cifrado de novo** inteiro (seção 3.3).

### Exceção ao zero-knowledge, documentada
Na **rotação automática** (beta, consentida por item), a credencial atual ou a credencial administrativa vinculada passa pela função `rotate` por alguns segundos. Nada é gravado nem registrado; a nova credencial volta ao navegador e é cifrada lá.

---

## 2. Objetivos de recuperação

| Métrica | Alvo no beta | Como é atingido |
|---|---|---|
| **RPO** (quanto dado pode ser perdido) | Banco: até 24 h · Arquivos: até 7 dias | Backup diário do Pro + backup externo semanal (arquivos não entram no backup do Supabase) |
| **RTO** (tempo para voltar) | Até 4 h | Restauração do backup diário pelo painel, ou do backup externo num projeto novo |
| Perda do provedor / da conta Supabase | Recuperável | Backup externo cifrado fora do Supabase, com 2 cópias |
| Usuário esquece a senha mestra | Recuperável **só** com a chave de recuperação | Onboarding exige ativar a chave de recuperação |

Se quiser RPO de minutos para o banco, contrate o **PITR** (cerca de US$ 100/mês para 7 dias; exige compute Small). Para 5 usuários, o diário + semanal externo é proporcional.

---

## 3. Camadas de backup

### 3.1 Backup diário do Supabase (automático, plano Pro)
- Físico, diário, **7 dias** de retenção. Inclui todo o Postgres (inclusive `auth`).
- **Não inclui os objetos do Storage** (só os metadados). Por isso existe a camada 3.3.
- A restauração substitui o banco do projeto e deixa o projeto **fora do ar** durante o processo. Use para incidentes reais, nunca para "dar uma olhada".

### 3.2 PITR (opcional)
Restauração a qualquer segundo dos últimos 7 dias. Recomendado quando passar de 5 para dezenas de usuários.

### 3.3 Backup externo cifrado (semanal, operador)
Scripts em [`scripts/backup/`](../../scripts/backup/). Cobre o que o Supabase não cobre e protege contra perda da conta ou do provedor.

| O que entra | Como |
|---|---|
| Banco: papéis, schema e dados (inclusive `auth`) | `supabase db dump` (via Docker), três arquivos, como na documentação de restauração do Supabase |
| Arquivos do bucket `vault-files` | Baixados com a service role. Já estão cifrados pelos usuários |
| Manifesto | SHA-256 de cada arquivo, contagem de objetos e a **cabeça da cadeia de auditoria** (nº e hash do último evento) |
| Pacote final | `.tar` cifrado com **AES-256-GCM**, chave derivada da frase de backup por **scrypt** (N=2^17). Arquivo `.svbk` + `.sha256` |
| Registro | Evento `system.backup` no log de auditoria; a aba **Conformidade** mostra "Dias desde o último backup externo" |

**Como rodar** (PowerShell, na máquina do administrador, Docker Desktop aberto):

```powershell
# Valores só nesta sessão do terminal. Nunca em arquivo do repositório.
$env:SUPABASE_DB_URL = Read-Host -MaskInput 'Connection string (Session pooler) do projeto de produção'
$env:SUPABASE_URL = 'https://<ref-prod>.supabase.co'
$env:SUPABASE_SERVICE_ROLE_KEY = Read-Host -MaskInput 'Service role key'
$env:BACKUP_PASSPHRASE = Read-Host -MaskInput 'Frase do backup (16+ caracteres)'
node scripts/backup/backup.mjs D:\SecureVaultBackups
```

Regras:
1. **Frase do backup:** longa e exclusiva, guardada no seu cofre **e** em papel num local físico seguro. Sem ela o backup é inútil; com ela, quem tiver o arquivo vê e-mails e metadados (nunca o conteúdo dos cofres).
2. **3-2-1:** o `.svbk` fica no disco local **e** em um segundo lugar (HD externo guardado, ou outro provedor de nuvem que não seja o Supabase).
3. **Retenção:** últimos 8 semanais e 6 mensais. Apague os mais antigos (contas excluídas somem dos backups no fim desse ciclo; seção 6).
4. Anote o **hash final da auditoria** que o script imprime (ou guarde o `.sha256` junto).

### 3.4 Camada do usuário
- **Chave de recuperação** (Configurações): única forma de recuperar o cofre se a senha mestra for esquecida.
- **Exportação cifrada** mensal (Configurações → Backup): o usuário guarda uma cópia do próprio cofre, cifrada, fora do serviço.

---

## 4. Teste de restauração (obrigatório antes de dados reais e depois mensal)

Um backup só conta depois de restaurado uma vez.

1. Crie um projeto Supabase **temporário** (pode ser do plano Free) só para o teste.
2. Verificação do arquivo, sem tocar em projeto nenhum:
   ```powershell
   $env:BACKUP_PASSPHRASE = Read-Host -MaskInput 'Frase do backup'
   node scripts/backup/restore.mjs D:\SecureVaultBackups\securevault-<data>.svbk D:\restore-teste
   ```
   Decifra (a tag GCM falha se a frase estiver errada ou o arquivo tiver sido alterado), confere cada SHA-256 do manifesto e a contagem de arquivos.
3. Carga no projeto temporário:
   ```powershell
   $env:TARGET_DB_URL = Read-Host -MaskInput 'Connection string do projeto TEMPORÁRIO'
   $env:TARGET_SUPABASE_URL = 'https://<ref-temporario>.supabase.co'
   $env:TARGET_SERVICE_ROLE_KEY = Read-Host -MaskInput 'Service role do TEMPORÁRIO'
   node scripts/backup/restore.mjs D:\SecureVaultBackups\securevault-<data>.svbk D:\restore-teste --apply
   ```
   O script recusa restaurar no mesmo projeto de origem (só aceita com `--allow-same-project`, para incidente real).
4. Publique as funções no temporário (ou rode o app local apontando para ele), entre com uma **conta de teste** que exista no backup, desbloqueie o cofre, abra um item e baixe um arquivo.
5. Administração → Conformidade → **Verificar log de auditoria**: a cadeia deve estar íntegra e o hash final igual ao anotado no backup.
6. Apague o projeto temporário e a pasta `D:\restore-teste`. Registre data e resultado na tabela abaixo.

| Data | Backup usado | Cofre abriu | Arquivo abriu | Auditoria íntegra | Responsável |
|---|---|---|---|---|---|
| | | | | | |

---

## 5. Integridade da auditoria

- **Imutável:** `UPDATE`, `DELETE` e `TRUNCATE` em `audit_events` falham para qualquer papel, inclusive a service role.
- **Encadeada:** cada evento guarda `prev_hash` e `row_hash = SHA-256(prev_hash | conteúdo)`. Alterar, inserir no meio ou apagar um evento quebra a cadeia, e **Verificar log de auditoria** aponta o primeiro evento quebrado.
- **Ancorada fora do banco:** cada backup externo grava a cabeça da cadeia. Se alguém com acesso de superusuário apagar o final da cadeia, o hash anotado deixa de existir.
- **Retenção:** 365 dias. A limpeza apaga só o início da cadeia e grava um evento `system.audit_purged` com o hash do último removido.
- **Sobrevive à exclusão de conta:** os eventos ficam com o id (pseudônimo) do usuário.

---

## 6. LGPD

- **Exclusão de conta:** apaga cofre, arquivos, compartilhamentos e a conta. Os **eventos de auditoria** ficam (identificador pseudônimo, sem conteúdo), por legítimo interesse de segurança e prevenção a fraude (LGPD, art. 7º, IX, e art. 16), por até 365 dias.
- **Backups:** dados de uma conta excluída continuam nos backups até eles saírem da retenção (7 dias no Supabase; até 6 meses no externo). Se uma restauração for necessária nesse período, reaplique as exclusões feitas depois da data do backup (lista nos eventos `account.deleted`).
- Informe isso no aviso de privacidade.

---

## 7. Incidentes ligados a dados

| Situação | Ação |
|---|---|
| Linha ou tabela apagada por engano | Restaurar o backup diário mais recente (painel → Database → Backups). Avisar os usuários da janela perdida |
| Arquivo apagado do Storage | Reenviar a partir do último backup externo (`restore.mjs` extrai os objetos; subir só os necessários) |
| Conta Supabase perdida ou provedor indisponível | Criar projeto novo, `restore.mjs --apply` nele (traz banco e arquivos), publicar as funções, recriar os secrets e apontar o site para o novo projeto |
| Suspeita de adulteração | Verificar log de auditoria; comparar a cabeça com a do último backup; preservar o projeto (não restaurar por cima) e investigar |
| Vazamento de um `.svbk` | Os cofres continuam protegidos. Trocar a frase de backup para os próximos; avaliar comunicação aos usuários (e-mails e metadados expostos) |
