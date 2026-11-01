# Conectores e rotação de senhas: arquitetura

Status: 2026-10-28. A troca **assistida** está implementada, também em **1 clique**. Oito conectores automáticos **sob demanda** estão implementados em **beta** (Edge Function `rotate`): AWS IAM access key, AWS IAM senha do console, Microsoft 365 / Entra ID senha de conta corporativa, Google Workspace senha de usuário, Google Cloud service account key, Entra ID client secret, GitLab PAT e Cloudflare API token. Os demais seguem especificados aqui como "Planejado".

## 0. Rotação em 1 clique (implementado)

| Item | O que o clique faz |
|---|---|
| Login (qualquer site) | Gera a senha pela política do conector assistido, copia (limpa em 30 s), abre `/.well-known/change-password` e mostra o modal. **Só salva depois de "O site aceitou"**. A anterior vai para o histórico |
| Segredo com conector e consentimento | O navegador decifra o item e envia a credencial atual à função `rotate` (TLS). A função chama a API, **verifica** a nova e devolve ao navegador, que a **cifra e salva**. A anterior vai para o histórico. A função não guarda nem registra valores |

- **Consentimento por item** (`autoRotation.consentAt`, dentro do item cifrado), dado em Editar → "Rotação automática". Só o dono do item pode rotacionar automaticamente.
- **AWS IAM access key:**
  1. `GetCallerIdentity` com a chave atual (recusa root e chaves temporárias `ASIA…`).
  2. `CreateAccessKey` e espera a propagação; verifica com a **mesma ARN**. Se a verificação falhar, apaga a nova e mantém a atual.
  3. O app salva no cofre e só então chama `revoke_old`, que apaga a chave antiga assinando com a nova.
- **AWS IAM, senha do console** (item Login):
  - `UpdateLoginProfile` com uma senha forte gerada no servidor (4 classes de caracteres, 32 caracteres).
  - A chamada é assinada com a access key administrativa de **outro segredo do cofre**, que o item referencia (`adminItemId`); a chave não é copiada.
  - A senha atual do console **não é enviada**.
  - O login no console não é verificável por API, por isso o resultado aparece como "não verificado".
- **Google Cloud, chave de service account** (JSON no valor do segredo):
  1. JWT RS256 assinado com a chave atual, trocado por um token OAuth.
  2. `serviceAccounts.keys.create`.
  3. Verificação: obter um token com a **nova** chave, com novas tentativas por até cerca de 40 s, por causa da propagação. Se falhar, remove a nova.
  4. O app salva, e `revoke_old` apaga a antiga usando a nova.
  - O `token_uri` do JSON é ignorado; o endpoint é fixo, contra exfiltração.
  - A política da organização `iam.disableServiceAccountKeyCreation` e o limite de 10 chaves geram mensagens claras.
- **Entra ID, client secret** (Application (client) ID em Identificador, tenant na configuração):
  1. Token *client credentials* com a secret atual.
  2. Graph `addPassword`, com validade configurável (padrão 180 dias).
  3. Verificação: um token com a **nova** secret. Se falhar, `removePassword` remove a nova.
  4. O app salva, e `revoke_old` chama `removePassword` para a antiga, autenticado com a nova.
  - O `keyId` da antiga vem da configuração (preenchido após a 1ª rotação) ou do `hint` (3 primeiros caracteres) quando é único. Senão, a antiga não é removida e o app avisa.
- **Senhas de login com credencial administrativa** (Microsoft 365 / Entra ID e Google Workspace, além do console da AWS):
  - O item Login referencia, em `adminItemId`, outro segredo do cofre com a credencial administrativa. O app detecta o tipo pelo formato: AKIA… para AWS, GUID para app Entra, JSON de service account para Google.
  - A senha atual **não é enviada**. A nova (32 caracteres, 4 classes) é gerada no servidor e devolvida só ao navegador.
  - **Entra / M365:** `PATCH /users/{upn}` com `passwordProfile`, usando um app com a permissão de aplicativo `User-PasswordProfile.ReadWrite.All`. Para contas administrativas, o app também precisa da função Privileged Authentication Administrator.
  - **Workspace:** Admin SDK `users.update`, com uma service account com delegação em todo o domínio (escopo `admin.directory.user`), representando um administrador (`adminEmail`).
  - O login interativo (com MFA) não é verificável por API, por isso o resultado aparece como "não verificado".
- **Sem API pública (não automatizável):** Instagram, Facebook (Meta), Gmail e conta Microsoft pessoal (Outlook, Hotmail).
  - Automatizar o login violaria os termos de uso e esbarraria em 2FA e detecção de bots.
  - O 1 clique abre a página de senha de cada plataforma (`KNOWN_CHANGE_PAGES` em `lib/connectors.ts`: Central de Contas da Meta, `myaccount.google.com`, `account.live.com`, `mysignins.microsoft.com`).
- **GitLab:** `POST /personal_access_tokens/self/rotate` com validade configurável (padrão 90 dias), depois verificação. O GitLab revoga o token antigo na hora.
- **Cloudflare:** `/user/tokens/verify` (descobre o id) → `PUT /user/tokens/{id}/value` (roll) → verificação. Só tokens de usuário.
- **Se o cofre não conseguir salvar** depois que a plataforma trocou, o modal não fecha sozinho: mostra "Copiar nova credencial" e "Tentar salvar de novo".
- **Proteções:**
  - JWT obrigatório, e `aal2` quando o usuário tem MFA;
  - limite de 20 chamadas às plataformas por hora por usuário (pedidos recusados pela validação viram `rotation.rejected` e não contam);
  - GitLab próprio só em HTTPS público (sem IP literal, `localhost` ou nomes internos, contra SSRF);
  - redirecionamentos bloqueados e timeout de 15 s;
  - auditoria `rotation.succeeded`, `rotation.failed` (com código) e `rotation.old_revoked`, sem valores.
- **Assinatura AWS SigV4:** `supabase/functions/_shared/sigv4.ts`, validada contra o exemplo oficial da AWS.
- **Testes:** `rotate.integration` chama as APIs reais de AWS, Google, Microsoft, GitLab e Cloudflare com credenciais **falsas** (incluindo uma chave RSA válida de uma service account inexistente e um `token_uri` malicioso, que é ignorado): autenticação, validação, SSRF, erros e nenhum valor ecoado.
- **Para passar de beta a disponível:** rotacionar uma credencial real de baixo risco em cada plataforma e conferir o item, o histórico e a revogação.

## 1. Problema: diversidade de plataformas

| Categoria | Exemplos | Mecanismo de troca | Alcance de rede |
|---|---|---|---|
| Sites e apps | Bancos, e-commerce, redes sociais | Raramente há API. Muitos suportam o padrão W3C `/.well-known/change-password` | Internet (navegador do usuário) |
| Nuvem | AWS IAM (chaves e senha do console) | APIs administrativas (criar → verificar → revogar) | Internet |
| Identidade e diretório | Entra ID, Google Workspace, Okta | APIs de administração do tenant | Internet |
| Tokens de SaaS | GitLab (rotate), Cloudflare (roll), Twilio e SendGrid (criar/revogar) | APIs de tokens. O GitHub **não** permite criar ou rotacionar PATs por API | Internet |
| Bancos de dados | PostgreSQL, MySQL, SQL Server, MongoDB | `ALTER ROLE/USER/LOGIN`, `updateUser` | Geralmente **rede privada** |
| Servidores | Linux (SSH), Windows, Active Directory | `chpasswd`, `authorized_keys`, WinRM, LDAPS | **Rede privada** |
| Cofres de segredos | AWS Secrets Manager, HashiCorp Vault, GitHub Actions | Recebem o novo valor (sincronização) | Internet ou privada |

Não existe um mecanismo único. A solução precisa separar **o que** cada plataforma suporta (manifesto) de **onde** a troca roda (executor).

## 2. Modelo (inspirado nas "plataformas" e no CPM da CyberArk)

### 2.1 Manifesto de conector
Arquivo: `web-saas/src/lib/connectors.ts`, tipo `ConnectorManifest`.

| Campo | Uso |
|---|---|
| `id`, `name`, `category` | Identificação e catálogo |
| `executor` | `assisted` \| `cloud` \| `agent` (onde roda) |
| `status` | `available` \| `planned` |
| `capabilities` | `change`, `verify`, `reconcile`, `rotate_key`, `sync` |
| `itemTypes` | Tipos de item aceitos (login, segredo) |
| `requires` | Credenciais e permissões necessárias, mostradas antes do consentimento |
| `policy` | Política de senha (tamanho, símbolos, caracteres proibidos; por exemplo, aspas em SQL) |

Para adicionar uma plataforma: escreva o manifesto e, se ela for automática, um **adaptador** no executor correspondente que implemente a interface abaixo.

```ts
interface RotationAdapter {
  change(target, current, next): Promise<void>     // ou rotateKey()
  verify(target, next): Promise<boolean>           // login/API call com a nova credencial
  revokeOld?(target, current): Promise<void>       // fase 2 (chaves)
  reconcile?(target, adminCred, next): Promise<void> // quando a credencial atual já não funciona
}
```

### 2.2 Executores
| Executor | Quando | Zero-knowledge | Segurança |
|---|---|---|---|
| **Assistida** (implementado) | Qualquer site, sem API | ✅ Total: o servidor nunca vê a senha | O app gera a senha, abre a página de troca e só salva após confirmação; a anterior vai para o histórico |
| **Nuvem** (worker) | APIs públicas (nuvem, diretório, SaaS) | ⚠️ Parcial: o worker vê a credencial durante a troca | Consentimento explícito por item. Payload cifrado para a chave pública do worker; resultado cifrado de volta para a chave pública do dono; nada em texto puro no banco |
| **Agente local** | Bancos, servidores, AD | ✅ Para o servidor: só o agente do cliente vê | Instalado na rede do cliente, **só faz conexões de saída** (busca tarefas), tem um par de chaves próprio, credenciais escopadas e token por agente |

### 2.3 Troca em duas fases (conectores automáticos)
1. **Criar ou alterar** a nova credencial (para chaves de API, a antiga continua válida).
2. **Verificar** com a nova (login, `sts:GetCallerIdentity`, conexão ao banco).
3. **Persistir** no cofre (item recifrado; a anterior vai para o histórico do dono).
4. **Revogar** a antiga (chaves) e **sincronizar** destinos (Secrets Manager, Vault, CI).
5. Se falhar entre 1 e 3: **reconciliar** com a conta administrativa, ou marcar `needs_manual` e cair na fila assistida.

Cada passo gera evento de auditoria (`rotation.*`) e nunca registra valores.

### 2.4 Fila de tarefas (a implementar com o primeiro conector automático)
Tabela `rotation_jobs`:
- `id`, `item_id`, `owner_id`, `connector_id`, `executor` (`cloud` \| `agent:<id>`)
- `status` (`queued`, `running`, `succeeded`, `failed`, `needs_manual`)
- `sealed_payload` (para o executor), `sealed_result` (para o dono)
- `attempts`, `scheduled_for`, `error_code`

Tabela `rotation_agents`: `id`, `owner/org`, `public_key`, `token_hash`, `last_seen`.

As políticas RLS seguem o padrão do projeto: o dono vê os próprios jobs, e os executores acessam pela service role (worker) ou por função com token de agente.

## 3. O que já existe no app
- Catálogo de conectores com status real (Rotação → Catálogo).
- **Troca assistida** (`components/RotateWizard.tsx`), com página de troca padrão, cópia das senhas com limpeza em 30 s e confirmação.
- **Troca programada** por item (30, 60, 90, 180 ou 365 dias): o risco "Troca programada vencida" aparece na saúde e na postura.
- **Fila de correção** ordenada por risco: vazada, site perigoso, fraca, reutilizada, vencida, antiga.

## 4. Ordem recomendada para os conectores automáticos
1. **AWS IAM access key**: API simples, verificação clara e alto valor (chaves vazadas são um risco grave).
2. **GitLab PAT** e **Cloudflare API token**: têm endpoint nativo de rotação.
3. **Sincronização com AWS Secrets Manager e GitHub Actions secrets**: a troca só serve se os consumidores receberem o valor novo.
4. **Agente local** com **PostgreSQL**, depois Linux (SSH) e AD.
5. Entra ID, Google Workspace e Okta (exigem admin do tenant; fazem mais sentido no plano empresarial, MVP 4).

## 5. Riscos e limites
- **A maioria dos sites não tem API:** a troca assistida continua sendo o caminho padrão.
- **Conectores na nuvem quebram parcialmente o zero-knowledge** durante a troca. Por isso exigem consentimento por item e ficam restritos ao plano pago.
- **Troca agendada sem o usuário presente** exige que o executor tenha acesso permanente à credencial (custódia). Será opt-in explícito e documentado.
- **Cada conector precisa de testes reais** contra a plataforma antes de ser liberado. Nenhum será marcado como disponível sem isso.
