# Estratégia de produto e planos

> Versão de 2026-11-04 (Fase A do [`roadmap-v1.md`](roadmap-v1.md)). As decisões do dono estão marcadas como **Decidido**; o resto é proposta para validar com o retorno do piloto.

## 1. Posicionamento
**"O cofre de senhas com governança de nível corporativo, auditável por qualquer pessoa, pelo preço de um gerenciador de senhas."**

Partimos de um gerenciador de senhas (experiência no nível de 1Password e Bitwarden) e evoluímos para segurança de credenciais e **Micro-PAM**:
- rotação;
- acesso temporário;
- recertificação;
- auditoria à prova de adulteração;
- identidades não humanas (chaves de API, contas de serviço).

O diferencial vem da experiência do fundador em IAM e PAM (CyberArk, Entra ID, Identity Protection).

| Concorrente | Força | Onde ganhamos |
|---|---|---|
| 1Password | Experiência, marca, empresas | Preço em reais, código auditável, rotação por API, governança no plano pago de entrada |
| Bitwarden | Gratuito generoso, código aberto | Postura de segurança, rotação, Micro-PAM, foco no Brasil (LGPD, Pix, suporte em português) |
| Keeper / Dashlane | Recursos corporativos e monitoramento | Preço e simplicidade para pequenas empresas |
| CyberArk | PAM corporativo completo | Fração do custo e da complexidade, para equipes pequenas |

## 2. Personas
1. **Profissional técnico** (dev, DevOps, administrador de TI). Guarda senhas pessoais **e** chaves de cloud e API, e quer rotação e auditoria.
2. **Autônomo ou MEI.** Credenciais de clientes, compartilhamento com prazo e transferência de arquivos sigilosos.
3. **Pequena empresa (5 a 50 pessoas).** Precisa de cofres compartilhados, quem acessa o quê, desligamento de funcionários e conformidade com a LGPD. É o caminho para o Enterprise.

## 3. Princípios (Decidido)
> **Revisão de 2026-11-06 (decisão do dono):** o princípio 1 mudou. Estes recursos passam a ser **exclusivos do Premium**:
> - onde e quando a senha foi usada;
> - lixeira de 14 dias;
> - modo emergência (encerrar todas as sessões de uma vez);
> - OTP para sistemas externos;
> - rotação de senhas (assistida, programada e em 1 clique);
> - suporte;
> - contato de emergência.
>
> Continuam iguais para todos os planos: o encerramento de sessões **uma a uma** em "Sessões ativas", a verificação de vazamentos, MFA, PIN, chave de recuperação, exportação e a fila de risco com prazos. Rebaixar de plano continua sem bloquear dados: itens já na lixeira podem ser restaurados, e códigos OTP já salvos continuam funcionando.

1. ~~O Free tem todas as funcionalidades do produto individual.~~ Os planos diferem por **quantidade** e pelos recursos Premium listados acima.
2. **Segurança nunca é recurso pago.** Criptografia, MFA, postura, verificação de vazamentos e de URLs, chave de recuperação, exportação, bloqueio e sessões ficam iguais para todos. Pode haver uso justo (frequência), sem retirar o recurso.
3. **Free com itens limitados.** Proposta: **7 itens** no cofre, valor configurável pelo administrador (`app_settings`). O limite vale **no servidor**, não só na interface.
   - Chegar ao limite **só impede criar itens novos**.
   - Os itens existentes continuam legíveis, editáveis, exportáveis e compartilháveis.
   - Rebaixar de plano nunca bloqueia dados.
4. **O Enterprise é a evolução para Micro-PAM:** organizações e cofres compartilhados. Não entra no beta, mas o banco deve prevê-lo (seção 6).
5. Nada de rotação automática "universal": só conectores com API oficial documentada.

## 4. Matriz de planos

**Categorias:** S = segurança, C = conveniência, Col = colaboração, A = automação, E = corporativo.

**Nomes no código:** no código, o plano pago se chama `premium`. "Pro" é o nome comercial e a interface muda na Fase D.

| Recurso | Cat. | Free | Pro | Enterprise | Dependência / custo | Justificativa |
|---|---|---|---|---|---|---|
| Cofre zero-knowledge, criptografia no cliente | S | ✅ | ✅ | ✅ | Banco (cerca de 2–5 KB por item) | Base do produto |
| **Itens no cofre** (todos os tipos) | C | **7** | Ilimitado (uso justo 10.000) | Ilimitado | Banco | Principal alavanca de conversão |
| Tipos Login, Nota, Segredo/API, Cartão; até 10 campos; notas de 4.000 caracteres | C | ✅ | ✅ | ✅ | Banco | Igual para todos |
| Pastas, tags, favoritos, busca, filtros | C | ✅ | ✅ | ✅ | Nenhum | Custo zero; restringir seria artificial |
| Histórico de senha (últimas 10) | S | ✅ | ✅ | ✅ | Banco | Recuperação faz parte da segurança |
| Histórico completo de versões do item | C | — | ✅ (futuro) | ✅ (futuro) | Banco | Ainda não existe |
| Gerador de senhas | S | ✅ | ✅ | ✅ | Nenhum | |
| Senhas fracas, reutilizadas, antigas; postura 0–100; fila de risco | S | ✅ | ✅ | ✅ | Nenhum (local) | Segurança para todos |
| Vazamentos (HIBP, k-anonimato) | S | ✅ | ✅ | ✅ | Gratuito, cache no navegador | |
| URLs suspeitas (Web Risk) | S | ✅ 50/dia | ✅ 500/dia | Política | Grátis até 100 mil consultas/mês | Uso justo, não restrição |
| MFA (TOTP) da conta, sessões, encerramento remoto uma a uma | S | ✅ | ✅ | ✅ | Nenhum | |
| **Desbloqueio por PIN** (5 tentativas no servidor, 14 dias) | S | ✅ | ✅ | ✅ | Nenhum | 2026-11-06 |
| **Modo emergência** (encerra todas as sessões e PINs de uma vez) | S | — | ✅ | ✅ | Nenhum | Decisão de 2026-11-06 |
| **Onde e quando a senha foi usada** (cifrado com a chave do item) | C | — | ✅ | ✅ | Banco (1 linha por item) | Decisão de 2026-11-06 |
| **Lixeira de 14 dias** | C | — (excluir é definitivo) | ✅ | ✅ | Banco | Decisão de 2026-11-06 |
| **OTP de sistemas externos** (códigos no item e na extensão) | C | — (os já salvos continuam) | ✅ | ✅ | Nenhum | Decisão de 2026-11-06 |
| **Contato de emergência** (até 5, espera de 7 dias) | S | — | ✅ (fase 2) | ✅ | Banco e e-mail | Decisão de 2026-11-06 |
| **Acesso temporário com aprovação (JIT)**: liberar | A | — (pedir é livre) | ✅ | ✅ | Banco | 2026-11-10 |
| Relatório de evidências de troca (CSV) | C | — | ✅ | ✅ | Nenhum | 2026-11-10 |
| Secured Items brasileiros com validade e alerta | S | ✅ | ✅ | ✅ | Nenhum | 2026-11-10 |
| Login por passkey; biometria no celular | S | ✅ (a fazer) | ✅ | ✅ | Nenhum | Esperado pelo mercado |
| Chave de recuperação, exportação cifrada, importação CSV | S | ✅ | ✅ | ✅ | Nenhum | Sem aprisionamento |
| Atividade (auditoria pessoal) | S | ✅ 365 dias | ✅ 365 dias | Política e exportação | Banco (eventos pequenos) | Trilha de segurança igual para todos |
| Extensão Chrome/Edge, app Android, PWA | C | ✅ | ✅ | ✅ | Nenhum | Distribuição |
| Compartilhar itens | Col | ✅ até 48 h, 5 ativos | ✅ até 30 dias ou sem prazo | Política do admin | Banco | Colaboração é valor do pago |
| Arquivos cifrados | C | ✅ 100 MB | ✅ 2 GB | Por assento | Storage (Supabase ou R2) | Capacidade |
| Tamanho máximo do arquivo | C | 25 MB | 25 MB (maior com streaming, futuro) | Idem | Memória do navegador | Limite técnico atual |
| Transferência por link (senha, prazo, limite de downloads) | Col | ✅ até 48 h, 5/mês | ✅ até 30 dias | Política | Egress | |
| Rotação em 1 clique e assistida | A | — | ✅ | ✅ | Nenhum | Decisão de 2026-11-06 (era Free) |
| Troca programada | A | — | ✅ | ✅ | Nenhum | Decisão de 2026-11-06 (era Free) |
| Prazos de troca por risco (vazada 7 dias, fraca e reutilizada 30) e avisos | S | ✅ | ✅ | ✅ | Nenhum | Segurança para todos |
| Rotação por API (AWS, Entra, Workspace, GCP, GitLab, Cloudflare) | A | — | ✅ uso justo (20/h) | Política e aprovação | Execução de Edge Function | Automação é valor do pago |
| Relatórios de segurança exportáveis | C | — | ✅ (futuro) | ✅ | Nenhum | |
| Suporte | C | — (central de ajuda e contingência no app) | Prioritário (e-mail) | SLA | Tempo | |
| **Organizações e cofres compartilhados** | E | — | — | ✅ (futuro) | Banco (`org_id`) | Micro-PAM |
| RBAC por organização (Owner, Admin, Support, Auditor) | E | — | — | ✅ (futuro) | Hoje existe só na administração da plataforma | |
| JIT, check-out e check-in, justificativa, expiração | E | — | — | ✅ (futuro) | Banco e funções | |
| Identidades não humanas e segredos de automação | E | Itens "Segredo/API" | Idem e rotação | Inventário e dono por segredo (futuro) | | |
| SSO (SAML/OIDC), SCIM, break-glass, políticas, auditoria corporativa com exportação | E | — | — | ✅ (futuro) | Supabase SSO no Pro/Team | |

Os limites de quantidade são **propostas** para validar no piloto. Todos ficam em `app_settings`, para mudar sem nova versão.

## 5. Preços (proposta; validar com o piloto)
| Plano | Preço sugerido | Observação |
|---|---|---|
| Free | R$ 0 | 7 itens; sem os recursos Premium de 2026-11-06 |
| Pro | **R$ 9,90/mês** ou R$ 99/ano | Na faixa de R$ 9–12 de [`open-source-and-business.md`](open-source-and-business.md) |
| Família (futuro) | R$ 19–25/mês até 6 pessoas | Depende de organizações |
| Enterprise | R$ 20–30 por usuário/mês, mínimo de 5 | Depois do Micro-PAM |

A cobrança é feita pela **web** (cartão e Pix Automático), para evitar a taxa de 15–30% das lojas. As regras das lojas para apps que não vendem dentro do app precisam ser conferidas na Etapa 5. A conta (custo, taxas e ponto de equilíbrio) está em [`../operations/finops.md`](../operations/finops.md).

## 6. Impacto na arquitetura
- **Entitlements no servidor:**
  - uma função única `private.plan_limit(user, recurso)` lida dos `app_settings` por plano;
  - checagem em gatilhos ou RLS (itens, compartilhamentos ativos, transferências, execuções de rotação, consultas de URL).
  - Hoje só arquivos e prazos são checados no servidor (`my_plan_limits`, `file_quota_bytes`); ver [`feature-review.md`](feature-review.md).
- **Separação:** criptografia e entitlements não se misturam. O limite conta linhas e eventos, nunca conteúdo, então o zero-knowledge fica intacto.
- **Preparar o Enterprise sem construí-lo:** tabelas novas ganham `org_id` opcional (nulo = pessoal). Cofres de organização reaproveitam o compartilhamento com chave selada por membro (ECDH), que já existe.
