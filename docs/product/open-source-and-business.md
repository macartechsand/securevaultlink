# Open source, web + mobile e modelo de negócio

> Análise de 2026-11-01. Os preços de concorrentes são referências aproximadas; confira nos sites antes de decidir.

## 1. Dá para ser open source?

Sim, e o modelo combina com o produto. Num cofre de conhecimento zero, a segurança vem da criptografia e não do segredo do código: qualquer pessoa pode auditar que o servidor nunca recebe senha em claro. Bitwarden, Proton Pass e KeePassXC são abertos por isso; o 1Password é fechado e compensa com auditorias externas pagas.

**Licença recomendada: AGPL-3.0** para o app e o backend.
- Quem rodar uma versão modificada como serviço é obrigado a publicar o código. Isso impede que um concorrente pegue o projeto e o venda fechado.
- A **marca** (nome e logo) fica registrada e não é licenciada: forks precisam de outro nome.
- **CLA** (acordo de contribuição) para quem contribuir, mantendo o direito de oferecer licença comercial ou empresarial (*dual licensing*).
- **Open core:** recursos empresariais (SSO/SCIM, dual control, exportação para SIEM) ficam numa pasta com licença comercial, como o Bitwarden faz com `bitwarden_license/`.

### Antes de abrir o repositório
1. Limpar o histórico do Git: `GoogleService-Info.plist`, `coverage/`, `bin/` e o app Expo legado (raiz). O caminho mais limpo é publicar um repositório novo, só com `web-saas/`, `supabase/`, `scripts/` e `docs/`.
2. Varredura de segredos no histórico (gitleaks ou trufflehog) e revisão das referências de projeto Supabase nos documentos.
3. `LICENSE`, `SECURITY.md` (canal de divulgação responsável), `CONTRIBUTING.md` e um README com o modelo de ameaça.
4. Separar a documentação operacional da sua instalação (contatos, envelope, procedimentos internos) da documentação pública.
5. Pentest externo antes de divulgar amplamente: código aberto atrai revisão, boa e ruim.

## 2. Web e mobile com o mesmo código

| Etapa | O que é | Situação |
|---|---|---|
| **PWA** | O site instala como app (ícone, tela cheia, navegação inferior no celular) | **Pronto** (manifesto, ícones, layout mobile) |
| **Capacitor** | Empacota o mesmo React como app iOS/Android nas lojas; WebCrypto funciona igual | Próximo passo. Adiciona desbloqueio por biometria com a chave no Keychain/Keystore |
| **Autopreenchimento nativo** | iOS AutoFill Credential Provider e Android Autofill Service (código nativo pequeno, lendo o cofre cifrado) | Necessário para competir com o 1Password |
| **Extensão de navegador** (Manifest V3) | Preenche e salva logins no Chrome, Edge e Firefox | Necessária para competir; reaproveita o módulo de criptografia |

Recomendação: **não** retomar o app Expo da raiz (usa Firebase e outra criptografia). Uma base só (React + WebCrypto) em web, PWA, Capacitor e extensão evita manter duas implementações criptográficas.

## 3. Como ganhar dinheiro sendo gratuito e aberto

O código é gratuito; o que se vende é **conveniência, operação e garantias**.

| Fonte | Para quem | Referência de mercado |
|---|---|---|
| **Nuvem hospedada (SaaS)**: Free com limites + Premium | Pessoas que não querem hospedar nada | Bitwarden Premium ~US$10/ano; 1Password ~US$3–4/mês |
| **Família** (até 5–6 pessoas, cofres compartilhados) | Casas | 1Password Families ~US$5/mês |
| **Times e empresas** por usuário/mês: papéis, dual control, recertificação, auditoria encadeada, SSO/SCIM, políticas | PMEs e TI | Bitwarden Teams/Enterprise ~US$4–6; 1Password Business ~US$8 |
| **Licença self-host empresarial** (open core) | Empresas que exigem rodar na própria nuvem | Assinatura anual |
| **Suporte, SLA, implantação e conformidade** (LGPD, relatórios para auditoria) | Empresas reguladas | Contrato |
| Patrocínio (GitHub Sponsors, Open Collective) | Comunidade | Complementar, não sustenta sozinho |

Sugestão de preços para o Brasil (validar com os usuários do beta): Premium **R$ 9–12/mês**, Família **R$ 19–25/mês**, Business **R$ 20–30/usuário/mês**. Cobrança por Pix e cartão; nas lojas de apps, a assinatura dentro do app paga 15–30% de taxa, então o ideal é assinar pela web.

## 4. Posicionamento contra o 1Password

O 1Password é forte em experiência de uso (extensão, autopreenchimento, apps nativos). Competir de frente nisso, sozinho, é difícil. O diferencial deste produto está em outro lugar:

1. **Auditável:** código aberto + conhecimento zero. O 1Password pede confiança; aqui dá para verificar.
2. **Governança de PAM para PMEs:** rotação de credenciais (AWS, GitHub, GitLab, Microsoft, Cloudflare), papéis privilegiados temporários com justificativa, recertificação de acesso, log de auditoria encadeado e verificável, aba de conformidade. É o que CyberArk e Idira oferecem, a uma fração do custo e da complexidade. O 1Password não rotaciona credenciais.
3. **Arquivos e transferências cifrados de ponta a ponta** no mesmo cofre.
4. **Brasil primeiro:** português, LGPD, dados em São Paulo (`sa-east-1`), Pix, preço em reais e suporte local.

**Frase de posicionamento:** "o cofre de senhas com governança de nível corporativo, auditável por qualquer pessoa, pelo preço de um gerenciador de senhas."

### O que falta para disputar clientes do 1Password (por ordem)
1. Extensão de navegador com autopreenchimento.
2. Apps nas lojas (Capacitor) com biometria e autopreenchimento nativo.
3. Passkeys (WebAuthn) como item do cofre e como fator de login.
4. Importação: o CSV de Chrome/Edge, Firefox, Bitwarden, 1Password e LastPass já existe; faltam o formato nativo do 1Password (`.1pux`) e testes com exportações reais.
5. Pentest externo publicado; depois ISO 27001 ou SOC 2 para vender a empresas.
6. Organizações com cofres compartilhados por equipe (MVP 4).
