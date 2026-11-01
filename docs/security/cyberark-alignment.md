# Aderência às boas práticas CyberArk (Vault e Secured Items)

Última atualização: 2026-11-02 · Escopo avaliado: beta de **5 usuários Premium**, cofre pessoal zero-knowledge em SaaS (Supabase + Netlify), sem cobrança.

Referências pedidas pelo dono do produto:
- CyberArk Identity: *Manage Secured Items* (docs.cyberark.com/access/…/manage-secured-items.htm)
- PAM Self-Hosted: *Security Fundamentals – Introduction* (camadas de segurança do Digital Vault)
- PAM Self-Hosted: *Digital Vault Server Security Standards and Requirements*

> As páginas da CyberArk retornaram 404 para acesso automatizado em 2026-11-02 (inclusive a raiz do portal). A análise usa o conteúdo público conhecido desses padrões: as camadas do Vault (firewall próprio, isolamento código-dados, criptografia de arquivos em camadas, comunicação cifrada, autenticação forte, controle de acesso granular, dual control, trilha de auditoria à prova de adulteração, backup/DR) e o Server Security Standard (servidor dedicado e endurecido, sem domínio, sem software de terceiros, só a porta do Vault aberta, segurança física, chave do servidor e chave de recuperação fora do servidor, acesso administrativo restrito). Vale conferir os pontos marcados como **Gap** contra a versão vigente das páginas.

## Como ler
**Atende**: implementado e testado. **Parcial**: existe, com limitação conhecida. **Gap**: falta; tem ação. **Fora do escopo**: não se aplica a um cofre pessoal SaaS de 5 usuários, com justificativa.

A diferença estrutural mais importante: o Digital Vault da CyberArk **decifra no servidor** (a chave do servidor protege as chaves dos Safes). O SecureLink Vault é **zero-knowledge**: o servidor nunca tem a chave. Por isso vários controles de endurecimento do servidor viram, aqui, controles sobre **as contas das plataformas** (Supabase, Netlify, GitHub, Cloudflare) e sobre **o navegador**.

---

## 1. Camadas de segurança do Vault (Security Fundamentals)

| Princípio CyberArk | Como está no SecureLink Vault | Situação | Ação |
|---|---|---|---|
| **Criptografia em camadas** (chave por arquivo → chave do Safe → chave do servidor; chave de recuperação offline) | Chave por item (AES-256-GCM) → DEK do usuário → KEK derivada da senha mestra (PBKDF2-SHA-256, 600 mil). Chave de recuperação opcional e offline. Arquivos cifrados por blocos no navegador. AAD liga cada item ao dono e à versão | **Atende** (mais restritivo: nem o operador decifra) | Futuro: Argon2id no lugar de PBKDF2 |
| **Isolamento código-dados** | O servidor guarda só blobs cifrados; a lógica de cripto roda no navegador; RLS isola linhas por usuário; tabelas internas no schema `private` | **Atende** | — |
| **Comunicação cifrada** | TLS 1.2+ em tudo; HSTS com preload; CSP sem scripts de terceiros (`script-src 'self'`) | **Atende** | — |
| **Firewall próprio / superfície mínima** | Supabase gerenciado. Postgres acessível só por conexão autenticada; funções expostas são 7 | **Parcial** | Produção: ligar **Network Restrictions** (só o IP do administrador acessa o Postgres direto), **SSL obrigatório**, desligar provedores de login não usados, `ALLOWED_ORIGIN` no domínio de produção |
| **Autenticação forte** | Senha da conta + **TOTP**; RLS exige `aal2` para o cofre de quem tem MFA; MFA obrigatório para todos (configuração) e sempre para papéis administrativos | **Parcial** | Falta WebAuthn/chave física (futuro). No beta: MFA obrigatório para todos **ligado** |
| **Controle de acesso granular** (permissões por Safe, objeto invisível a quem não tem acesso) | RLS por linha, permissões por **coluna**, compartilhamento por item com **ver/editar** e expiração; quem não tem acesso não vê nem a existência do item | **Atende** para o escopo | Sem permissões "gerenciar/conceder" por item: só o dono compartilha (ver seção 3) |
| **Dual control** (aprovação de outro usuário para acesso ou mudança sensível) | Não há. Um único administrador master concede papéis e licenças | **Gap aceito no beta** | Mitigado por: papéis temporários com justificativa, auditoria imutável, conformidade. Implementar aprovação em dupla quando houver 2+ administradores |
| **Acesso exclusivo / senha de uso único / checkout** | Não se aplica a cofre pessoal. A rotação em 1 clique troca a credencial sob demanda | **Fora do escopo** | Relevante só em cofres de equipe (MVP 4) |
| **Trilha de auditoria à prova de adulteração** | **Implementado agora** (`20261102000000`): append-only para todos os papéis, **cadeia SHA-256**, verificação no painel, cabeça da cadeia gravada em cada backup externo, eventos mantidos após exclusão de conta. Nunca contém segredos | **Atende** (tamper-evident) | Um superusuário do Postgres ainda pode desligar triggers; a âncora no backup externo torna isso detectável. Futuro: exportar eventos para um SIEM/armazenamento WORM |
| **Segregação de funções** | Admin vê só metadados; papéis `owner`, `admin`, `support`, `auditor`; PAM com expiração e justificativa; o admin não lê cofres | **Atende** | — |
| **Usuário master / emergência (break-glass)** | Um `owner` único com MFA. Recuperação de emergência pelo SQL Editor do Supabase (`supabase/admin/create-master-admin.sql`) | **Parcial** | Documentar o break-glass: a conta da organização Supabase é a "chave mestra"; protegê-la com chave física e guardar os códigos de recuperação em papel no cofre físico |
| **Backup Vault / DR** (réplica cifrada, restauração testada) | Backup diário do Pro + **backup externo cifrado** (`scripts/backup`, AES-256-GCM + scrypt) com banco e arquivos, **teste de restauração** com verificação de hashes | **Atende** após o primeiro teste de restauração | Ver [`operations/data-storage-and-backup.md`](../operations/data-storage-and-backup.md) |

---

## 2. Digital Vault Server Security Standard → equivalente em SaaS

No modelo CyberArk o operador endurece o servidor. Aqui o servidor é do Supabase/Netlify (responsabilidade compartilhada: hardening do SO, patches, segurança física e rede do datacenter ficam com eles; ambos têm SOC 2 Type 2). O que continua sendo **nosso** é o equivalente a "quem pode administrar o Vault".

| Requisito do Standard | Equivalente aqui | Situação | Ação |
|---|---|---|---|
| **Servidor dedicado**, nada além do Vault | **Projeto Supabase dedicado** à produção (sem testes, sem outros apps); site Netlify dedicado | **Gap → em andamento** | Criar o projeto de produção (`PRODUCTION.md`); nunca rodar testes de integração nele |
| Fora do domínio corporativo / sem confiança herdada | Contas das plataformas com **e-mail administrativo dedicado**, não o pessoal do dia a dia; sem login social nessas contas | **Gap** | Criar um e-mail só para administrar Supabase/Netlify/GitHub/Cloudflare |
| Instalação a partir de mídia original, sem software de terceiros | Build reprodutível do repositório; sem scripts de terceiros no app (CSP); dependências travadas no `package-lock`; Deno com versões fixas | **Atende** | `npm audit` a cada release |
| **Só a porta do Vault aberta** | Só HTTPS do app e das funções; Postgres direto restrito por IP (Network Restrictions) | **Parcial** | Ligar Network Restrictions e SSL obrigatório no Pro |
| Acesso remoto ao servidor restrito a estações autorizadas | Acesso aos painéis só pelo administrador, com **MFA por chave física** (ou TOTP) em Supabase, Netlify, GitHub, Cloudflare e no registrador do domínio | **Gap** | Ativar MFA em todas essas contas; revisar membros das organizações (só você) |
| Estação de administração endurecida | Perfil de navegador **separado** só para administrar, sem extensões; sistema atualizado | **Gap (procedimento)** | Adotar o perfil dedicado |
| Segurança física, BIOS, mídia removível | Datacenter do provedor (AWS sa-east-1 via Supabase) | **Fora do escopo** (provedor) | — |
| Patches certificados | Postgres e runtime atualizados pelo Supabase; o painel avisa upgrades | **Atende** | Aplicar upgrades do Postgres fora do horário de uso, depois do backup |
| **Chave do servidor em HSM; chave de recuperação offline** | Não existe chave de servidor que abra cofres. Segredos da plataforma ficam nos secrets do Supabase. A **frase do backup** e os **códigos de recuperação** das contas são as "chaves de recuperação" e ficam em papel, offline | **Atende** com procedimento | Guardar frase do backup e códigos de recuperação em local físico seguro |
| Sincronização de horário, logs, monitoramento | Horário do provedor; eventos de auditoria; aba Conformidade (18 controles); visão geral diária | **Atende** | Revisão semanal (PRODUCTION.md) |
| Rotação de credenciais administrativas | Secrets (`CLEANUP_SECRET`, Safe Browsing, R2) gerados novos para produção | **Parcial** | Rotacionar a cada 6 meses ou ao trocar de pessoa |

---

## 3. Secured Items (CyberArk Identity / Workforce Password Management)

| Recurso CyberArk | SecureLink Vault | Situação |
|---|---|---|
| Tipos de item (login, nota, cartão, licença de software, Wi-Fi, banco, documento etc.) | Tipos de Secured Items com campos próprios e **campos personalizados** | **Atende** |
| Notas, anexos, pastas e tags | Sim (anexos via cofre de arquivos; pastas com nome cifrado) | **Atende** |
| Histórico de versões | 10 versões de senha por item, cifradas, só para o dono | **Atende** |
| Compartilhamento com permissões (ver, editar; dono) | Ver/editar, com **expiração**; só o dono compartilha, exclui e rotaciona | **Atende** para o escopo |
| Permissões "conceder/gerenciar" e transferência de propriedade | Não há | **Gap baixo** (futuro, com equipes) |
| Políticas do administrador (quem pode criar/compartilhar, expiração máxima) | Limites por plano (duração de compartilhamento Free 48 h; Premium livre); MFA por política | **Parcial** |
| **Reautenticação para revelar** um segredo | O cofre bloqueia por inatividade; revelar não pede a senha de novo | **Gap médio**: próximo passo sugerido é pedir a senha mestra (ou TOTP) para revelar/copiar itens marcados como sensíveis |
| Atividade por item | Eventos de compartilhamento e rotação no log; não há tela "atividade do item" | **Parcial** |
| Rotação de senha | Assistida para qualquer site; automática por API (beta) com consentimento por item | **Atende** (beta) |

---

## 4. Resumo e prioridades para o beta de 5 usuários

**Feito nesta etapa**
1. Auditoria imutável e encadeada por hashes, com verificação no painel e âncora nos backups.
2. Backup externo cifrado (banco + arquivos) e restauração com verificação; controle "Dias desde o último backup externo" na Conformidade.
3. Escopo do beta: 5 licenças Premium, 6 contas, convites e licenças com 30 dias por padrão.

**Antes do primeiro usuário real (obrigatório)**
1. Projeto de produção dedicado (Pro, `sa-east-1`), com Network Restrictions, SSL obrigatório e `ALLOWED_ORIGIN`.
2. MFA em todas as contas de plataforma (Supabase, Netlify, GitHub, Cloudflare, domínio, e-mail administrativo).
3. Um backup externo e **um teste de restauração** bem-sucedidos.
4. MFA obrigatório para todos no app; chave de recuperação no onboarding.

**Depois, por ordem de valor**
1. Reautenticação para revelar itens sensíveis.
2. WebAuthn (chave física/passkey) como segundo fator.
3. Dual control para concessão de papéis quando houver mais de um administrador.
4. Exportação contínua da auditoria para armazenamento WORM/SIEM.
5. Argon2id; pentest externo antes de abrir além do beta.
