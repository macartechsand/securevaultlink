# Conectores e rotação de senhas: arquitetura

Status: 2026-10-19. A troca **assistida** está implementada. Os conectores automáticos estão especificados aqui e catalogados no app como "Planejado".

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
