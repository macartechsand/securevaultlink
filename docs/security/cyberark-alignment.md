# Aderência às boas práticas CyberArk (Vault e Secured Items)

Última atualização: 2026-11-02 · Escopo avaliado: beta de **5 usuários Premium**, cofre pessoal zero-knowledge em SaaS (Supabase + Netlify), sem cobrança.

Referências pedidas pelo dono do produto:
- CyberArk Identity: *Manage Secured Items* (docs.cyberark.com/access/…/manage-secured-items.htm)
- PAM Self-Hosted: *Security Fundamentals – Introduction* (camadas de segurança do Digital Vault)
- PAM Self-Hosted: *Digital Vault Server Security Standards and Requirements*

> **Fontes (2026-11-02):** todas as seções foram revisadas sobre o texto oficial, a partir dos PDFs fornecidos pelo dono do produto (o portal recusa acesso automatizado): "Security Fundamentals | CyberArk Docs" (seção 1), "Digital Vault Security Requirements | CyberArk Docs" (seção 2) e "Manage secured items | Idira Docs" (seção 3).

## Como ler
**Atende**: implementado e testado. **Parcial**: existe, com limitação conhecida. **Gap**: falta; tem ação. **Fora do escopo**: não se aplica a um cofre pessoal SaaS de 5 usuários, com justificativa.

A diferença estrutural mais importante: o Digital Vault da CyberArk **decifra no servidor** (a chave do servidor protege as chaves dos Safes). O SecureLink Vault é **zero-knowledge**: o servidor nunca tem a chave. Por isso vários controles de endurecimento do servidor viram, aqui, controles sobre **as contas das plataformas** (Supabase, Netlify, GitHub, Cloudflare) e sobre **o navegador**.

---

## 1. Security Fundamentals (os 9 controles mínimos)

Fonte: *Security Fundamentals* (CyberArk Docs, PDF). A CyberArk chama estes controles de **requisitos mínimos** para proteger a implantação e pede revisão periódica. A tradução para este projeto parte de um ponto: os "servidores de componentes" aqui são o **site (Netlify)**, as **Edge Functions e o banco (Supabase)**, o **repositório (GitHub)** e a **sua estação de administração**. Quem controla qualquer um deles controla o cofre.

| # | Controle CyberArk (texto oficial, resumido) | Como está no SecureLink Vault | Situação | Ação |
|---|---|---|---|---|
| 1 | **Isolar e endurecer o servidor do Vault**: fora do domínio, sem software de terceiros, entrada só por protocolos CyberArk, **saída só para integrações aprovadas** (LDAPS, SMTPS), credenciais do SO únicas, infraestrutura de hospedagem com os mesmos controles, patches regulares, firewall de rede para o tráfego administrativo | Projeto Supabase dedicado; provedor cuida de SO, patches e rede física. Entrada: HTTPS e Postgres restrito por IP. Saída: funções só chamam endpoints fixos; rotação automática desligada por padrão | **Parcial** | Network Restrictions e SSL obrigatório; allowlist explícita de saída na função `rotate`; senhas únicas por plataforma (nunca reaproveitadas) |
| 2 | **MFA para todos os usuários e administradores**, contra keyloggers e coleta de senhas | TOTP; `aal2` exigido pelas regras do banco; MFA obrigatório para papéis administrativos e, em produção, para todos | **Atende** no app | Estender a MFA (chave física) a todas as contas de plataforma |
| 3 | **Restringir acesso aos servidores de componentes** (tratados como *tier 0*, igual a controlador de domínio): poucos acessos, sem aplicações de terceiros, allowlisting de aplicações, firewall e IPsec no acesso administrativo | Equivalentes *tier 0*: Netlify, GitHub, Supabase, Cloudflare, e-mail administrativo e a sua estação. Hoje só você tem acesso | **Gap (procedimento)** | Tratar essas contas como *tier 0*: e-mail administrativo dedicado, chave física, proteção da branch `master`, só você publica, perfil de navegador exclusivo para administrar (sem extensões) |
| 4 | **Limitar privilégios e pontos de administração**: poucos administradores, privilégio mínimo; **administradores não têm justificativa para acessar todas as credenciais**; elevação com **dual control** ou ticket para mudanças de configuração; administração isolada e monitorada | Um único `owner`; papéis `admin`, `support`, `auditor` temporários com justificativa (PAM); **o administrador não acessa nenhuma credencial** (zero-knowledge), nem por elevação; toda ação administrativa vai para a auditoria imutável | **Atende**, exceto dual control | Dual control (aprovação de um segundo administrador) quando houver mais de um; até lá, revisão semanal dos eventos `admin.*` |
| 5 | **Proteger contas sensíveis e chaves**: senhas de administrador, SO e iDRAC **em cofre físico, com cópias em 2+ locais e acesso exigindo mais de uma pessoa**; Master Password e Master Key idem; **Operator Key fora da mídia dos dados**, em HSM | Não há Operator Key nem Master Key no servidor: a chave de cada cofre vem da senha mestra do usuário. As "contas fora de banda" deste projeto são: conta root da organização Supabase, Netlify, GitHub, registrador do domínio, senha do banco, frase do backup e os códigos de recuperação de MFA | **Gap (procedimento)** | Envelope de emergência (seção 8 de [`../operations/data-storage-and-backup.md`](../operations/data-storage-and-backup.md#8-plano-de-recuperação-de-desastres)) com essas credenciais em **2 locais físicos**. Como o operador é uma pessoa só, o "mais de uma pessoa" vira: uma cópia lacrada com alguém de confiança, que só a entrega em emergência |
| 6 | **Protocolos seguros**: HTTPS para portal e APIs; TLS para SMTP e syslog; nada em texto aberto | HTTPS com HSTS preload em tudo; Postgres com TLS; SMTP próprio com TLS (a configurar em produção) | **Atende** | Exigir TLS no SMTP de produção; SSL obrigatório no Postgres |
| 7 | **Restringir aplicações de terceiros** no ambiente; mudanças de configuração são responsabilidade do cliente | Sem scripts de terceiros (CSP `script-src 'self'`); dependências travadas; configurações versionadas no repositório (migrations, `netlify.toml`) | **Atende** | Revisar toda dependência nova; `npm audit` a cada release |
| 8 | **Monitorar logs**: SIEM; **alertas** de falhas de autenticação em excesso, logins de administrador e eventos de infraestrutura; análise de anomalias | Auditoria imutável e encadeada; aba Conformidade (falhas de desbloqueio em 24 h, integridade da auditoria, idade do backup); Visão geral diária. **Não há alerta ativo**: depende de você olhar | **Parcial** | Rotina diária/semanal do `PRODUCTION.md`. Próximo passo: alerta por e-mail quando houver pico de `vault.unlock_failed`, ação `admin.*` ou cadeia de auditoria quebrada (a função de limpeza horária pode verificar e avisar) |
| 9 | **Plano de recuperação de desastres documentado e testado**: avaliação de riscos, contatos, processo de acesso às credenciais fora de banda, procedimentos para os problemas prováveis e de alto impacto | Backup diário + backup externo cifrado + teste de restauração mensal; tabela de incidentes; **plano de DR** com riscos, contatos e envelope de emergência | **Atende** após o primeiro teste de restauração | Ver [`../operations/data-storage-and-backup.md`](../operations/data-storage-and-backup.md), seções 4 e 8 |

**Pontos em que o projeto vai além do mínimo CyberArk:**
- **Ninguém administra credenciais alheias.** O controle 4 pede que administradores não tenham acesso a todas as credenciais. Aqui eles não têm acesso a **nenhuma**, nem com elevação.
- **Não há chave no servidor para roubar.** O controle 5 existe porque a Operator Key decifra dados. Aqui o equivalente não existe.

---

## 2. Digital Vault Security Requirements → equivalente em SaaS

Fonte: *Digital Vault Security Requirements* (CyberArk Docs, PDF). No modelo CyberArk o cliente endurece o servidor do Vault. Aqui o servidor é do Supabase/Netlify (responsabilidade compartilhada: sistema operacional, patches, rede e segurança física são deles). O que continua sendo **nosso** é o equivalente a "quem administra o Vault" e "o que entra e sai dele".

| Requisito CyberArk (texto oficial, resumido) | Equivalente no SecureLink Vault | Situação | Ação |
|---|---|---|---|
| **Máquina física dedicada**, instalada a partir de SO limpo, não da imagem padrão da empresa | **Projeto Supabase dedicado** só à produção (sem testes, sem outros apps) e site Netlify dedicado | **Em andamento** | Criar o projeto de produção; nunca rodar testes de integração nele |
| **SO endurecido** no nível fornecido pela CyberArk (CAVaultHarden, base CIS) | Endurecimento do SO é do provedor. Do nosso lado: Network Restrictions, SSL obrigatório, provedores de login não usados desligados, CSP estrita | **Parcial** | Ligar Network Restrictions e SSL obrigatório no Pro |
| **Credencial do administrador do Vault expira a cada 30 dias**; guardar em cofre físico | Senhas das contas que administram a plataforma (Supabase, Netlify, GitHub, Cloudflare, e-mail administrativo) e a senha do banco | **Gap (procedimento)** | Trocar a cada 30 dias as senhas das contas de plataforma ou, preferível, usar chave física (FIDO2) como fator principal; guardar os códigos de recuperação em cofre físico |
| **Credenciais de serviço**: rotacionar anualmente ou quando sair alguém que as conhecia; **15+ caracteres**, maiúsculas, minúsculas, número, especial, sem palavra de dicionário | Senha do banco Postgres, `service_role`, `CLEANUP_SECRET`, chave do Safe Browsing, chaves do R2, frase do backup | **Gap (procedimento)** | Gerar todas com 32+ caracteres aleatórios (já é o padrão do gerador do app); rotacionar anualmente e na saída de qualquer pessoa; registrar a data da última troca |
| **Fora do domínio corporativo** (domínio abre protocolos, GPO e administradores de domínio) | Contas de plataforma **sem** login social e **sem** SSO herdado de uma conta pessoal; e-mail administrativo dedicado | **Gap** | Criar o e-mail administrativo e migrar as contas de plataforma para ele |
| **Mídia original, sem software de terceiros** (antivírus, gerência remota) | App sem scripts de terceiros (CSP `script-src 'self'`), dependências travadas no lockfile, funções com imports fixos e versionados | **Atende** | `npm audit` a cada release; revisar novas dependências antes de adicionar |
| **Patches mensais** do SO | Postgres e runtime atualizados pelo Supabase; dependências do app pelo `npm` | **Atende** (provedor) / **procedimento** (app) | Aplicar upgrades do Postgres depois do backup; atualizar dependências mensalmente |
| **Server Key separada do sistema de arquivos (HSM)**; **Recovery Private Key em cofre físico**. Cada objeto tem chave AES-256 própria e **a decifragem é feita só pelo cliente** que pede o dado | Cada item já tem **chave AES-256 própria** e **só o navegador decifra**, igual ao princípio citado. **Não existe Server Key** que abra cofres: a chave de cada usuário vem da senha mestra. A **chave de recuperação** de cada usuário e a **frase do backup** são as "Recovery Keys" e ficam offline | **Atende** (mais restritivo: o servidor não tem chave nenhuma) | Orientar a guardar a chave de recuperação em papel; frase do backup em cofre físico |
| **Firewall gerido só pelo Vault**: só a porta do Vault (1858) entra; saída só autorizada | Entrada: só HTTPS do app e das funções; Postgres direto restrito por IP. **Saída**: as funções só chamam endpoints fixos (AWS, Google, Microsoft, GitLab, Cloudflare, Safe Browsing); GitLab próprio passa por bloqueio de endereços internos | **Parcial** | Futuro: lista explícita de destinos permitidos na função `rotate` (allowlist de saída), além do bloqueio atual |
| **Evitar DNS no servidor** (canal de C2) | Não controlamos DNS do provedor. Equivalente: reduzir para onde o servidor pode falar (item acima) e manter a rotação automática **desligada** até validar os conectores | **Parcial** | Interruptor `auto_rotation` desligado em produção (migration `20261103000000`) |

---

## 3. Secured Items (Idira / Workforce Password Management)

Fonte: *Manage secured items* (Idira Docs, PDF).

| Recurso no Idira WPM | SecureLink Vault | Situação |
|---|---|---|
| Tipos **Secured password** (apps não web) e **Secured note** (licenças, tokens, chaves, perguntas de segurança) | Login (web e não web), nota segura, segredo (chave de API, token, chave SSH, certificado, outro) e cartão, com campos próprios | **Atende** (mais tipos) |
| Nome, tags, pasta, usuário, senha, notas (até 3.999 caracteres) | Sim | **Atende** |
| **Até 10 campos personalizados** (nome e valor até 100 caracteres) | Campos personalizados | **Atende** |
| **Campo personalizado "Hidden"**: escondido de quem recebeu com **View** (quem tem **Edit** vê) | Nosso "oculto" só **mascara** o valor na tela; o destinatário que abre o item vê o campo | **Gap**. Implementação sugerida, mais forte que a do Idira: cifrar os campos ocultos com a chave pessoal do dono (como o histórico), assim **nenhum** destinatário os decifra |
| Bloqueio de conteúdo com padrões de script (`SRC=`, `onerror=`) | O React escapa todo texto exibido; CSP impede script injetado | **Atende** (por outro mecanismo, sem restringir o que o usuário guarda) |
| Busca por nome, usuário, descrição, nome de campo, nome de anexo | Busca local em campos visíveis, nunca em segredos nem em valores ocultos | **Atende** |
| Filtros: tipo, compartilhado por mim/comigo/não compartilhado, risco (comprometida, fraca, antiga), tags; **filtros salvos** | Filtros de risco (vazada, fraca, reutilizada, vencida) e de pasta/tag | **Parcial**: faltam filtros "compartilhado por mim/comigo" e filtros salvos |
| **Só o dono compartilha**; destinatário não recompartilha | Igual, e **provado em teste** (recertificação) | **Atende** |
| Permissões **Owner** (co-dono), **View**, **Edit** | View e Edit; sem co-dono | **Parcial** (co-dono fica para equipes, MVP 4) |
| **Janela de acesso com início e fim**; o item some do destinatário no fim | Expiração (fim), aplicada pelo servidor no instante exato; sem horário de início | **Parcial** |
| **E-mail ao destinatário** quando algo é compartilhado | Aparece no app ("Compartilhados comigo") e no log; sem e-mail | **Gap baixo** |
| Excluir o item remove o acesso de todos e apaga anexos | Igual (exclusão em cascata) | **Atende** |
| Anexos compartilhados junto com o item; **anexos ocultos**; Edit pode enviar/apagar anexos | Anexos compartilhados junto, **só leitura** para destinatários; sem anexos ocultos | **Parcial** (mais restritivo para Edit; falta "anexo oculto") |
| Anexo **cifrado após o upload** no servidor; 10 MB por arquivo, 10 por item, 1 GB por usuário; lista de extensões | Anexo **cifrado antes do upload, no navegador**; cotas por plano | **Atende** (mais restritivo: o servidor nunca vê o arquivo) |
| Copiar usuário/senha/nota | Copiar com **limpeza automática da área de transferência** | **Atende** (com proteção extra) |
| **Histórico de senhas** habilitado por política, **pode pedir MFA antes de mostrar** | Histórico de 10 versões, só do dono, cifrado com a chave pessoal; não pede reautenticação | **Parcial**: falta o desafio (senha mestra ou TOTP) antes de revelar histórico e itens sensíveis |
| Só o dono exclui; **lixeira** com restauração em lote (early access) | Só o dono exclui; **lixeira de 14 dias no Premium** (2026-11-06, no desenvolvimento); no Free a exclusão é imediata | **Atende** no Premium (falta restauração em lote) |
| Alertas: senha comprometida, acesso restrito pelo admin | Alerta de senha vazada (HIBP), fraca e reutilizada | **Atende** |
| Recomendação de **não guardar dados pessoais (PII)** | No Idira o fornecedor consegue processar o conteúdo; aqui o conteúdo é cifrado de ponta a ponta, então guardar documentos pessoais é aceitável | **Atende** (modelo diferente) |

### Diferença de modelo: quem consegue decifrar
- **Idira WPM:** o arquivo é "cifrado após o upload" e os itens ficam na nuvem do fornecedor, com políticas definidas pelo administrador da empresa (o admin pode tornar itens indisponíveis, exigir MFA para ver histórico). A plataforma participa da cifragem.
- **CyberArk Digital Vault (PAM):** chave por objeto, decifragem pelo cliente que pede o dado, Server Key em HSM e Recovery Key em cofre físico.
- **SecureLink Vault:** chave por item, **só o navegador** cifra e decifra, e não há chave no servidor. O administrador da plataforma não consegue tornar um item legível para ninguém, nem para si.

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
1. Reautenticação (senha mestra ou TOTP) para revelar histórico e itens sensíveis, como o Idira faz com o histórico.
2. Campos e anexos **ocultos de verdade**: cifrados com a chave do dono, invisíveis para qualquer destinatário.
3. Rotina das credenciais de plataforma: 30 dias para contas administrativas, anual para credenciais de serviço (15+ caracteres).
4. Envelope de emergência em 2 locais físicos e alertas por e-mail (falhas de desbloqueio, ações administrativas, cadeia de auditoria).
5. WebAuthn (chave física/passkey) como segundo fator.
6. Allowlist de saída na função `rotate`.
7. Dual control para concessão de papéis quando houver mais de um administrador.
8. Exportação contínua da auditoria para armazenamento WORM/SIEM.
9. Filtros "compartilhado por mim/comigo", lixeira, aviso por e-mail de compartilhamento.
10. Argon2id; pentest externo antes de abrir além do beta.
