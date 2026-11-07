# Plano de contingência para usuários

Versão de **2026-11-06** · Fase 1 implementada no `dev` · Fases 2 e 3 planejadas

O que o usuário faz, e o que o produto oferece, quando algo dá errado: senha mestra esquecida, autenticador perdido, aparelho roubado, conta invadida, falecimento ou o SecureLink fora do ar.

Relacionados: [`../security/security-assurance.md`](../security/security-assurance.md) (arquitetura-alvo, seção 8) e [`../security/mvp-security-model.md`](../security/mvp-security-model.md).

---

## 1. Princípio

O cofre é **zero-knowledge**: só as chaves do usuário abrem os dados. Por isso **o suporte não consegue recuperar um cofre**, e isso é uma garantia de segurança, não uma falha. Toda saída de contingência segue uma de duas regras:
1. **O usuário se preparou antes:** chave de recuperação, backup exportado, contato de emergência, aparelho confiável.
2. **Uma pessoa que o usuário escolheu ajuda**, sem que o servidor jamais tenha a chave do cofre.

Nenhuma saída pode dar ao SecureLink, ao administrador ou ao suporte um jeito de ler o cofre.

## 2. Cenários

| Cenário | Hoje | Fase 1 (feita) | Fase 2 (com e-mail próprio) | Fase 3 (criptografia v2 e apps) |
|---|---|---|---|---|
| **Esqueci a senha mestra** | Chave de recuperação (opcional) ou recomeçar o cofre | Central de contingência; **teste da chave** sem alterar nada | **Contato de emergência**; aviso por e-mail de cada recuperação | **Aparelho confiável** redefine a senha mestra |
| Esqueci a senha da conta | Redefinição por e-mail; no beta, link do administrador | Guia na central | E-mail próprio (Resend) | Igual |
| Perdi o autenticador (MFA) | Administrador redefine | Guia na central; aviso para fazer backup do autenticador | **Passkey** como segundo fator; **roteiro de verificação de identidade** do suporte | Igual |
| Perdi a Secret Key (versão 2) | Não se aplica | Não se aplica | Não se aplica | Kit de Emergência; QR code de um aparelho conectado; chave de recuperação |
| Aparelho perdido ou roubado | Encerrar a sessão remotamente | Guia na central | Aviso por e-mail de novo login | Limpeza remota da cópia local; regra dos 30 dias; **girar a chave do cofre** |
| Conta invadida | Encerrar sessões, trocar senhas, ver Atividade | Guia na central; **modo emergência (Premium), feito em 2026-11-06** | Aviso por e-mail | Girar a chave do cofre |
| Falecimento ou incapacidade | Nada | Nada | **Contato de emergência** com período de espera | Igual |
| SecureLink fora do ar ou encerrado | Exportação cifrada | **Leitor offline** do backup | Compromisso nos Termos: 90 dias de aviso para exportar | Cópia local nos apps (30 dias com biometria, depois só senha mestra) |
| Item apagado por engano | Histórico de senhas do item | **Lixeira de 14 dias (Premium), feita em 2026-11-06** | Igual | Igual |

## 3. Fase 1: o que foi implementado (2026-11-06)

Em **Configurações → Contingência ("Se algo der errado")**:
- **Lista de verificação** com estado Pronto, Atenção ou Falta:
  - chave de recuperação ativada;
  - chave testada nos últimos 180 dias;
  - verificação em duas etapas ativa;
  - backup cifrado nos últimos 90 dias;
  - leitor offline salvo (recomendado, não obrigatório).
- **Testar a chave de recuperação:** confere se a chave guardada abre o cofre, **sem alterar nada**. É o "simulado" que garante que a chave está no lugar certo antes do dia em que for preciso.
- **"O que fazer se…":** passos curtos para 5 cenários (senha mestra, senha da conta, autenticador, conta invadida, serviço fora do ar).

Em **Exportar e importar**:
- **Leitor offline:** um arquivo HTML único que abre o backup cifrado **sem internet e sem o SecureLink**. A própria página bloqueia a rede (`connect-src 'none'`) e mostra o conteúdo só como texto. As senhas ficam ocultas até clicar em "Mostrar".

**Privacidade:** a central guarda no aparelho só **datas** (último teste da chave, última exportação, leitor salvo). Nenhuma chave nem conteúdo.

**Testes:**
- unitários: `src/lib/contingency.test.ts` e `src/lib/offlineReader.test.ts`. O leitor abre uma exportação real e recusa senha errada, arquivo adulterado e parâmetros fracos;
- verificação no Edge real (2026-11-06) com o código minificado como no build de produção: abre o backup, recusa senha errada, não executa HTML vindo do backup e não faz nenhuma requisição de rede.

## 4. Fase 2: contato de emergência (desenho)

Inspirado no "Emergency Access" do Bitwarden e no "Recovery Contact" da Apple.

**Como funciona para o usuário:**
1. Ana escolhe Bruno, outro usuário do SecureLink, como contato de emergência, com **período de espera** (padrão de 7 dias, ajustável de 1 a 30).
2. Bruno aceita.
3. No dia em que precisar, Bruno **pede acesso**. Ana recebe aviso por e-mail e no app e pode **recusar** durante o período de espera.
4. Se Ana não recusar até o fim do prazo, ou se aprovar antes, Bruno passa a **ver** o cofre de Ana (somente leitura, com exportação).

**Criptografia, sem dar a chave ao servidor:**
- Ana cifra a chave do cofre (DEK) para a **chave pública de Bruno**. É o mesmo ECDH P-256 + HKDF + AES-GCM já usado nos compartilhamentos. O servidor guarda só esse pacote cifrado.
- A tabela `emergency_grants` registra `owner_id`, `grantee_id`, `sealed_dek`, `wait_days`, o estado (`invited`, `accepted`, `requested`, `approved`, `rejected`) e as datas.
- A **RLS** só deixa Bruno ler o `sealed_dek` quando o estado é `approved`, ou quando é `requested` e o período de espera terminou. Ana pode apagar a concessão a qualquer momento.
- Toda etapa gera evento na trilha de auditoria.
- Quando a chave do cofre for girada (versão 2), as concessões são recifradas automaticamente.

**Limite aceito:** quem garante o período de espera é o servidor, como no Bitwarden. Um invasor com controle total do banco poderia antecipar a liberação, **mas só para Bruno**: o pacote continua cifrado para a chave de Bruno.

**Pré-requisito:** e-mail próprio (Resend, portão 2). Sem aviso por e-mail, Ana pode não ver o pedido a tempo de recusar, e o período de espera perde o sentido.

**Fora do escopo inicial:** "assumir a conta" (Bruno redefinir a senha mestra de Ana). Só leitura cobre o caso de falecimento ou incapacidade com menos risco.

## 5. Fase 2: roteiro do suporte para redefinir o MFA ou dar acesso à conta

O administrador **nunca** abre o cofre. Ele só restaura o **acesso à conta**, e o cofre continua exigindo a senha mestra. Mesmo assim, redefinir o MFA de uma conta é alvo clássico de engenharia social. Por isso:
1. O pedido vem do e-mail da conta **e** é confirmado pelo canal combinado no convite (telefone ou mensagem), nunca só por um deles.
2. O administrador pergunta algo que só o titular sabe e que não está no app: a data aproximada do convite, por exemplo.
3. **Espera de 24 horas** antes de executar, com aviso ao e-mail da conta. É o tempo para o titular verdadeiro contestar.
4. Executa no painel (Identidade e acesso → Redefinir MFA). A ação já fica na trilha de auditoria.
5. Na próxima entrada, o usuário cadastra o MFA de novo.

**Mensagem padrão para "esqueci a senha mestra e não tenho a chave":**
> "Seu cofre é cifrado só com as suas chaves; nem nós conseguimos abri-lo. Se você tem um backup exportado, ele abre com a senha da exportação, inclusive pelo leitor offline. Se não, dá para recomeçar o cofre na mesma conta. Os dados antigos não podem ser recuperados por ninguém."

## 6. Fase 3: com a criptografia versão 2 e os apps

- **Kit de Emergência** (PDF gerado no aparelho na criação da conta) com e-mail, Secret Key e espaço para a senha mestra. O usuário confirma que guardou digitando os 4 últimos caracteres da Secret Key. Sozinho, o kit não abre o cofre; ele precisa da senha mestra.
- **Aparelho confiável:** quem esqueceu a senha mestra mas tem um celular ou computador que abre o cofre por biometria pode definir uma nova senha mestra nele. Exige:
  - autenticação da conta com MFA na hora;
  - aviso imediato por e-mail e em todos os aparelhos;
  - registro na auditoria;
  - que os outros aparelhos peçam a nova senha.
- **Aparelho perdido:** encerrar a sessão apaga a cópia local na próxima conexão. Sem conexão, depois de 30 dias a biometria deixa de abrir o cofre e passa a exigir a senha mestra (decisão de 2026-11-06). Para casos graves, o botão **girar a chave do cofre** recifra as chaves dos itens, e a cópia que ficou no aparelho perdido deixa de servir para os dados novos.
- **Leitor offline embutido** no app de desktop (Tauri).

## 7. Como medir
- **Percentual de usuários "Preparado"** na central. A tela de postura e o relatório do administrador podem mostrar esse número sem conteúdo (só contagens).
- Pedidos ao suporte por cenário, para ver o que mais acontece.
- Tempo entre o pedido e a solução nos casos de MFA.

## 8. Decisões do dono (2026-11-06)
1. **Contato de emergência:** espera de **7 dias**, até **5 contatos**, **só no Premium**. Continua na fase 2 (depende do e-mail próprio).
2. **Lixeira de 14 dias**, só no Premium: **implementada**. No Free, excluir continua definitivo.
3. **Modo emergência**, só no Premium: **implementado**. Encerra as outras sessões, remove o PIN de todos os aparelhos e guia a troca da senha da conta e da senha mestra. No Free, as sessões continuam podendo ser encerradas uma a uma.
4. Também entraram: **PIN** para desbloquear (todos os planos), **onde e quando a senha foi usada** e **OTP de sistemas externos** (Premium).
