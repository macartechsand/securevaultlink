# Recertificação de acesso aos itens do cofre

Data: 2026-11-02 · Ambiente verificado: desenvolvimento (`sueemdqyhwnmbqokpefz`), mesmas migrations e funções que irão para a produção · Resultado dos testes: **132/132**

**Pergunta certificada:** além do dono de um item (credencial, nota, arquivo) e de quem recebeu um compartilhamento ativo, alguém consegue acessar o conteúdo?

**Resposta:** **não**, por nenhum caminho do sistema. Nem o administrador do app, nem quem opera o Supabase, nem quem obtiver uma cópia do banco ou de um backup lê o conteúdo: ele é cifrado no navegador e a chave nunca sai de lá. As exceções e os riscos residuais estão na seção 4, todos fora do caminho normal e com mitigação.

---

## 1. Método

1. **Revisão das regras de acesso do banco:** as 18 migrations, as políticas RLS e as permissões por coluna de cada tabela com conteúdo (`vault_entries`, `vault_profiles`, `user_keys`, `vault_folders`, `item_shares`, `vault_files`, `file_shares`, `transfers`, `storage.objects`).
2. **Revisão das funções privilegiadas** (`SECURITY DEFINER`): nenhuma devolve conteúdo cifrado, chaves embrulhadas ou chaves seladas. As únicas que devolvem chaves devolvem **chaves públicas**, e só para quem tem direito (`find_share_recipient`, `item_share_recipient_keys`, esta só para o dono).
3. **Revisão das Edge Functions com service role:** só `transfer` lê material de arquivo, e só para links de transferência (o conteúdo é cifrado e a chave está no `#` do link, que nunca chega ao servidor). `admin`, `account`, `cleanup-files` e `storage-r2` não leem conteúdo. `rotate` é a exceção documentada (seção 4).
4. **Revisão do navegador:** nada do cofre é gravado em `localStorage`/IndexedDB (só a preferência de tema); a chave do cofre fica só na memória; os relatos de erro são higienizados e nunca recebem dados do cofre.
5. **Testes automatizados** contra o projeto real (duas contas descartáveis, A e B), listados na seção 3.

---

## 2. Matriz de acesso

| Quem | Conteúdo em claro | Conteúdo cifrado | Metadados |
|---|---|---|---|
| **Dono do item** | ✅ | ✅ | ✅ |
| **Destinatário ativo, "visualizar"** | ✅ só daquele item (e anexos, só leitura) | ✅ daquele item | Dono, permissão, validade |
| **Destinatário ativo, "editar"** | ✅ daquele item; pode alterar só o conteúdo | ✅ | Idem |
| Destinatário cujo compartilhamento **expirou** | ❌ desde o instante da expiração, mesmo antes da limpeza | ❌ | ❌ |
| Destinatário **revogado** | ❌ e a chave do item é trocada: a cópia antiga da chave não abre versões futuras | ❌ | ❌ |
| Outro usuário qualquer | ❌ | ❌ | ❌ (nem sabe que o item existe) |
| Visitante sem login | ❌ | ❌ | ❌ |
| **Administrador do app** (painel) | ❌ | ❌ (as funções do painel não devolvem conteúdo) | Contagens, e-mails, planos, eventos |
| **Operador da plataforma** (painel do Supabase, service role) | ❌ não tem as chaves | ✅ | ✅ |
| Funcionários do Supabase/AWS | ❌ | Possível (infraestrutura) | Possível |
| Quem obtiver o banco ou um backup | ❌ precisa da senha mestra de cada usuário; ataque offline contra PBKDF2 de 600 mil iterações | ✅ | ✅ |

O que protege o conteúdo em claro é a **criptografia no navegador**. As regras de acesso protegem também o conteúdo cifrado e os metadados, como segunda camada.

---

## 3. Controles e evidências

| Controle | Implementação | Prova (teste automatizado) |
|---|---|---|
| Isolamento por usuário | RLS `auth.uid() = user_id` em todas as tabelas do cofre; `user_id` não pode ser alterado (permissão por coluna) | `rls.integration`: outro usuário não lê, altera nem apaga; não insere como outro; não reatribui; anônimo não acessa nada; perfis isolados |
| Compartilhamento só pelo dono | `item_shares_insert` exige ser dono do item; `owner_id` não pode ser forjado | `items.integration`: "only v2 items can be shared…", **"a recipient cannot re-share the item…"** |
| Destinatário vê só a própria linha de compartilhamento | `item_shares_select` | **"a recipient cannot re-share the item, see other shares or reach the owner keys"** |
| Chaves do dono inacessíveis | `vault_profiles` e `user_keys` só do dono; `item_share_recipient_keys` só para o dono | Mesmo teste acima; `rls.integration` "profiles are isolated" |
| Permissão "visualizar" não grava | Política de update só para "editar" | "view share: recipient reads but cannot write or delete" |
| "Editar" não toca a chave nem o histórico do dono | Gatilho `guard_shared_entry_update` | "edit share: recipient may change the content but never the owner's key or history" |
| Destinatário não aumenta a própria permissão | Update de `item_shares` só pelo dono | "view share…" (escalada recusada) |
| **Expiração imediata** | `is_item_recipient`/`can_edit_item` comparam a validade com o relógio do servidor em cada consulta | **"an expired share stops access at the expiry time, before any cleanup runs"** |
| Revogação com troca de chave | `revokeItemShare` gera nova chave do item, recifra e re-sela só para quem continua | `core.integration` "connects users: view → edit → revoke with key rotation" |
| Histórico de senhas só do dono | Cifrado com a chave pessoal do dono (não com a do item) | `core.integration` "rotation keeps an encrypted password history…" |
| Arquivos e anexos | RLS em `vault_files` e políticas do Storage por pasta do dono ou compartilhamento ativo; R2 só com URL assinada após checagem RLS | `files.integration`: "another user cannot read, download, overwrite or delete it", "sharing grants the recipient access to that file only, and revoking removes it" |
| E-mails do compartilhamento não forjáveis | Preenchidos pelo servidor a partir da conta | "view share…" (confere `recipient_email`) |
| Verificação do destinatário | Impressão digital da chave pública exibida antes de compartilhar, para comparar com a pessoa | Interface (ItemShareDialog, FilesView) |
| MFA | Políticas restritivas `aal2` em todas as tabelas do cofre para quem tem MFA; MFA obrigatório para todos (configuração) | `iam.integration` "reports the MFA policy for the caller" |
| Admin não lê cofres | Funções do painel só retornam metadados; usuários comuns não usam funções de admin | `iam.integration` "regular users cannot use any admin function…" |
| Auditoria | Eventos de compartilhar, receber, revogar, baixar; imutável e encadeada | `files.integration` "audit log…append-only"; validação da migration `20261102000000` |

---

## 4. Riscos residuais e mitigação

| # | Risco | Gravidade | Mitigação |
|---|---|---|---|
| 1 | **Código do site adulterado** (conta Netlify ou GitHub comprometida): um JavaScript malicioso capturaria a senha mestra na digitação. É o maior risco de qualquer cofre web | Alta | MFA com chave física no Netlify e no GitHub; só você publica; proteção da branch `master`; CSP sem scripts de terceiros. Futuro: publicar o hash de cada versão |
| 2 | **Rotação automática**: a credencial passa pela função `rotate` por alguns segundos, sem ser gravada | Média | **Interruptor global novo** (migration `20261103000000`): em instalações novas nasce **desligado**. Com ele desligado, o servidor nunca vê nenhuma credencial. Ligue só após validar os conectores, e cada item ainda exige consentimento |
| 3 | **Troca da chave pública de um usuário** por quem controla o banco, para interceptar compartilhamentos novos | Média | Compare a impressão digital antes de compartilhar. Residual: ao revogar, a re-selagem para os demais usa as chaves do servidor sem nova comparação |
| 4 | O destinatário pode copiar o que viu enquanto tinha acesso | Inerente | Compartilhe com validade curta e "visualizar"; após revogar, troque a senha na origem (a rotação ajuda) |
| 5 | Expiração **não** troca a chave do item (só a revogação troca) | Baixa | O acesso já é bloqueado pelo servidor na hora. Para segredos críticos, revogue manualmente em vez de deixar expirar |
| 6 | Senha mestra fraca + vazamento do banco ou backup | Média | Mínimo de 12 caracteres e recusa de senhas fracas; oriente frases longas no onboarding; backup externo cifrado de novo |
| 7 | Metadados visíveis ao operador (e-mails, quem compartilha com quem, datas, tamanhos) | Baixa | Acesso ao painel do Supabase só por você, com MFA e Network Restrictions |
| 8 | Descoberta de e-mails cadastrados pela busca de destinatário (e-mail exato, usuário logado com MFA) | Baixa | Beta fechado por convite; eventos auditados |
| 9 | Links de transferência: qualquer pessoa com o link completo baixa o arquivo | Por projeto | Validade de até 7 dias, até 20 downloads, senha opcional, revogação a qualquer momento |
| 10 | Administrador redefine senha da conta ou MFA de um usuário | Baixa | Não dá acesso ao cofre (exige a senha mestra); fica registrado (`admin.*`) |

---

## 5. Ações para a produção

1. Aplicar `20261102000000` e `20261103000000` e manter **Rotação automática: desligada** (Administração → Beta e limites) até validar cada conector.
2. MFA com chave física em Netlify, GitHub, Supabase e Cloudflare; proteger a branch `master`.
3. Orientar no onboarding: senha mestra em frase longa, comparar a impressão digital ao compartilhar, preferir validade curta.
4. Repetir esta recertificação **a cada mudança em migrations, funções ou compartilhamento**, e no mínimo a cada 3 meses: rodar `npm test` contra o desenvolvimento e revisar a matriz da seção 2.
