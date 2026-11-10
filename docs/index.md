---
layout: home

hero:
  name: SecureLink Vault
  text: Documentação técnica
  tagline: Cofre zero-knowledge de senhas, segredos e arquivos, com governança no estilo PAM. Arquitetura, segurança, produto e operação num só lugar.
  image:
    src: /logo.svg
    alt: SecureLink Vault
  actions:
    - theme: brand
      text: Guia dos engenheiros
      link: /guide/engineering
    - theme: alt
      text: Arquitetura e diagramas
      link: /architecture/overview
    - theme: alt
      text: Pentest
      link: /SECURITY_TESTING

features:
  - icon: 🏗️
    title: Arquitetura
    details: Componentes, fronteiras de confiança, hierarquia de chaves e os fluxos de entrar, desbloquear, compartilhar, preencher e rotacionar, em diagramas.
    link: /architecture/overview
    linkText: Ver diagramas
  - icon: 🔐
    title: Segurança
    details: Modelo zero-knowledge, avaliação NIST e CSA, alinhamento CyberArk/Idira, recertificação de acesso e os bloqueios para assinantes.
    link: /security/mvp-security-model
    linkText: Ler o modelo
  - icon: 🎯
    title: Segurança ofensiva
    details: Escopo, regras, superfícies de ataque, roteiro de testes com resultado esperado, riscos aceitos e tabela de achados.
    link: /SECURITY_TESTING
    linkText: Abrir o roteiro
  - icon: 🧭
    title: Produto
    details: Roadmap da 1.0, planos Free e Premium, contingência para usuários e as ideias de inovação em implementação.
    link: /product/roadmap-v1
    linkText: Ver o roadmap
  - icon: ⚙️
    title: Operações
    details: Validação do desenvolvimento, produção, portões de lançamento, backup e restauração, custos e quando escalar.
    link: /operations/dev-validation
    linkText: Validar o dev
  - icon: 📚
    title: Referências
    details: NIST, CSA, OWASP, ISO, FIDO, RFCs e o que cada um exige aqui; concorrentes e práticas de mercado; glossário.
    link: /reference/standards
    linkText: Ver padrões
---

## Por onde começar

| Você é | Comece por |
|---|---|
| Engenheiro de solução | [Guia dos engenheiros](/guide/engineering) → [Arquitetura](/architecture/overview) → [Handover técnico](/HANDOVER) |
| Engenheiro de segurança ofensiva | [Guia dos engenheiros](/guide/engineering) → [Pentest](/SECURITY_TESTING) → [Fluxos](/architecture/flows) → [Riscos aceitos](/SECURITY_TESTING#_4-riscos-ja-aceitos-nao-reportar-como-achado-novo) |
| Dono do produto | [Status](/STATUS) → [Ações pendentes](/pending-actions) → [Prontidão](/operations/release-readiness) |

::: warning Repositório público
Esta documentação fica no repositório público do GitHub. **Nunca** escreva aqui senhas, tokens, chaves de API, dados de clientes ou detalhes de achados de pentest ainda não corrigidos. Para isso, use os canais privados descritos no [guia dos engenheiros](/guide/engineering#comunicacao-e-achados).
:::
