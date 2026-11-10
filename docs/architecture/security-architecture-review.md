# Revisão da arquitetura de segurança: SecureVault comparado a Idira (CyberArk), Bitwarden e Google

Versão de **2026-11-10** · Código avaliado: `dev` (`83dd03d`) · Leitura para o dono do produto e o engenheiro de pentest

**Objetivo:** entender o sistema por inteiro e responder a três perguntas:
1. A proposta é legítima, ou seja, a segurança está no nível dos concorrentes?
2. Onde ela está igual, atrás ou à frente?
3. Qual é o potencial de inovação?

Os padrões de referência são os da CyberArk, que hoje opera como **Idira** sob a Palo Alto Networks.

**Documentos de apoio:**
- [`../security/mvp-security-model.md`](../security/mvp-security-model.md): modelo de segurança atual;
- [`../security/cyberark-alignment.md`](../security/cyberark-alignment.md): Secured Items do Idira item a item;
- [`../security/security-assurance.md`](../security/security-assurance.md): NIST, CSA e bloqueios B1 a B10;
- [`../SECURITY_TESTING.md`](../SECURITY_TESTING.md): pentest.

**Como ler as comparações:** os dados dos concorrentes vêm da documentação pública deles (fontes no fim). Alguns detalhes internos, como a hierarquia de chaves do Workforce Password Management do Idira, não são públicos e estão marcados como "não divulgado". As notas de 0 a 5 da seção 7 são **estimativas qualitativas**, não medições.

---

## 1. Resumo para decisão

| Pergunta | Resposta curta |
|---|---|
| A base de segurança é legítima? | **Sim.** O núcleo criptográfico é zero-knowledge, com chave por item, AES-256-GCM e WebCrypto sem criptografia própria. Está no nível do Bitwarden e, no quesito "nem o fornecedor lê", é mais restritivo que o modelo de cofre gerenciado da CyberArk |
| Está no nível da CyberArk? | **No cofre de senhas e Secured Items: sim, em boa parte.** **Em PAM corporativo: não.** Faltam controle duplo, check-out exclusivo, isolamento e gravação de sessões, descoberta de contas, analytics de ameaça, SSO/SCIM e certificações |
| Onde está atrás de todos? | **Garantia independente** (nenhuma auditoria ou certificação), **cobertura de plataformas** (sem iOS, sem desktop, sem preenchimento nativo no celular), **integrações corporativas** e **operação** (uma pessoa, Supabase Free) |
| Onde já está à frente? | A combinação, num produto barato para pequenas empresas, de zero-knowledge com governança: rotação por API, prazos de troca por risco, auditoria encadeada com âncoras externas, postura de 0 a 100 e central de contingência com leitor offline |
| Potencial de inovação | **Alto, num nicho claro:** "PAM zero-knowledge para pequenas e médias empresas". Controle duplo e acesso just-in-time **sem o servidor ver o segredo** (seção 9) é algo que nem a CyberArk nem o Bitwarden oferecem hoje |

---

## 2. Arquitetura do sistema por inteiro

### 2.1 Componentes
```
 Usuário
   │
   ├── App web (React 19 + Vite, PWA)          https://securelinkvault.netlify.app  (Netlify, CDN global)
   ├── Extensão Chrome/Edge (MV3)               service worker + popup + script de página + iframes próprios
   └── App Android (Capacitor 7)                o mesmo app web empacotado, assinado
          │  TLS 1.2+ (HSTS), JWT do Supabase Auth
          ▼
 Supabase (AWS sa-east-1, São Paulo)
   ├── Auth (GoTrue): e-mail e senha, Google e GitHub (OAuth 2.0 + PKCE), TOTP (aal2)
   ├── Postgres + RLS: cofres, itens, compartilhamentos, arquivos, auditoria, planos, PIN, uso
   ├── Storage: blocos de arquivo já cifrados (Premium pode usar Cloudflare R2)
   ├── Edge Functions (Deno): account, admin, check-url, cleanup-files, rotate, storage-r2, transfer
   └── pg_cron: limpeza de arquivos (de hora em hora) e da lixeira (diária)
          │
          ├── Have I Been Pwned (k-anonimato: só os 5 primeiros caracteres do SHA-1, direto do navegador)
          ├── Google Web Risk / Safe Browsing (por check-url, com cota diária no banco)
          └── APIs de rotação: AWS IAM (SigV4), Microsoft Graph, Google Admin e IAM, GitLab, Cloudflare
```

### 2.2 Onde cada dado fica e quem lê

| Dado | Onde | Forma | Quem consegue ler |
|---|---|---|---|
| Senha mestra | Só na cabeça do usuário e na memória durante o desbloqueio | Nunca gravada nem enviada | Ninguém |
| Chave do cofre (DEK) | Servidor, **embrulhada** pela senha mestra (e pela chave de recuperação, se ativa) | AES-256-GCM | Só o cliente que sabe a senha mestra |
| Itens (título, usuário, senha, URL, notas, campos, OTP) | `vault_entries` | Cifrados com a **chave do item**, que é embrulhada pela DEK | Dono e destinatários |
| Chave privada de compartilhamento (ECDH P-256) | `user_keys`, embrulhada pela DEK | AES-GCM | Só o dono |
| Compartilhamento de item | `item_shares` | Chave do item **selada** para a chave pública do destinatário (ECDH efêmero + HKDF + AES-GCM) | Só o destinatário |
| Arquivos | Storage ou R2 | Blocos de 1 MiB, AES-256-GCM com AAD por bloco | Dono e destinatários |
| Link de transferência | Banco + Storage | Chave no fragmento `#` da URL, que não chega ao servidor; senha opcional (PBKDF2) | Quem tem o link |
| "Onde e quando foi usada" | `item_usage` | Cifrado com a chave do item | Só o próprio usuário |
| PIN | Aparelho: sal e DEK embrulhada. Servidor: hash do verificador e uma parte da chave | Duas metades; 5 tentativas | Ninguém sem as duas metades **e** o PIN |
| Auditoria | `audit_events` | Texto (eventos e ids, nunca conteúdo), só acréscimo, cadeia SHA-256 | Dono do evento e auditor da plataforma |
| Metadados | Banco | Em claro: quantidade, tamanhos, datas, plano | Plataforma |

### 2.3 Fluxos principais
1. **Entrar:** a senha da conta vai ao Supabase Auth, que é separado do cofre. O MFA eleva a sessão a `aal2`, e a RLS exige `aal2` para ler o cofre quando há MFA.
2. **Desbloquear:** PBKDF2-SHA256 (600 mil iterações, sal da conta) gera a KEK, que desembrulha a DEK. A DEK fica só em memória, não exportável, e é apagada no bloqueio (5 min sem uso no web, 10 min na extensão). Com PIN, o servidor libera sua metade só para o verificador certo.
3. **Ler ou gravar item:** a DEK desembrulha a chave do item, e a chave do item decifra o item. Gravar recifra e envia; o servidor confere a versão (`updated_at`) para evitar sobrescrever edições.
4. **Compartilhar:** o cliente sela a chave do item para o destinatário. Revogar gira a chave do item e ressela para quem continua.
5. **Preencher na extensão:** o service worker é o único lugar com chaves. O script de página nunca recebe segredos. O preenchimento só acontece no site certo (mesmo site, https se o item é https). O menu e a barra são iframes da extensão protegidos contra clickjacking.
6. **Rotacionar:** a rotação **assistida** abre a página de troca e gera a senha no cliente. A rotação **em 1 clique** envia a credencial atual à função `rotate`, por TLS e sem registrar valores; ela troca na API do provedor e devolve a nova. Isso quebra o zero-knowledge **só para aquele item**, com consentimento explícito.
7. **Auditar:** gatilhos e eventos do cliente gravam numa tabela só de acréscimo, com cadeia de hashes. Cada backup grava uma âncora externa, e o painel verifica a cadeia.

---

## 3. Criptografia e conformidade com os padrões

| Primitiva | Uso | Padrão | Situação |
|---|---|---|---|
| AES-256-GCM, IV aleatório de 96 bits, AAD com contexto (usuário, item, versão) | Itens, embrulho de chaves, arquivos, exportação, PIN, uso | NIST SP 800-38D, FIPS 197 | ✅ Uma chave por item mantém o número de cifragens por chave muito abaixo do limite de IVs aleatórios |
| PBKDF2-HMAC-SHA256, 600 mil iterações, limites contra rebaixamento (600 mil a 5 milhões) | Senha mestra, exportação, link com senha, PIN | SP 800-132, OWASP 2023+ | ✅ Atende; Argon2id é o alvo (memory-hard) |
| HKDF-SHA256 | Selagem ECDH e PIN | RFC 5869, SP 800-56C | ✅ |
| ECDH P-256 (efêmero-estático, estilo ECIES) | Compartilhar itens e arquivos | SP 800-56A | ✅ hoje · 🟡 até 2030: híbrido com ML-KEM (NIST IR 8547, FIPS 203) |
| SHA-256 | Cadeia de auditoria, verificador do PIN, hash de "nunca neste site" | FIPS 180-4 | ✅ |
| HMAC-SHA1/256/512 (TOTP) | Códigos OTP de sistemas externos | RFC 6238 (testado com os vetores oficiais) | ✅ |
| CSPRNG (`crypto.getRandomValues`) | Chaves, IVs, gerador de senhas, segredo de recuperação | SP 800-90A (via navegador) | ✅ |
| Implementação | WebCrypto do navegador; nenhuma primitiva própria | Princípio "don't roll your own" | ✅ **Sem validação FIPS 140-3** (como o Bitwarden e o Google no navegador). Não declarar "FIPS" |

**O que falta na criptografia (já planejado em `security-assurance.md`):**
- Argon2id;
- **Secret Key** obrigatória (decisão de 2026-11-06), para que um vazamento do banco não permita força bruta contra a senha mestra;
- biometria presa ao chip seguro;
- passkey com PRF para desbloquear;
- rotação da DEK;
- compartilhamento pós-quântico.

---

## 4. Protocolos e mecanismos de plataforma

| Área | Usado | Referência | Observação |
|---|---|---|---|
| Transporte | TLS 1.2/1.3 (Netlify e Supabase), HSTS | RFC 8446 | Certificados geridos pelos provedores |
| Navegador | CSP sem scripts externos, `frame-ancestors 'none'`, Referrer-Policy, `security.txt` | OWASP ASVS 5.0, RFC 9116 | ✅ |
| Identidade | OAuth 2.0 / OIDC com PKCE (Google, GitHub), JWT de 1 h com renovação rotativa | RFC 6749, 7636, 9700 (OAuth Security BCP) | ✅ · 🟡 Redirect URLs exatas por ambiente |
| MFA | TOTP; MFA obrigatório para papéis administrativos | RFC 6238, SP 800-63B-4 | 🟡 Falta fator resistente a phishing (WebAuthn/passkey) |
| Autorização | RLS do Postgres com `auth.uid()` e `aal`; `security definer` com `search_path` vazio; permissões por coluna | Menor privilégio (SP 800-53 AC-6) | ✅ Testes negativos entre contas |
| Extensão | Manifest V3, `chrome.identity.launchWebAuthFlow`, mensagens com remetente conferido, Intersection Observer v2 contra clickjacking | Modelo de segurança do Chromium | ✅ |
| Celular | Capacitor; `allowBackup=false`, `FLAG_SECURE`, sem depuração, deep link próprio | OWASP MASVS 2 | 🟡 Faltam App Links verificados e biometria com Keystore |
| Privacidade de consulta | HIBP com k-anonimato; Web Risk no servidor | — | ✅ |
| Rotação | AWS SigV4, Microsoft Graph, Google Admin SDK e IAM, GitLab, Cloudflare | APIs oficiais | 🟡 Beta, testados só com credenciais falsas |

---

## 5. Funcionalidades de segurança (inventário)

| Grupo | Funcionalidade | Estado |
|---|---|---|
| **Cofre** | Login, nota, segredo/API, cartão; até 10 campos; anexos cifrados; pastas, tags, favoritos; histórico de 10 senhas | ✅ |
| | Lixeira de 14 dias (Premium) | ✅ dev |
| | OTP de sistemas externos (Premium) | ✅ dev |
| **Acesso** | Senha da conta separada da senha mestra; TOTP; sessões com encerramento individual | ✅ |
| | PIN por aparelho (5 tentativas no servidor, 14 dias) | ✅ dev |
| | Modo emergência (Premium) | ✅ dev |
| | Atraso progressivo após senhas mestras erradas; bloqueio por inatividade | ✅ |
| | Passkey, biometria, SSO, Secret Key | ❌ planejado |
| **Compartilhar** | Itens com ver ou editar e prazo; arquivos; transferências com senha, prazo e limite de downloads; revogação com giro de chave | ✅ |
| | Organizações, grupos, coleções, co-dono | ❌ (Enterprise) |
| **Saúde e risco** | Fraca, reutilizada, antiga, vazada (HIBP), site perigoso (Web Risk); postura 0–100; prazos de troca por risco; notificação opcional | ✅ |
| **Governança** | Rotação assistida, programada e em 1 clique (Premium); conectores de API em beta | ✅ / 🟡 |
| | Onde e quando foi usada (Premium) | ✅ dev |
| | Papéis da plataforma: owner, admin, support, auditor; MFA obrigatório para eles; o admin vê só metadados | ✅ |
| | Recertificação de acesso | 🟡 Feita e documentada por testes; falta como campanha periódica no produto |
| | Controle duplo, check-out exclusivo, acesso just-in-time, troca da senha após o uso | ❌ |
| **Auditoria** | Trilha só de acréscimo com cadeia SHA-256, verificação no painel, âncoras externas a cada backup | ✅ |
| | Exportação para SIEM e alertas automáticos | ❌ |
| **Continuidade** | Chave de recuperação; exportação cifrada; leitor offline; central de contingência; backup externo cifrado do servidor | ✅ |
| | Contato de emergência; restauração completa testada; backup automático (Pro) | ❌ |
| **Extensão** | Preenchimento só no site certo, menu no campo, salvar e atualizar senha, gerador, "nunca neste site" em hash, preenchimento ao abrir desligado por padrão, OTP | ✅ (0.2.0 no dev) |
| **Celular** | Android: bloqueio em segundo plano, captura bloqueada, sem backup | ✅ |
| | Preenchimento do sistema, iOS e desktop | ❌ |

---

## 6. Integrações

| Integração | SecureVault | Bitwarden | Idira (CyberArk) |
|---|---|---|---|
| Importação | CSV de Chrome, Edge, Firefox, Bitwarden, 1Password e LastPass; backup próprio | Mais de 50 formatos | Ferramentas de migração |
| Exportação | JSON cifrado + leitor offline | JSON cifrado, CSV | Relatórios e API |
| Login social e SSO | Google, GitHub | SSO SAML/OIDC, trusted devices, Key Connector | SSO e MFA adaptativo são o núcleo do Identity |
| Provisionamento | Convites manuais | SCIM (Entra ID, Okta, OneLogin, JumpCloud, Ping), Directory Connector | SCIM, conectores de diretório |
| SIEM e eventos | Painel e verificação da cadeia | API de eventos, integrações SIEM | SIEM, syslog, PTA |
| API, CLI, SDK | Nenhuma pública | API pública, CLI, SDK | APIs REST, SDKs, Conjur |
| Rotação | 6 conectores em beta | Não tem rotação de credenciais de terceiros | CPM com centenas de plataformas |
| Segredos de máquina | Itens "Segredo/API" | Secrets Manager | Conjur, Secrets Hub (AWS, Azure, GCP) |

---

## 7. Comparação por domínio (0 = ausente, 5 = referência de mercado)

| Domínio | SecureVault | Bitwarden | Google Password Manager | Idira (WPM + PAM) |
|---|---|---|---|---|
| 1. Criptografia e "nem o fornecedor lê" | **4** | 4 | 3 (senhas: criptografia no aparelho é opcional; passkeys de ponta a ponta) | 4 (chave por objeto e HSM; o cofre participa da decifragem, não é zero-knowledge por desenho) |
| 2. Autenticação da conta | 3 | 5 | 5 | 5 |
| 3. Desbloqueio no aparelho (biometria, passkey, chip seguro) | 2 | 5 | 5 | 4 |
| 4. Compartilhamento e controle de acesso | 3 | 5 | 2 | 5 |
| 5. Governança e PAM (rotação, controle duplo, check-out, sessões) | **3** | 1 | 0 | 5 |
| 6. Auditoria e detecção | 3 | 4 | 1 | 5 |
| 7. Plataformas e preenchimento | 2 | 5 | 5 | 3 |
| 8. Integrações corporativas (SSO, SCIM, SIEM, API) | 1 | 5 | 1 | 5 |
| 9. Continuidade e recuperação | 3 | 4 | 4 | 4 |
| 10. Garantia independente (auditorias, certificações, pentest publicado) | **1** | 5 | 4 | 5 |
| 11. Saúde de credenciais e exposição | **4** | 4 | 4 | 3 |
| 12. Segredos de máquina e DevOps | 1 | 4 | 0 | 5 |

**Leitura:**
- **Paridade ou vantagem:** domínios 1, 5 e 11, que são o núcleo da proposta.
- **Atrás, por estágio da empresa e não por defeito de desenho:** domínios 7, 8 e 10. São os que um assinante corporativo cobra primeiro.
- **O Google** é imbatível em conveniência para o consumidor, mas não tem governança.
- **A CyberArk** é imbatível em PAM, com preço e complexidade de grande empresa.
- **O Bitwarden** é o concorrente mais direto em criptografia e preço.

---

## 8. Avaliação "nível CyberArk": controles de PAM

Base: os três princípios do **CyberArk Blueprint** e os controles clássicos do Privilege Access Manager (Digital Vault, CPM, PSM e PTA).

### 8.1 Princípios do Blueprint
| Princípio | O que a CyberArk exige | SecureVault |
|---|---|---|
| **Impedir o roubo de credenciais** | Isolar sessões, remover credenciais embutidas no código, detectar e bloquear roubo | 🟡 Cofre zero-knowledge, preenchimento só no site certo, clickjacking bloqueado. Falta isolamento de sessão e detecção |
| **Impedir movimento lateral e vertical** | Fronteiras entre credenciais, acesso just-in-time, credenciais aleatórias e trocadas | 🟡 Gerador, rotação e prazos. Falta just-in-time e troca automática após uso |
| **Limitar escalada e abuso de privilégio** | Menor privilégio, análise de comportamento, resposta adaptativa | 🟡 RLS e papéis com MFA. Falta analytics e resposta automática |

### 8.2 Controles
| Controle CyberArk | Para quê | SecureVault | Gap |
|---|---|---|---|
| Digital Vault isolado, endurecido, com camadas | Servidor de cofre dedicado | Postgres gerenciado com RLS; o conteúdo já chega cifrado | Equivalente pelo modelo zero-knowledge; falta endurecer o operador (B2) |
| Chave por objeto, Server Key em HSM, Recovery Key offline | Hierarquia de chaves | Chave por item, DEK embrulhada pela senha mestra, chave de recuperação offline | ✅ Equivalente; o HSM fica com o usuário |
| Master Policy | Política central de segurança | Configurações da plataforma: MFA obrigatório, limites, rotação automática ligada ou desligada | 🟡 Falta política por organização |
| **Controle duplo** (aprovação para retirar) | Duas pessoas para acessar | — | ❌ Proposta zero-knowledge na seção 9.1 |
| **Acesso exclusivo / check-out** | Uma pessoa por vez | — | ❌ |
| **Senha de uso único** (troca após o check-in) | Credencial que não serve mais depois de usada | Rotação em 1 clique existe; não dispara sozinha | ❌ |
| **CPM:** troca, verificação e reconciliação automáticas | Rotação contínua | Conectores com verificação (AWS, GCP, Entra) e revogação da chave antiga; sem agendamento no servidor (exigiria custódia) | 🟡 |
| **PSM:** isolamento e gravação de sessões | Ninguém vê a senha; sessão gravada | — | ❌ Fora do escopo de um gerenciador de senhas; possível via agente local no futuro |
| **PTA:** analytics de ameaça | Detectar uso anômalo | Eventos auditáveis existem; nenhuma análise | ❌ (B6 começa com alertas simples) |
| Descoberta de contas privilegiadas | Encontrar o que não está no cofre | — | ❌ |
| Segredos de aplicação (sem credenciais no código) | Conjur, Secrets Hub | Itens "Segredo/API" sem API de leitura | ❌ |
| Separação de funções entre administradores | Ninguém sozinho controla tudo | Papéis owner, admin, support e auditor; o admin não lê cofres | 🟡 Falta controle duplo para conceder papéis |
| Recertificação de acesso | Revisão periódica de quem acessa o quê | Verificação técnica documentada; lista de compartilhamentos com prazo | 🟡 Falta campanha no produto |
| Trilha de auditoria protegida | Imutável, exportável | Só acréscimo, cadeia SHA-256, âncoras externas | ✅ Na integridade, acima do padrão de gerenciadores de senha; falta exportar para WORM/SIEM |
| MFA para todo acesso privilegiado | — | Obrigatório para papéis administrativos | ✅ |
| Break-glass (acesso de emergência) | Conta de emergência controlada | Envelope do dono (manual) | 🟡 |

**Conclusão da seção 8:**
- No **cofre e nos Secured Items**, o SecureVault está **no nível do Idira WPM**, e acima dele em "nem o fornecedor lê". A comparação item a item está em [`cyberark-alignment.md`](../security/cyberark-alignment.md).
- Em **PAM**, o SecureVault cobre de **30% a 40%** do que a CyberArk entrega: cofre, chaves, trilha, MFA e rotação parcial.
- Os controles que faltam (controle duplo, check-out, senha de uso único, analytics) são exatamente o espaço de inovação da seção 9.

---

## 9. Potencial de inovação

Cada ideia diz o que já existe para apoiá-la e o esforço estimado.

### 9.1 Controle duplo e acesso just-in-time sem o servidor ver o segredo (diferencial principal)
- **O problema:** na CyberArk, o controle duplo é uma regra do cofre, que conhece o segredo. No Bitwarden, não existe.
- **A proposta:**
  1. O solicitante pede acesso a um item, com justificativa e prazo.
  2. O aprovador (o dono, ou 2 de N aprovadores) aprova no próprio aparelho.
  3. O **cliente do aprovador** sela a chave do item para o solicitante, com expiração.
  4. Quando o prazo acaba, o servidor apaga a selagem; ao devolver, a rotação troca a senha (senha de uso único).
- **Por que é forte:** o servidor nunca tem como liberar o segredo sozinho, nem se for comprometido. O controle duplo passa a ser **criptográfico**, não só uma regra.
- **Base existente:** compartilhamento com selagem ECDH e prazo, rotação, auditoria.
- **Esforço:** médio (tabela de pedidos, tela de aprovação, notificação).

### 9.2 Rotação sem quebrar o zero-knowledge
- **Hoje:** a rotação em 1 clique envia a credencial ao servidor.
- **Alvo:** executar os conectores **no cliente** (extensão ou app de desktop em Tauri) ou num **agente local** da empresa, para que nenhuma credencial passe pelo SecureLink.
- **Esforço:** médio a alto.

### 9.3 Auditoria verificável publicamente
- **Hoje:** cadeia de hashes com âncoras locais.
- **Alvo:** publicar as âncoras num log público (Sigstore Rekor ou OpenTimestamps) para que **qualquer auditor** prove que o histórico não foi reescrito, nem pelo operador.
- **Esforço:** baixo. Custo quase zero.

### 9.4 Do vazamento à troca, com prova
- **Hoje:** vazamento → prazo → fila → conector já existem.
- **Alvo:** fechar o ciclo com **evidência** (relatório de quem trocou o quê, quando e com qual verificação) para conformidade: LGPD, ISO 27001 A.5.17 e SOC 2 CC6.
- **Esforço:** baixo.

### 9.5 Secured Items brasileiros
- **Proposta:** modelos para certificado digital A1 (.pfx com senha e validade), chaves Pix, acesso gov.br, credenciais de emissão de NF-e e procurações, com **alerta de vencimento**.
- **Por que importa:** nenhum concorrente global trata disso, e é uma dor real de contadores e pequenas empresas.
- **Esforço:** baixo.

### 9.6 Credenciais para agentes de IA
- **Contexto:** a mudança da CyberArk para Idira veio com foco em identidade de máquinas e agentes de IA.
- **Proposta:** um conector MCP no qual o agente **pede** um segredo com escopo e prazo, a pessoa aprova (9.1) e o segredo é entregue selado e expira.
- **Esforço:** médio. Oportunidade de posicionamento.

### 9.7 Analytics sem ver o conteúdo
- **Hoje:** a postura já é enviada ao suporte só com contagens.
- **Alvo:** painel para empresas e prestadores de TI (MSPs) com risco agregado da equipe, sem acesso a nenhum item.
- **Esforço:** baixo a médio.

### 9.8 Contingência como recurso de produto
- **Hoje:** central de preparo, teste da chave de recuperação, leitor offline, PIN com limite no servidor e modo emergência.
- **Por que importa:** poucos concorrentes tratam isso de forma tão explícita, e serve de argumento de confiança na venda.
- **Esforço:** já feito; falta o contato de emergência (fase 2).

---

## 10. Riscos para a proposta (sem rodeios)
1. **Garantia:** sem pentest externo e sem certificação, empresas não compram. O primeiro passo é um pentest externo com relatório publicável e o CAIQ (B7 e B10).
2. **Operação de uma pessoa:** o computador do dono é o ponto mais sensível (lição do LastPass), e não há substituto. Ver B2.
3. **Entrega pelo web:** quem controla o deploy pode servir código malicioso. Mitigações: publicação pela CI e preferência por app nativo e extensão (B8).
4. **Concorrência gratuita:** Google, Apple e o Free do Bitwarden atendem o consumidor. O caminho é **pequenas empresas e profissionais**, onde governança e LGPD valem dinheiro.
5. **Dependência do Supabase:** aceitável (há SOC 2), mas o Free não tem backup automático. O Pro é obrigatório antes de assinantes (B1).
6. **Escopo:** PAM completo (isolamento de sessão, descoberta) é produto de grande empresa. Recomendação: **não** perseguir paridade com a CyberArk. Ficar no "PAM leve zero-knowledge" (9.1 a 9.4).

---

## 11. Prioridades recomendadas

| Ordem | O quê | Por quê |
|---|---|---|
| 1 | Bloqueios B1 a B10 (`security-assurance.md`), com destaque para pentest externo, Pro e restauração, e proteção do operador | Sem isso não há venda legítima |
| 2 | Passkey (login e desbloqueio com PRF), Secret Key, Argon2id, biometria presa ao chip seguro | Fecha os domínios 2 e 3 e a defesa contra vazamento do banco |
| 3 | Preenchimento nativo no Android, iOS e desktop em Tauri | Domínio 7: o assinante espera |
| 4 | Controle duplo e just-in-time zero-knowledge (9.1), auditoria pública (9.3), relatório de evidências (9.4) | Diferencial que justifica o preço |
| 5 | Organizações, grupos, SSO e SCIM, exportação de eventos | Plano Business |
| 6 | Secured Items brasileiros (9.5), analytics para MSPs (9.7), agentes de IA (9.6) | Crescimento |

---

## 12. Referências

**Padrões:**
- NIST CSF 2.0;
- NIST SP 800-63B-4, 800-53 rev. 5 (AC-2, AC-5, AC-6, AU-9, AU-10, IA-2, IA-5, SC-12, SC-13, SC-28), 800-57, 800-38D, 800-132, 800-56A e 800-56C, 800-207, 800-218 (SSDF);
- NIST IR 8547 e FIPS 203 (ML-KEM);
- CSA CCM v4.1;
- OWASP ASVS 5.0 e MASVS 2;
- ISO/IEC 27001:2022;
- CIS Controls v8.1;
- MITRE ATT&CK T1555 (credenciais em gerenciadores de senha) e T1552 (credenciais desprotegidas);
- FIDO2/WebAuthn;
- RFC 5869, 6238, 6749, 7636, 8446, 9116 e 9700;
- LGPD e Resolução CD/ANPD nº 15/2024;
- CyberArk Blueprint.

**Fontes dos concorrentes, consultadas entre 2026-11-06 e 2026-11-10:**
- Bitwarden: [Security Whitepaper](https://bitwarden.com/help/bitwarden-security-white-paper.md), [KDF](https://bitwarden.com/help/kdf-algorithms/), [SSO e autenticação](https://bitwarden.com/en-gb/resources/reference-guide-bitwarden-authentication.md), [recursos Enterprise](https://bitwarden.com/help/enterprise-feature-list.md), [desbloqueio com passkey (PRF)](https://community.bitwarden.com/t/you-can-now-unlock-your-vault-with-a-passkey/93556);
- Google: [segurança das passkeys no Google Password Manager](https://security.googleblog.com/2022/10/SecurityofPasskeysintheGooglePasswordManager.html);
- CyberArk / Idira:
  - [WPM, Security Details and Architecture](https://www.cyberark.com/resources/product-datasheets/workforce-password-management-security-details-and-architecture) (conteúdo detalhado não público);
  - [Secured Items, CyberArk Identity 22.3](https://www.cyberark.com/resources/product-announcements/cyberark-identity-22-3-release);
  - [Privilege Cloud Security Datasheet (2019)](https://static.carahsoft.com/concrete/files/9515/6509/8831/CyberArk_Privilege_Cloud_Security_Datasheet_-_July_2019.pdf);
  - [CyberArk Blueprint](https://www.cyberark.com/resources/tools-blueprints/the-cyberark-blueprint-achieving-privileged-access-management-success);
  - [Idira, novo nome da CyberArk (Infisical)](https://infisical.com/blog/idira-rebranded-cyberark);
- 1Password: [Security Design](https://agilebits.github.io/security-design/1Password_Security_Design.pdf), como referência da Secret Key.
