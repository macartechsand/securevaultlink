# Aderência às boas práticas CyberArk (Vault e Secured Items)

Última atualização: 2026-11-02 · Escopo avaliado: beta de **5 usuários Premium**, cofre pessoal zero-knowledge em SaaS (Supabase + Netlify), sem cobrança.

Referências pedidas pelo dono do produto:
- CyberArk Identity: *Manage Secured Items* (docs.cyberark.com/access/…/manage-secured-items.htm)
- PAM Self-Hosted: *Security Fundamentals – Introduction* (camadas de segurança do Digital Vault)
- PAM Self-Hosted: *Digital Vault Server Security Standards and Requirements*

> **Fontes (atualizado em 2026-11-02):** as seções 2 e 3 foram revisadas sobre o texto oficial, a partir dos PDFs "Digital Vault Security Requirements | CyberArk Docs" e "Manage secured items | Idira Docs" fornecidos pelo dono do produto (o portal recusa acesso automatizado). A seção 1 (*Security Fundamentals*) ainda se baseia no conteúdo público conhecido; vale conferir com o PDF dessa página quando disponível.

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
| Só o dono exclui; **lixeira** com restauração em lote (early access) | Só o dono exclui; exclusão imediata, sem lixeira | **Gap baixo** (a exportação cifrada e o backup cobrem a recuperação) |
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
4. WebAuthn (chave física/passkey) como segundo fator.
5. Allowlist de saída na função `rotate`.
6. Dual control para concessão de papéis quando houver mais de um administrador.
7. Exportação contínua da auditoria para armazenamento WORM/SIEM.
8. Filtros "compartilhado por mim/comigo", lixeira, aviso por e-mail de compartilhamento.
9. Argon2id; pentest externo antes de abrir além do beta.
