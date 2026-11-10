# Validação do desenvolvimento antes da versão 1 beta

Versão de **2026-11-14** · Ambiente: https://securelinkvaultdev.netlify.app (Supabase `sueemdqyhwnmbqokpefz`) · Código: `dev`

Roteiro para o dono validar o desenvolvimento. Com tudo aprovado, o código segue para a produção e para a preparação do lançamento (seção 5). Cada caso diz o que fazer e o **resultado esperado**; qualquer diferença vira um achado na seção 6.

---

## 1. Preparação (uma vez)

1. **SQL Editor do desenvolvimento:** rodar `supabase/migrations/20261106000000_trash_usage_pin.sql` (lixeira, registro de uso, PIN e evento do modo emergência). Sem ela o app abre, mas a lixeira, o PIN e o registro de uso não funcionam.
2. **Cron da lixeira:** a migration agenda `purge-trash-daily` se o `pg_cron` estiver ativo. Conferir em Database → Cron Jobs. Sem cron, o próprio app apaga os itens vencidos ao abrir o cofre.
3. **Recriar `web-saas/.env.test.local`** com as contas descartáveis A e B e avisar o Claude: ele roda os 53 testes de integração e os de ponta a ponta da extensão.
4. **Duas contas de teste suas:**
   - **Free:** convite sem Premium;
   - **Premium:** Administração → Licenças → Premium por 30 dias.

   Use só dados inventados.
5. **Extensão de desenvolvimento:** `cd web-saas` → `npm run build:ext` → `edge://extensions` → remover a SecureLink → **Carregar sem compactação** → `web-saas\dist-extension`.

## 2. Funcionalidades novas

### 2.1 Lixeira (Premium, 14 dias)
| # | Passo | Esperado |
|---|---|---|
| L1 | Premium: excluir um item | Pergunta "Mover para a lixeira?"; o item some do cofre e aparece em **Lixeira** com "apagado para sempre em 14 dias" |
| L2 | Premium: restaurar | Volta ao cofre com todos os dados |
| L3 | Item compartilhado com a conta Free, depois movido para a lixeira | Some para a conta Free; volta ao ser restaurado |
| L4 | Premium: "Excluir" e "Esvaziar lixeira" | Apaga para sempre; pergunta sobre os anexos |
| L5 | Free: excluir um item | Pergunta "Esta ação não pode ser desfeita" e apaga na hora; a Lixeira explica que é Premium |

### 2.2 Onde e quando a senha foi usada (Premium)
| # | Passo | Esperado |
|---|---|---|
| U1 | Premium: copiar a senha no cofre e abrir o item | "Último uso: copiada há poucos instantes · app web (navegador · sistema)" |
| U2 | Premium: preencher pela extensão num site | No app: "preenchida em `<site>` há … · extensão (…)" |
| U3 | Free: abrir um item | "Onde e quando a senha foi usada: recurso Premium"; nada é gravado |

### 2.3 OTP de sistemas externos (Premium)
| # | Passo | Esperado |
|---|---|---|
| O1 | Premium: num login, colar a chave de configuração de um site de teste (ou `otpauth://...`) e salvar | Aparece o código de 6 dígitos com os segundos restantes; muda a cada 30 s e bate com o app autenticador |
| O2 | "Copiar código" | Copia; a área de transferência limpa em 30 s |
| O3 | Extensão: botão de escudo ao lado do login | "Código copiado" |
| O4 | Free: abrir um login sem OTP | Campo OTP mostra "Disponível no Premium" |
| O5 | Rebaixar a conta Premium com OTP para Free | O código continua aparecendo (dados nunca bloqueados) |

### 2.4 PIN (todos os planos)
| # | Passo | Esperado |
|---|---|---|
| P1 | Configurações → PIN → ativar com a senha mestra e um PIN de 6 dígitos | "PIN ativado"; mostra a validade de 14 dias |
| P2 | PINs fracos (`123456`, `000000`) | Recusados com explicação |
| P3 | Bloquear o cofre | A tela pede o **PIN**; com o PIN certo, abre |
| P4 | PIN errado 4 vezes | "PIN incorreto. N tentativa(s)…" |
| P5 | Errar a 5ª vez | O PIN é desativado; a tela volta para a senha mestra |
| P6 | Outro navegador | Não oferece PIN (cada aparelho tem o seu) |

### 2.5 Modo emergência (Premium)
| # | Passo | Esperado |
|---|---|---|
| E1 | Entrar na conta Premium em dois navegadores; no primeiro, Configurações → **Ativar modo emergência** | O segundo navegador sai em até 1 h (ao renovar o token) ou na próxima ação; o PIN some dos dois |
| E2 | Trocar a senha da conta pelo próprio cartão | "Senha da conta trocada" |
| E3 | Free | O cartão explica que é Premium e aponta para "Sessões ativas" |

### 2.6 Rotação (Premium)
| # | Passo | Esperado |
|---|---|---|
| R1 | Free: botão de rotação no cofre ou na fila | Mensagem "recurso do plano Premium"; nenhuma aba aberta |
| R2 | Free: "Troca programada" num item novo | Bloqueado com explicação; prazos por risco continuam aparecendo |
| R3 | Premium: rotação assistida | Funciona como antes |
| R4 | Premium: rotação automática (função `rotate` atualizada no desenvolvimento) | Funciona; com conta Free, a função responde "faz parte do plano Premium" |

### 2.7 Contingência (de 2026-11-06)
| # | Passo | Esperado |
|---|---|---|
| C1 | Configurações → "Se algo der errado" | Lista com o estado de cada item |
| C2 | Testar a chave de recuperação certa e uma errada | "abre este cofre" e "não abre este cofre"; nada muda |
| C3 | Baixar o leitor offline, exportar um backup, abrir o leitor **sem internet** | Abre o backup com a senha da exportação |

### 2.9 Login, vínculo de contas e inovação fase 2 (2026-11-14)
Antes, no SQL Editor do desenvolvimento e nesta ordem, rodar as migrations:
1. `20261111000000_login_methods.sql`;
2. `20261112000000_jit_dual_control.sql`;
3. `20261113000000_organizations.sql`;
4. `20261114000000_client_rotation_event.sql`.

Em Authentication → Sign In / Providers, ligar **Allow manual linking**. Os casos L1–L8 estão em [login-experience](../product/login-experience.md).

| # | Passo | Esperado |
|---|---|---|
| L1 | Admin gera link de convite → abrir → fechar a aba antes de salvar a senha → abrir o app de novo | A tela "Defina a senha da sua conta" volta |
| L2 | Salvar a senha do convite → entrar no APK novo com e-mail e senha | Entra |
| L3 | "Criar conta" com um e-mail já convidado | "Este e-mail já tem conta…" |
| L4 | Entrar com a senha mestra no lugar da senha da conta | Erro, mais o painel "Não consegue entrar?" |
| L5 | Configurações → Formas de entrar → Conectar Google | Volta conectado; depois "Continuar com Google" abre o **mesmo** cofre |
| L6 | Admin → IAM: conta convidada que nunca salvou senha | Selo "Sem senha da conta" |
| D1 | Premium: em "Quem pode pedir", adicionar um aprovador (a pessoa precisa ter o item compartilhado com ela) e exigir 2 aprovações | O pedido mostra "1 de 2" depois da primeira aprovação; só libera na segunda |
| D2 | Aprovador recusa | O pedido fica recusado (um veto basta) |
| D3 | Item com "exigir troca após o uso": encerrar o acesso | Aparece em "Senhas para trocar"; some ao salvar uma senha nova |
| O1 | Premium: Empresa → criar organização → convidar o e-mail da conta Free | A conta Free vê o convite com o texto de consentimento |
| O2 | Conta Free aceita | O painel do dono mostra a nota e as contagens dela, nunca nomes de itens |
| O3 | Conta Free → Atividade | Aparece "painel consultado" (`org.risk_viewed`) |
| R1 | Item GitLab (gitlab.com) com rotação de um clique → Trocar | Troca feita no navegador; a auditoria mostra `item.rotated_on_device`; a função `rotate` **não** é chamada (aba Rede) |
| A1 | Broker de IA (ver [agent-broker](../product/agent-broker.md)): conta robô elegível, pedido, aprovação, `run_with_credential` com `node -e "console.log(process.env.SV_PASSWORD)"` | Saída `[REDACTED]`; acesso encerrado |

### 2.8 Inovação (2026-11-10)
Antes: rodar `supabase/migrations/20261110000000_jit_access.sql` no SQL Editor do desenvolvimento.

| # | Passo | Esperado |
|---|---|---|
| J1 | Premium: Acesso temporário → "Quem pode pedir acesso": escolher um login, o e-mail da conta Free, máximo 1 h | "Essa pessoa já pode pedir acesso" |
| J2 | Conta Free: Acesso temporário | Vê o título, o usuário e o site do item, **sem a senha** |
| J3 | Conta Free: pedir 30 min com justificativa | "Aguardando aprovação"; o item **não** aparece no cofre |
| J4 | Premium: "Pedidos pendentes" | Mostra quem pediu, por quanto tempo e a justificativa; Aprovar |
| J5 | Conta Free: "Abrir no cofre" | O item aparece em compartilhados comigo, **só leitura**, com prazo |
| J6 | Premium: "Encerrar agora" (ou esperar o prazo) | O item some da conta Free; a auditoria registra pedido, aprovação e fim |
| J7 | Premium: remover a pessoa de "Quem pode pedir" com um acesso ativo | O acesso termina na hora |
| B1 | Segredo → tipo "Certificado digital A1", validade daqui a 10 dias | Aparece em Rotação com o prazo e na Visão geral ("validade vencendo") |
| B2 | Tipos Chave Pix, gov.br, credencial fiscal, procuração | Rótulos e dicas próprios de cada tipo |
| V1 | Premium: Rotação → "Relatório de evidências (CSV)" com "Trocar títulos por códigos" | Arquivo abre no Excel; sem senhas, URLs ou notas; títulos como ITEM-001 |
| T1 | Backup (`scripts/backup/backup.mjs`) | Grava `audit-anchor-<n>.json` e `.ots`; mensagem "timestamped by N public calendar(s)" |

## 3. Regressão (o que já existia)
- Entrar (e-mail, Google, GitHub), MFA, desbloquear, criar, editar e compartilhar itens, arquivos, transferências, exportar e importar.
- Postura, vazamentos, prazos de troca e notificação.
- Administração: convites, licenças, excluir conta, auditoria ("Verificar log de auditoria").
- Extensão: menu no campo, salvar e atualizar senha, gerador.
- Celular: app Android (build de debug) ou o site no navegador do celular.

## 4. Critérios para aprovar o desenvolvimento
1. Todos os casos das seções 2 e 3 como esperado, ou com achados baixos registrados.
2. Suíte completa verde **com** integração (exige o `.env.test.local`) e os testes de ponta a ponta da extensão.
3. Pentest do dono ([`../SECURITY_TESTING.md`](../SECURITY_TESTING.md)) sem achado crítico ou alto em aberto.

Com isso: PR `dev` → `master`, migration `20261106` na produção (pelo dono), funções `admin`, `account` e `rotate`, `node scripts/deploy-prod-site.mjs` e `node scripts/build-prod-extension.mjs`.

## 5. Depois da validação: o que falta para a versão 1 beta nas lojas e para assinantes

Esta lista deixa claro o que **ainda não existe**, para planejar o lançamento sem surpresa.

| Frente | Falta | Referência |
|---|---|---|
| **Cobrança** | Não existe. Precisa de gateway (cartão e Pix), assinatura, renovação, falha de pagamento, cancelamento e rebaixamento automáticos ligados ao plano | [`release-readiness.md`](release-readiness.md), portão 2 |
| **Garantia de segurança** | Bloqueios B1 a B10: Supabase Pro e restauração testada, proteção do operador, senha da conta conforme o NIST, passkey, plano de incidentes, alertas, pentest, publicação pela CI, documentos legais, CAIQ | [`../security/security-assurance.md`](../security/security-assurance.md), seção 7 |
| **Legal** | Termos de Uso, Política de Privacidade, encarregado de dados, CNPJ e nota fiscal | Portão 2 |
| **Play Store** | Conta de desenvolvedor, ficha da loja, formulário de segurança de dados, classificação etária, política de privacidade publicada, AAB assinado, teste fechado com 12 testadores por 14 dias (exigência atual do Google para contas pessoais novas) | [`../product/mobile-app.md`](../product/mobile-app.md) |
| **App Store (iPhone)** | **O app iOS ainda não existe.** Precisa de Mac ou build na nuvem, conta Apple Developer, Capacitor iOS, TestFlight e "Nutrition Labels". Pagamentos dentro do app seguem as regras da Apple | [`../product/mobile-app.md`](../product/mobile-app.md) |
| **Lojas de extensão** | Chrome Web Store e Edge Add-ons: conta, ficha, justificativa da permissão "todos os sites", política de privacidade | [`../product/browser-extension.md`](../product/browser-extension.md) |
| **Funcionalidade** | Matriz de aparelhos, monitoramento, canal de suporte para o Premium | Portão 3 |
| **Fase 2 do plano** | Contato de emergência e e-mail próprio (Resend) | [`../product/contingency-plan.md`](../product/contingency-plan.md) |

**Sugestão de ordem:**
1. Validar o desenvolvimento (este roteiro).
2. Produção com o código validado; teste com seus usuários e pentest.
3. Em paralelo: cobrança, documentos legais e bloqueios B2 e B5.
4. Supabase Pro e restauração testada (B1).
5. Play Store em **teste fechado** e extensão nas lojas como **beta**.
6. Abertura para assinantes.
7. iOS em seguida.

## 6. Achados da validação

| # | Data | Caso | O que aconteceu | Severidade | Estado |
|---|---|---|---|---|---|
| | | | | | |
