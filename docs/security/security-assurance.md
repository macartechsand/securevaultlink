# Garantia de segurança para assinantes: avaliação NIST e CSA e arquitetura-alvo

Versão de **2026-11-06** · Escopo: web, extensão, Android, iOS e desktop · Código avaliado: `dev` (`0294c52` + correção do prazo de senha antiga)

Este documento responde a uma pergunta: **o SecureLink Vault pode ser vendido a assinantes com garantia de segurança?** Ele compara o sistema com os referenciais do NIST e da Cloud Security Alliance e com o que fazem os principais gerenciadores de senhas. Termina com a arquitetura-alvo para as cinco plataformas, incluindo as senhas que precisam estar disponíveis no aparelho, e com a lista do que bloqueia a abertura das assinaturas.

Relacionados: [`mvp-security-model.md`](mvp-security-model.md) (modelo atual), [`../SECURITY_TESTING.md`](../SECURITY_TESTING.md) (pentest), [`../operations/release-readiness.md`](../operations/release-readiness.md) (portões).

---

## 1. Veredito

**Ainda não.** A base criptográfica é boa e comparável à do mercado: o servidor nunca vê senhas nem a senha mestra, e cada item tem a própria chave. O que falta para vender com segurança está quase todo **fora do código de criptografia**:
- **continuidade:** backup automático e restauração completa testada;
- **operação do dono:** chaves físicas nas contas de infraestrutura, segredos fora de arquivos soltos, plano de incidentes;
- **autenticação da conta** no padrão do NIST atual;
- **verificação independente:** pentest externo e revisão da criptografia.

A seção 7 lista os **10 bloqueios** para abrir as assinaturas e o que entra depois, na versão 1.0 multiplataforma.

**Sobre "certificar":** nenhum documento interno certifica um produto. O caminho realista e barato é:
1. **Autoavaliação CSA STAR nível 1:** responder o questionário CAIQ v4.1 e publicar no registro da CSA. É gratuito e público. Base pronta na seção 5.
2. **Pentest externo** com relatório e reteste.
3. Com receita: **SOC 2 tipo I**, depois **tipo II** ou **ISO/IEC 27001**, por auditoria independente.

Até lá, o produto **não pode** dizer que é "certificado", "compatível com SOC 2" ou "ISO 27001" (regra que já está no portão 2).

---

## 2. Referenciais usados

| Referencial | Para quê |
|---|---|
| **NIST CSF 2.0** | Estrutura geral: Governar, Identificar, Proteger, Detectar, Responder, Recuperar |
| **NIST SP 800-63B-4** (2025) | Autenticação da conta: senhas, MFA, resistência a phishing, sessões |
| NIST SP 800-57, 800-38D, 800-132, 800-56A, 800-108/HKDF | Gestão de chaves, AES-GCM, derivação a partir de senha, ECDH, derivação de chaves |
| **NIST SP 800-207** | Zero trust: nenhuma confiança implícita na rede ou no servidor |
| **NIST SP 800-218 (SSDF)** | Desenvolvimento seguro e cadeia de suprimentos |
| **NIST IR 8547** | Transição para criptografia pós-quântica (ECC e RSA de 112 bits descontinuados até 2030 e proibidos até 2035) |
| **CSA CCM v4.1** (jan/2026) | Controles de nuvem: 207 controles em 17 domínios; base do STAR |
| OWASP ASVS e MASVS | Verificação de aplicações web e mobile; usados no pentest |
| LGPD e Resolução CD/ANPD nº 15/2024 | Comunicação de incidente à ANPD e aos titulares |

---

## 3. Como os outros provedores fazem

Fontes: documentação pública e whitepapers dos fornecedores. Os números mudam com o tempo; confira no whitepaper de cada um antes de citar publicamente.

| Prática | 1Password | Bitwarden | Apple / Google (gerenciador do sistema) | SecureLink hoje |
|---|---|---|---|---|
| Criptografia no cliente, servidor só com texto cifrado | Sim | Sim | Sim (sincronização de ponta a ponta) | **Sim** |
| Derivação da senha mestra | PBKDF2-SHA256 (número de iterações não confirmado na fonte oficial) **+ Secret Key de 128 bits** (Two-Secret Key Derivation) | PBKDF2-SHA256 600 mil (mínimo desde 2026.2.1) **ou Argon2id** | Chave do aparelho e código do aparelho, com chip seguro | PBKDF2-SHA256 600 mil |
| Proteção se o banco do servidor vazar | Secret Key torna a força bruta inviável mesmo com senha fraca | Depende da força da senha mestra e do KDF | Chaves presas ao chip seguro | Depende da força da senha mestra (mínimo de 12 caracteres) |
| Login sem enviar a senha | SRP | Hash da senha mestra enviado ao servidor | Conta do sistema | **Senha da conta separada** da senha mestra |
| Desbloqueio por biometria ou passkey | Sim | Sim (inclusive passkey com PRF) | Nativo | Não |
| Cópia local para uso sem internet | Sim, cifrada | Sim, cifrada | Sim | **Não** (só a extensão mantém o cofre aberto na sessão) |
| Preenchimento do sistema no Android e iOS | Sim | Sim | Nativo | Não (só a extensão de navegador) |
| Metadados cifrados (título, URL) | Sim | Sim | Sim | **Sim** |
| Auditoria independente | SOC 2 tipo II, pentests publicados | SOC 2 tipo II, auditorias publicadas, código aberto | Programas próprios | Nenhuma ainda |

**Lição do incidente do LastPass (2022):** o invasor entrou pelo **computador pessoal de um engenheiro** com acesso à nuvem e levou os backups dos cofres. Três agravantes: URLs dos sites sem cifragem, contas antigas com poucas iterações de PBKDF2 e nenhuma segunda chave além da senha mestra. Os dois primeiros não se aplicam aqui. O terceiro e o vetor de entrada se aplicam: **o computador do dono é hoje o ponto mais sensível do sistema** (seção 7, bloqueio B2).

---

## 4. Avaliação pelo NIST CSF 2.0

Legenda: ✅ atende · 🟡 parcial · ❌ falta.

### 4.1 Governar (GV)
| Item | Estado | Evidência ou lacuna |
|---|---|---|
| Papéis e responsabilidades | 🟡 | Um único responsável (o dono). **Risco de pessoa-chave:** sem ele, ninguém restaura, publica ou responde a incidente |
| Política de segurança e de riscos aceitos | 🟡 | Riscos aceitos documentados ([`../SECURITY_TESTING.md`](../SECURITY_TESTING.md), seção 4); falta política formal curta |
| Fornecedores (Supabase, Netlify, Cloudflare R2, Google Web Risk, HIBP) | 🟡 | Usados com papéis claros; falta lista pública de suboperadores e guardar os relatórios SOC 2 de cada um |
| Requisitos legais (LGPD) | 🟡 | Exportação e exclusão de conta existem; faltam Termos, Política de Privacidade, encarregado de dados e RIPD |

### 4.2 Identificar (ID)
| Item | Estado | Evidência ou lacuna |
|---|---|---|
| Inventário de ativos e dados | ✅ | [`../operations/data-storage-and-backup.md`](../operations/data-storage-and-backup.md) |
| Modelo de ameaças | 🟡 | Espalhado entre os documentos; consolidado na seção 6 deste |
| Gestão de vulnerabilidades | 🟡 | CI com CodeQL, Gitleaks, `npm audit` e Dependabot; pentest do dono em andamento; falta o externo |

### 4.3 Proteger (PR)
| Item | Estado | Evidência ou lacuna |
|---|---|---|
| Criptografia dos dados | ✅ | AES-256-GCM com AAD; chave por item; ECDH P-256 + HKDF para compartilhar; tudo por WebCrypto, sem criptografia própria; limites contra rebaixamento do KDF (600 mil a 5 milhões) |
| Derivação da senha mestra | 🟡 | PBKDF2 600 mil atende o OWASP, mas sem segunda chave a proteção contra vazamento do banco depende só da senha mestra. Argon2id e Secret Key estão na seção 8 |
| Senha da conta (SP 800-63B-4) | 🟡 | Mínimo de **10** caracteres com MFA **opcional**. O NIST pede **15** quando a senha é o único fator. Falta bloquear senhas vazadas no cadastro |
| MFA | 🟡 | TOTP, exigido de todo papel administrativo e ligado para todos na produção. Falta opção **resistente a phishing** (passkey/WebAuthn) |
| Senha da conta diferente da senha mestra | 🟡 | São separadas por projeto, mas nada impede o usuário de usar a mesma, o que entregaria a senha mestra ao servidor de autenticação |
| Isolamento entre usuários | ✅ | RLS em todas as tabelas, `revoke all` para `authenticated`, testes negativos entre contas |
| Menor privilégio no painel | ✅ | O admin vê só metadados; ações sensíveis com MFA e auditoria |
| Proteções do cliente web | ✅ | CSP sem scripts externos, HSTS, `frame-ancestors 'none'`, sem segredos em `localStorage` |
| Extensão | ✅ | Remetente conferido, iframes da extensão com proteção contra clickjacking, preenchimento só no site certo, bloqueio após 10 min |
| Android | ✅ | Sem backup, sem depuração, captura bloqueada, bloqueio em segundo plano |
| Integridade do código entregue (web) | 🟡 | Publicação por script que confere o bundle. Limite estrutural de todo cofre web: quem controla o deploy pode servir JavaScript que captura a senha mestra. Mitigações na seção 8.6 |
| Cadeia de suprimentos | 🟡 | Dependências com pelo menos 2 semanas de publicação, Dependabot, lockfile. Faltam SBOM e builds assinados com procedência |
| Proteção do operador | ❌ | Segredos de produção em arquivos no perfil do Windows; sem chave física declarada nas contas de infraestrutura |

### 4.4 Detectar (DE)
| Item | Estado | Evidência ou lacuna |
|---|---|---|
| Trilha de auditoria à prova de adulteração | ✅ | Só acréscimo, cadeia de hashes, âncoras externas a cada backup |
| Monitoramento e alertas | ❌ | Monitores e heartbeat implementados, mas não criados; nenhum alerta de anomalia (muitas falhas de login, ações administrativas fora do padrão) |
| Retenção de logs da plataforma | 🟡 | Supabase Free guarda pouco; exportar ou ampliar no Pro |

### 4.5 Responder (RS)
| Item | Estado | Evidência ou lacuna |
|---|---|---|
| Plano de incidentes | ❌ | Falta: quem age, como conter (suspender contas, girar chaves, pausar o site), como comunicar. A ANPD exige comunicação em **3 dias úteis** para incidentes relevantes (Resolução 15/2024) |
| Canal de vulnerabilidades | 🟡 | `security.txt` aponta para o GitHub; falta ativar o relato privado no repositório |

### 4.6 Recuperar (RC)
| Item | Estado | Evidência ou lacuna |
|---|---|---|
| Backup | 🟡 | Backup externo cifrado manual (AES-256-GCM, scrypt), primeiro feito em 2026-11-05. Free sem backup automático |
| Restauração testada | 🟡 | Só parcial (decifrar e conferir hashes). A completa exige um terceiro projeto, possível no Pro |
| RPO e RTO | ❌ | Proposta: RPO 24 h, RTO 4 h, ainda não testados |

---

## 5. Avaliação pela CSA CCM v4.1 (base para o CAIQ)

| Domínio | Estado | Resumo |
|---|---|---|
| A&A: auditoria e garantia | ❌ | Sem auditoria independente |
| AIS: segurança de aplicações | 🟡 | CI com análise estática, testes de RLS; falta pentest externo |
| BCR: continuidade e resiliência | ❌ | Free, sem backup automático, sem restauração completa testada |
| CCC: gestão de mudanças | ✅ | PR com CI, publicação da produção só por script verificado |
| CEK: criptografia e chaves | 🟡 | Forte no cliente; falta política de rotação da chave do cofre e plano pós-quântico |
| DCS: datacenter | ✅ (herdado) | Responsabilidade do Supabase (AWS `sa-east-1`), do Netlify e da Cloudflare |
| DSP: dados e privacidade | 🟡 | Zero-knowledge e minimização; faltam documentos da LGPD |
| GRC: governança e risco | 🟡 | Riscos documentados; falta registro formal |
| HRS: pessoas | 🟡 | Operação de uma pessoa; sem substituto treinado |
| IAM: identidade e acesso | 🟡 | MFA admin, RLS; faltam passkeys e chaves físicas do operador |
| IPY: portabilidade | ✅ | Exportação cifrada; formatos documentados |
| IVS: infraestrutura e virtualização | ✅ (herdado) | Sem servidores próprios |
| LOG: logs e monitoramento | 🟡 | Auditoria sólida; faltam alertas |
| SEF: incidentes | ❌ | Sem plano nem simulado |
| STA: cadeia de suprimentos e fornecedores | 🟡 | Falta lista de suboperadores, DPA com cada fornecedor e SBOM |
| TVM: ameaças e vulnerabilidades | 🟡 | Dependabot, CodeQL, pentest interno |
| UEM: dispositivos | 🟡 | Proteções do app Android; faltam as do computador do operador |

**Responsabilidade compartilhada:** Supabase, Netlify e Cloudflare respondem pela infraestrutura física, rede e plataforma (há relatórios SOC 2 de cada um, mediante solicitação). O SecureLink responde por: configuração (RLS, autenticação, segredos), código, contas de operação, backups, resposta a incidentes e privacidade. Como os dados chegam cifrados, um vazamento do provedor expõe só texto cifrado e metadados.

---

## 6. Modelo de ameaças resumido

| Ameaça | Impacto hoje | Defesa atual | O que falta |
|---|---|---|---|
| Vazamento do banco (provedor ou backup roubado) | Força bruta fora do ar contra a chave do cofre embrulhada | PBKDF2 600 mil, senha mestra de 12+, AES-GCM | **Secret Key** (força bruta inviável) e Argon2id |
| Computador do dono comprometido | Acesso à produção, aos backups e à publicação do site | Arquivos privados no perfil do Windows | **Chaves físicas**, segredos num cofre, BitLocker, perfil de navegador só para administração |
| Deploy malicioso do site | JavaScript que captura a senha mestra de quem abrir o app | Script de publicação, CSP | 2FA física no Netlify e GitHub, publicação só pela CI a partir de tag, hash do bundle publicado, preferir app nativo e extensão |
| Phishing da conta | Acesso à sessão, mas o cofre continua cifrado | Senha mestra separada, MFA | Passkeys; aviso se senha da conta = senha mestra |
| XSS no app | Leitura do cofre aberto | CSP estrita, React escapa por padrão | Pentest; Trusted Types |
| Aparelho roubado | Hoje não há cópia local; sessão pode estar aberta | Bloqueio por inatividade, bloqueio em segundo plano no Android | Com a cópia local (seção 8): chave presa ao chip seguro, limpeza remota, prazo máximo sem conexão |
| Abuso das funções (cotas, SSRF, enumeração) | Custo ou exposição de metadados | Cotas no banco, JWT, CORS | Alertas de uso anômalo |
| Dependência comprometida no npm | Código malicioso no bundle | Atraso de 2 semanas, lockfile, Dependabot | SBOM, revisão das diferenças do lockfile, procedência dos builds |
| Computação quântica no futuro ("guarde agora, quebre depois") | Compartilhamentos com ECDH P-256 | AES-256 continua adequado | Compartilhamento híbrido com ML-KEM-768 até 2030 (NIST IR 8547) |

---

## 7. O que bloqueia a abertura das assinaturas

Cada bloqueio tem dono e evidência de conclusão. Os que dependem de painel ou de contas externas são do dono; os de código, do desenvolvimento.

| # | Bloqueio | Referência | Quem | Evidência de conclusão |
|---|---|---|---|---|
| B1 | **Supabase Pro** com backup diário (de preferência PITR) e **restauração completa testada** num projeto temporário | CSF RC, CCM BCR | Dono | Registro do teste com tempo medido (RTO) |
| B2 | **Proteção do operador:** chave física FIDO2 em Supabase, GitHub, Netlify, Google, Cloudflare, domínio e e-mail; BitLocker; segredos de `~/.securelink-prod/` dentro de um cofre; perfil de navegador só para administração; uma segunda pessoa com acesso de emergência (envelope lacrado) | CSF PR.AA, CCM IAM/UEM/HRS | Dono | Lista conferida |
| B3 | **Senha da conta conforme o SP 800-63B-4:** mínimo de 15 caracteres **ou** MFA obrigatório para assinantes; proteção contra senhas vazadas do Supabase (Pro); aviso se a senha da conta for igual à senha mestra | 800-63B-4 | Código + painel | Teste automatizado e configuração conferida |
| B4 | **Passkey (WebAuthn) como segundo fator** além do TOTP | 800-63B-4 (resistência a phishing) | Código | Teste ponta a ponta |
| B5 | **Plano de incidentes** com contatos, contenção, comunicação à ANPD em 3 dias úteis e um simulado registrado | CSF RS, CCM SEF, LGPD | Dono + documentação | Simulado registrado |
| B6 | **Monitoramento com alertas:** disponibilidade, heartbeat, picos de falha de login e ações administrativas | CSF DE, CCM LOG | Dono + código | Alerta de teste recebido |
| B7 | **Pentest** (o do dono agora e um externo antes da venda ampla) sem achado crítico ou alto em aberto | CSF ID.RA, CCM TVM/A&A | Dono + terceiro | Relatório e reteste |
| B8 | **Integridade da publicação:** site de produção publicado só pela CI a partir de tag assinada, 2FA física no Netlify, hash do bundle registrado em cada versão | SSDF PS/PW | Código + dono | Pipeline e registro |
| B9 | **Documentos legais e de fornecedores:** Termos, Privacidade, encarregado de dados, lista de suboperadores, DPA aceito com cada fornecedor | CSF GV, CCM STA/DSP | Dono | Publicados no site |
| B10 | **Autoavaliação CAIQ v4.1** preenchida a partir das seções 4 e 5 (publicar no STAR é opcional) | CCM | Documentação | Planilha preenchida |

**Já corrigido nesta revisão:** o prazo de 30 dias para senhas com mais de 1 ano foi removido. O SP 800-63B-4 desaconselha forçar trocas periódicas sem indício de comprometimento. A senha antiga continua como dica de baixa prioridade, e quem quiser troca periódica usa a troca programada do item.

---

## 8. Arquitetura-alvo para as cinco plataformas

### 8.1 Princípios
1. **Zero-knowledge em todas as plataformas:** a mesma biblioteca de criptografia, com os mesmos vetores de teste, em web, extensão, Android, iOS e desktop.
2. **Local primeiro, nuvem para sincronizar:** o aparelho tem uma cópia cifrada e funciona sem internet; o servidor guarda e distribui texto cifrado.
3. **Chave presa ao hardware quando houver:** Secure Enclave (iOS e macOS), StrongBox ou TEE (Android), TPM (Windows).
4. **Duas chaves para abrir o cofre:** a senha mestra (o que você sabe) e a Secret Key (o que o aparelho tem).
5. **Nada de confiança implícita no servidor** (SP 800-207): o cliente confere versões, assinaturas e parâmetros que vêm do servidor.

### 8.2 Hierarquia de chaves (versão 2)
```
senha mestra ──Argon2id (sal da conta)──┐
                                        ├─HKDF──> chave de desbloqueio (KEK)
Secret Key (128 bits, só nos aparelhos) ┘                │
                                                 embrulha│
                                                         v
                    chave do cofre (DEK, AES-256) ──embrulha──> chave de cada item ──> item cifrado
                          │
                          ├─ embrulhada pela chave de recuperação (opcional, como hoje)
                          ├─ embrulhada por chave do aparelho no chip seguro (desbloqueio por biometria)
                          └─ embrulhada por passkey com extensão PRF (desbloqueio sem digitar)
```
- **Argon2id** (memória de 64 MiB, ajustável por aparelho) em WebAssembly no navegador e nativo no mobile e desktop. PBKDF2 continua aceito na leitura, e a migração acontece no próximo desbloqueio: o cliente reembrulha a DEK; nenhum item precisa ser recifrado.
- **Secret Key:** gerada no cliente, nunca enviada ao servidor. Fica no chaveiro de cada aparelho e num **Kit de Emergência** (PDF para imprimir) com e-mail, Secret Key e espaço para a senha mestra. Para entrar num aparelho novo: Kit de Emergência, QR code lido de um aparelho já conectado, ou chave de recuperação.
- **Biometria:** a biometria só libera uma chave do chip seguro que embrulha a DEK. Cadastrar uma digital nova invalida essa chave, e a senha mestra volta a ser exigida. A senha mestra também é exigida a cada 14 dias e depois de reiniciar o aparelho.
- **Rotação da DEK:** sob demanda e após perda de aparelho. Recifra as chaves dos itens, não os itens.
- **Pós-quântico:** compartilhamento híbrido (P-256 + ML-KEM-768) com biblioteca auditada, antes de 2030.

### 8.3 Senhas que precisam estar no aparelho: três classes

| Classe | Para quê | Onde fica | Sincroniza? |
|---|---|---|---|
| **1. Sincronizado** (padrão) | Logins, notas, cartões, arquivos | Servidor (cifrado) + cópia cifrada em cada aparelho | Sim |
| **2. Sempre disponível sem internet** | O que precisa abrir mesmo sem rede: e-mail principal, banco, Wi-Fi, códigos de recuperação de outras contas, acessos de emergência | Cópia cifrada **garantida** no aparelho, baixada antes de qualquer outra e disponível para o preenchimento do sistema | Sim |
| **3. Somente neste aparelho** | O que não deve existir na nuvem nem cifrado: frases-semente de carteiras, segredos de dispositivos, chaves de alto valor, a critério do usuário | Só no aparelho, cifrado pela DEK **e** por uma chave presa ao chip seguro daquele aparelho | **Nunca.** Cópia só pela exportação cifrada feita pelo usuário |

**Regras da classe 3:**
- O servidor não recebe o item, nem o texto cifrado, nem metadados.
- Se o aparelho for perdido sem exportação, o item é perdido. A tela diz isso antes de salvar.
- O backup do sistema operacional não leva o item (`ThisDeviceOnly` no iOS; banco fora do backup no Android).

**Regras da cópia local (classes 1 e 2):**
- O banco local guarda os itens **como vêm do servidor**, já cifrados. Nenhum índice ou título em texto puro no disco.
- **Prazo máximo sem conexão** (por exemplo, 30 dias). Depois, a cópia continua aberta só com a senha mestra, sem biometria, até sincronizar.
- **Limpeza remota:** ao encerrar a sessão de um aparelho pelo painel, ele apaga a cópia na próxima conexão. Sem conexão não há como apagar; por isso, a orientação para aparelho perdido é girar a DEK e trocar as senhas mais críticas.
- Em compartilhamentos revogados, a cópia do destinatário some na próxima sincronização. Isso é limitação conhecida e documentada.
- **Conflitos:** cada item tem revisão; se duas edições sem conexão colidirem, as duas versões ficam no histórico do item e o usuário escolhe.

### 8.4 Por plataforma

| Plataforma | Tecnologia | Cópia local | Chave do aparelho | Preenchimento |
|---|---|---|---|---|
| **Web** | App atual (React) | IndexedDB, **opcional e desligada por padrão** (computadores compartilhados); classe 3 indisponível | `CryptoKey` não exportável no IndexedDB + passkey PRF | Pela extensão |
| **Extensão** (Chrome, Edge, depois Firefox e Safari) | MV3 atual | `chrome.storage.local` só com texto cifrado | Passkey PRF ou desbloqueio pelo app de desktop | Menu e barra atuais (fase 2) |
| **Android** | Capacitor atual + módulos nativos em Kotlin | SQLite com itens cifrados | Android Keystore (StrongBox quando houver) + BiometricPrompt com `CryptoObject` | **Autofill Service** e Credential Manager (passkeys) nativos |
| **iOS** | Capacitor + módulos nativos em Swift | SQLite no grupo de apps, com proteção de dados completa | Secure Enclave, chaves `ThisDeviceOnly`, Face ID com `biometryCurrentSet` | **Credential Provider Extension** (senhas e passkeys) nativa |
| **Desktop** (Windows, macOS, Linux) | **Tauri 2** com a mesma interface web (menor e com menos superfície que Electron) | SQLite com itens cifrados | Windows Hello e TPM; Keychain e Touch ID no macOS; Secret Service no Linux | Pela extensão, que conversa com o app por *native messaging* (desbloqueio compartilhado) |

**Por que o preenchimento nativo exige a cópia local:** os serviços de preenchimento do Android e do iOS rodam em processo separado, com pouca memória e tempo, e não devem depender da rede. Por isso a classe 2 existe e a cópia local é pré-requisito do preenchimento nativo.

### 8.5 Autenticação da conta (alvo)
- E-mail e senha da conta (15+ ou MFA obrigatório), **passkey** como fator principal recomendado, TOTP como alternativa, Google e GitHub mantidos.
- Novo aparelho exige a conta **e** a Secret Key: roubar a sessão não basta para abrir o cofre.
- Sessões curtas no web (token de 1 h, renovação com rotação, que é o padrão do Supabase) e lista de aparelhos com encerramento remoto (já existe).

### 8.6 Integridade do código entregue
- **Web:** publicar só pela CI a partir de tag assinada; registrar o hash do bundle de cada versão na página de segurança; ativar 2FA física no Netlify. Limite conhecido: no web, o usuário confia em quem publica o site a cada visita.
- **Extensão, Android, iOS e desktop:** pacotes assinados e revisados pelas lojas, com atualização verificada. Por isso, o produto recomenda os apps e a extensão para uso diário, e o web para acesso eventual.
- **SBOM** (CycloneDX) gerado na CI para cada versão.

---

## 9. Ordem sugerida

1. **Agora, durante o beta (código):**
   - B3: aviso de senha da conta igual à senha mestra e mínimo de 15 sem MFA;
   - B4: passkey como segundo fator;
   - B6: alertas;
   - B8: publicação pela CI e SBOM.
2. **Agora, durante o beta (dono):** B2 (proteção do operador) e B5 (plano de incidentes). Não custam nada e reduzem o maior risco atual.
3. **Ao abrir as assinaturas:** B1 (Pro e restauração), B7 (pentest externo), B9 (legal), B10 (CAIQ).
4. **Versão 1.0 multiplataforma:**
   - **Criptografia versão 2:** Argon2id, Secret Key com Kit de Emergência, biometria presa ao chip seguro, passkey PRF;
   - **Cópia local e as três classes;** depois o preenchimento nativo no Android e no iOS;
   - **App de desktop em Tauri** com integração à extensão;
   - revisão MASVS dos apps;
   - **revisão independente da criptografia** antes das lojas.
5. **Depois da 1.0:** compartilhamento pós-quântico, SOC 2, programa de recompensa por falhas.

**Decisões do dono (2026-11-06):**
- **Secret Key obrigatória** para contas novas. Contas existentes ganham a Secret Key no primeiro desbloqueio após a versão 2 e recebem o Kit de Emergência.
- **Cópia local no web desligada** por padrão.
- **Desktop em Tauri 2.**
- **Prazo máximo sem conexão:** em aberto (proposta de 30 dias, seção 8.3).

---

## Fontes consultadas em 2026-11-06
- Bitwarden: [algoritmos de KDF](https://bitwarden.com/help/kdf-algorithms/)
- 1Password: [Security Design (whitepaper)](https://agilebits.github.io/security-design/1Password_Security_Design.pdf) e [uso do SRP](https://1password.com/blog/developers-how-we-use-srp-and-you-can-too)
- NIST: [SP 800-63B-4](https://doi.org/10.6028/NIST.SP.800-63b-4)
- CSA: [Cloud Controls Matrix v4.1](https://cloudsecurityalliance.org/artifacts/cloud-controls-matrix-v4-1) e [cronograma de transição](https://cloudsecurityalliance.org/articles/ccm-v4-1-transition-timeline)
