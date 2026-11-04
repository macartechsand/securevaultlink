# Revisão de funcionalidades: inventário real, lacunas e prioridades

> Revisão de 2026-11-04, feita sobre o código do branch `dev` (commit `85a1f72`).
>
> **Evidência** significa código e testes reais, não só interface. Testes com mocks não contam como prova de segurança, e a suíte atual não usa mocks na criptografia.
>
> Os planos estão em [`plan-strategy.md`](plan-strategy.md).

**Legenda:** ✅ implementada e funcional · 🟡 parcial · 🔌 depende de serviço externo · ❌ não implementada · ⚠️ precisa reforço

Caminhos abreviados: `src/` = `web-saas/src/`, `mig/` = `supabase/migrations/`, `fn/` = `supabase/functions/`.

## 1. Conta e autenticação
| Funcionalidade | Estado | Evidência |
|---|---|---|
| Cadastro só por convite, limite de contas | ✅ | `mig/20261020000000_closed_beta.sql` (lista e limite checados no servidor; a lista não é exposta ao app), `mig/20261023000000_premium_invites.sql` |
| E-mail e senha; verificação de e-mail | ✅ / 🔌 | `src/services/authService.ts`. A confirmação de e-mail é configuração do Supabase. Sem SMTP próprio, só chega a membros da equipe |
| Google e GitHub (OAuth + PKCE) | ✅ | `src/lib/oauthProviders.ts`, `docs/security/oauth.md`; extensão em `extension/src/oauthCallback.ts`; app em `src/lib/nativeShell.ts` |
| MFA TOTP, exigido por RLS (aal2) | ✅ | `mig/20261010000000_mfa_and_remove_recovery_key.sql`, `src/services/mfaService.ts`, `src/components/MfaChallenge.tsx` |
| Login por passkey (WebAuthn) | ❌ | Não existe |
| Recuperação da **conta** (senha de login) | ✅ | "Esqueci a senha" e link gerado pelo admin (`fn/admin`) |
| Recuperação do **cofre** | ✅ | Chave de recuperação opcional (`src/components/RecoverySettings.tsx`); sem ela, "recomeçar o cofre" (`fn/account`, ação `reset_vault`) |
| Sessões ativas e encerramento remoto | ✅ | `mig/20261019000100_posture_sessions.sql`, `src/components/SessionsCard.tsx` |
| Proteção contra força bruta no login | 🔌 | Limites do próprio Supabase Auth, mais o MFA |
| Força bruta na senha mestra | ⚠️ | O desbloqueio é local. A defesa é o PBKDF2 com 600 mil iterações, e cada falha é auditada (`vault.unlock_failed`). Falta um atraso progressivo na interface |
| Admin sem acesso ao conteúdo do cofre | ✅ | Nenhuma função administrativa devolve conteúdo cifrado (`mig/20261021000000_iam_pam_support.sql`; testes `iam.integration`) |

## 2. Cofre zero-knowledge
| Funcionalidade | Estado | Evidência |
|---|---|---|
| Senha mestra → PBKDF2-SHA256 600k → KEK → DEK aleatória (AES-256-GCM) | ✅ | `src/lib/crypto/vaultCrypto.ts` (parâmetros versionados no perfil, salt e IV aleatórios); testes em `vaultCrypto.test.ts` |
| Chave por item, com AAD (dono, item e versão) | ✅ | `src/lib/crypto/itemCrypto.ts`, `mig/20261019000000_secured_items.sql` |
| Anexos e arquivos com chave própria, blocos de 1 MiB autenticados | ✅ | `src/lib/crypto/fileCrypto.ts` |
| Metadados sensíveis cifrados (título, usuário, URL, notas, nome de pasta) | ✅ | Ficam no blob cifrado. Sobram no servidor só quantidades, tamanhos e datas |
| Chave nunca ao lado do ciphertext | ✅ | A DEK só existe embrulhada (pela senha e pela recuperação) |
| Chaves em memória; bloqueio automático; limpeza ao sair | ✅ | `src/state/useVaultSession.ts`; 5 min na web, 10 min na extensão, 1 min em segundo plano no Android |
| Troca da senha mestra (embrulhar de novo, sem cifrar tudo outra vez) | ✅ | `vaultCrypto.ts` |
| Rotação da DEK (cifrar todo o cofre de novo) | ❌ | Não existe. É útil após suspeita de comprometimento |
| Argon2id | ❌ | Hoje é PBKDF2. Migrar exige WASM; o perfil já guarda a versão do KDF, então a migração pode ser feita aos poucos |
| CSP, HSTS, `frame-ancestors`, sem scripts inline | ✅ | `netlify.toml` |
| Área de transferência com limpeza | ✅ | 30 s na web e na extensão (documento offscreen) |
| Keystore (Android) / Keychain (iOS) | ❌ | Necessário para a biometria (fase 2 do app) |
| Exportação cifrada e importação CSV | ✅ | `src/lib/vaultExport.ts` (PBKDF2 + AES-GCM), `src/components/BackupCard.tsx` |

## 3. Tipos de item e organização
| Funcionalidade | Estado | Evidência |
|---|---|---|
| Login, Nota, Segredo/API, Cartão | ✅ | `src/lib/items.ts`, `src/components/ItemEditor.tsx` |
| 10 campos personalizados (com ocultar), notas de 4.000 caracteres, 10 anexos | ✅ | Validação em `items.ts`, limites no banco |
| Pastas (nome cifrado), tags, favoritos, busca, filtros | ✅ | `src/components/VaultView.tsx`, `ItemList.tsx` |
| Histórico das últimas 10 senhas, com restaurar | ✅ | Histórico cifrado em `vault_entries`, visível só para o dono |
| Histórico completo de versões do item | ❌ | Só a senha tem histórico |
| **Limite de itens por plano (Free = 7)** | ❌ | Não existe limite de itens no servidor. Item P1 da Fase D |
| Passkeys guardadas como item do cofre | ❌ | Futuro (P3) |

**Impacto de armazenamento** (estimativa): um item cifrado ocupa de 2 a 5 KB e pode chegar a cerca de 20 KB com o histórico cheio. Mil usuários com 200 itens ocupam cerca de 1 a 4 GB de banco. Os arquivos dominam o consumo; os itens são baratos.

## 4. Compartilhamento e arquivos
| Funcionalidade | Estado | Evidência |
|---|---|---|
| Compartilhar com usuário (ECDH P-256 → HKDF → AES-GCM), ver ou editar | ✅ | `src/components/ItemShareDialog.tsx`, `mig/20261019000000_secured_items.sql`; testes `items.integration` |
| Impressão digital da chave, revogação com troca de chave | ✅ | Idem |
| Validade por plano (48 h no Free; até 30 dias ou sem prazo no Premium) | ✅ | `private.max_share_hours` (servidor) |
| Limite de compartilhamentos ativos por plano | ❌ | Proposta do `plan-strategy` |
| Cofre de arquivos, "Compartilhados comigo" | ✅ | `src/services/fileService.ts`, `FilesView.tsx`; cota no servidor (`enforce_file_quota`) |
| Transferência por link (senha, prazo, limite de downloads, revogação) | ✅ | `fn/transfer`, `src/components/OneTimeLink.tsx`. A chave vai no fragmento da URL e nunca chega ao servidor |
| P2P (WebRTC) | ❌ | Decisão: **não fazer**. O servidor só guarda o que já é cifrado e funciona em qualquer rede. P2P exigiria servidores TURN, com custo, sem ganho de sigilo |
| Auditoria de compartilhamento | ✅ | Eventos `share.*`, `transfer.*` |
| Arquivos acima de 25 MB | ❌ | Exige cifragem em streaming (P2) |
| Mensagem de erro do limite de 25 MB | ⚠️ | Cita "No plano gratuito" mesmo no Premium |

## 5. Postura de segurança
| Funcionalidade | Estado | Evidência |
|---|---|---|
| Fraca, reutilizada, antiga, troca vencida (local) | ✅ | `src/lib/health/passwordHealth.ts`, `itemHealth.ts` |
| Vazadas (HIBP, k-anonimato, só o prefixo do hash) | ✅ 🔌 | `src/lib/health/pwned.ts` |
| URLs perigosas | ✅ 🔌 ⚠️ | `fn/check-url` usa o **Google Safe Browsing**, que é para uso não comercial. Trocar pelo **Web Risk** antes de cobrar. O limite de uso fica em memória e vale **por instância** da função; precisa de contador no banco |
| Pontuação de 0 a 100 com recomendações | ✅ | `src/lib/posture.ts`, com pesos: senhas 40, proteção da conta 30, sites 15, compartilhamentos 10, sessões 5 (testes em `posture.test.ts`). **Falta documentar a fórmula para o usuário** |
| Fila de risco | ✅ | `src/components/RotationView.tsx` |
| Monitoramento contínuo, verificação agendada, alertas | ❌ | Hoje a verificação é feita sob demanda. Agendar exige notificação (e-mail ou push) |
| Infostealer, dispositivos desconhecidos, acessos anômalos | ❌ | Futuro (P4). Com telemetria própria dá para detectar sessão nova, país novo e falhas em série. Logs de infostealer só com fonte licenciada |

## 6. Rotação e Micro-PAM
| Funcionalidade | Estado | Evidência |
|---|---|---|
| 1 clique e assistida: gera, copia, abre a página de troca e salva só após confirmação | ✅ | `src/components/QuickRotate.tsx`, `RotateWizard.tsx` |
| Por API: AWS IAM, Entra/M365, Google Workspace, GCP, GitLab, Cloudflare | 🟡 🔌 | `fn/rotate`, com consentimento por item. O servidor recebe a credencial **a cada chamada** e não guarda nem registra valores; tem proteção contra SSRF e limite de 20 por hora. **Testado só com credenciais falsas** (`rotate.integration`). Detalhes em `docs/architecture/connectors-rotation.md` |
| Lembrete de troca programada (30 dias a 1 ano) | ✅ | Data de vencimento no item; não executa sozinho |
| Rotação sem o usuário presente | ❌ | Decisão: só com custódia explícita, no Enterprise. Conflita com o zero-knowledge |
| Papéis, acesso temporário com justificativa, recertificação | 🟡 | Existem para **administrar a plataforma** (`mig/20261021000000_iam_pam_support.sql`, aba PAM). Não existem por organização de cliente |
| Organizações, cofres compartilhados, check-out, identidades não humanas, SSO, SCIM, break-glass | ❌ | Futuro (P4) |

## 7. Auditoria
| Funcionalidade | Estado | Evidência |
|---|---|---|
| Log só de inclusão, com cadeia de hashes e verificação | ✅ ⚠️ | `mig/20261102000000_beta_scope_audit_integrity.sql`. **Limite:** a cadeia fica no mesmo banco, então quem tem acesso total a ele pode reescrevê-la inteira. Falta ancorar periodicamente o último hash, assinado, fora do banco (P1, barato) |
| Retenção de 365 dias, preservando a cadeia | ✅ | `fn/cleanup-files` |

## 8. Plataformas
| Plataforma | Estado | Evidência |
|---|---|---|
| Web/PWA | ✅ | `web-saas/`, manifest e ícones |
| Extensão Chrome/Edge (MV3) | ✅ fase 1 | `web-saas/extension/`. Domínio por eTLD+1, nunca preenche em iframe de outro site, exige gesto do usuário, 6/6 testes ponta a ponta. Não salva senha ao fazer login (fase 2) |
| Android | ✅ fase 1 | `web-saas/android/`. Bloqueio de captura (`FLAG_SECURE`), sem backup, sem depuração, bloqueio em segundo plano. Faltam biometria e autopreenchimento do sistema |
| iOS | 🟡 | Só PWA. App nativo na versão 1.0 |

## 9. Produção e operação
| Item | Estado | Evidência |
|---|---|---|
| Ambientes de desenvolvimento e produção separados | ✅ | Projetos e sites distintos; segredos de produção fora do repositório |
| Staging | 🟡 | **Decisão:** o projeto de desenvolvimento faz o papel de staging. O Free permite 2 projetos ativos |
| Migrations versionadas, RLS, testes de isolamento | ✅ | 19 migrations; suítes `rls`, `files`, `items`, `iam` |
| Backup | 🟡 | Externo e cifrado (`scripts/backup`). O Free não tem backup automático. **Restauração completa ainda não testada** |
| SMTP próprio | ❌ | Necessário para confirmação, avisos e cobrança |
| Monitoramento de erros e disponibilidade | 🟡 | Relatórios de erro vão para o próprio banco (`client.error`). Sem alerta externo |
| Testes automáticos em todo PR (CI) | ❌ | Os testes rodam localmente |
| Termos de Uso, Política de Privacidade | 🟡 | Existe o aviso de privacidade no app. Faltam os termos completos |
| Cobrança | ❌ | O Premium é atribuído pelo admin |

---

## 10. Lacunas priorizadas

Esforço em faixas, de uma pessoa com o Claude. São ordens de grandeza, não prazos.

### P0: antes de abrir a produção a mais usuários
| Item | Valor | Esforço | Aceite |
|---|---|---|---|
| Teste de **restauração completa** do backup | Sem ele, o backup é uma suposição | 0,5–1 dia | Restaurado num projeto temporário, itens decifrados com a senha mestra |
| Limite de uso da verificação de URLs no banco | Evita abuso e custo | 0,5 dia | Teste: a 51ª consulta do dia no Free devolve 429 |
| SMTP próprio (Resend) | Confirmação e redefinição chegam a qualquer usuário | 0,5 dia | E-mail recebido por conta de fora da equipe |
| Monitoramento externo (erros e disponibilidade) | Saber do problema antes do usuário | 0,5 dia | Alerta de teste recebido |

### P1: essencial para a 1.0
| Item | Esforço | Aceite |
|---|---|---|
| **Entitlements no servidor** (itens Free = 7; compartilhamentos, transferências, rotações e URLs por plano) | 2–4 dias | Testes de integração: o 8º item no Free é recusado pelo banco; o rebaixamento não bloqueia a leitura |
| Ancorar a cadeia de auditoria fora do banco | 1–2 dias | Uma alteração simulada no banco é detectada contra a âncora |
| Login por passkey | 3–5 dias | Entrar sem senha na web e no Android; MFA equivalente |
| Biometria no Android (Keystore) | 3–5 dias | Desbloqueio com a digital; senha mestra exigida a cada 7 dias |
| Web Risk no lugar do Safe Browsing | 0,5–1 dia | `check-url` usando o Web Risk; teste com URL de teste do Google |
| Atraso progressivo após falhas de desbloqueio | 0,5 dia | Após 5 falhas, espera crescente |
| Documentar a fórmula da postura (página de ajuda) | 0,5 dia | Visível no app |
| Corrigir a mensagem dos 25 MB e mostrar formatos e limites | 0,5 dia | |
| CI com testes, análise de código e segredos | 1–2 dias | O PR é bloqueado se algo falhar |

### P2: diferenciação comercial
| Item | Esforço |
|---|---|
| Cobrança (assinatura, webhook, portal, rebaixamento automático) | 5–10 dias |
| Extensão fase 2: salvar senha, ícone no campo, vários endereços | 5–8 dias |
| Validar os 6 conectores com conta real de baixo risco | 1 dia por conector |
| Arquivos grandes (cifragem em streaming) | 4–6 dias |
| Verificação agendada de vazamentos e aviso por e-mail | 2–4 dias |

### P3: expansão
- Histórico completo de versões e relatórios exportáveis (3–5 dias).
- Passkeys como itens do cofre (5–10 dias).
- iPhone nativo (5–10 dias, mais a conta Apple).
- Autopreenchimento do Android (5–10 dias).
- Argon2id (2–4 dias).
- Rotação da DEK (2–3 dias).

### P4: Micro-PAM e Enterprise
- Organizações e cofres compartilhados.
- RBAC por organização.
- JIT e check-out.
- Identidades não humanas.
- Break-glass.
- SSO e SCIM.
- Auditoria corporativa com exportação e armazenamento imutável (WORM).
- Alertas de acesso anômalo.

Cada item é um projeto de semanas. A ordem será definida com clientes.
