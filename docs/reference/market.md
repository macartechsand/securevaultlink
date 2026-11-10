# Concorrentes e práticas de mercado

Resumo prático. A análise completa, com notas por domínio e fontes, está na [revisão comparada](/architecture/security-architecture-review).

| Prática | Quem faz | SecureVault |
|---|---|---|
| Criptografia no cliente, servidor só com texto cifrado | 1Password, Bitwarden, Proton Pass; passkeys do Google | ✅ |
| Segunda chave além da senha mestra (Secret Key) | 1Password | ❌ Decidido como obrigatória (versão 2) |
| KDF memory-hard (Argon2id) | Bitwarden (opcional), Proton | ❌ Planejado |
| Login e desbloqueio por passkey (PRF) | Bitwarden, 1Password | ❌ Planejado |
| Limite de tentativas imposto por hardware ou servidor | Google (enclave: até 10 tentativas), Apple | ✅ PIN com 5 tentativas no servidor |
| Contato de emergência com período de espera | Bitwarden, Apple, Google | ❌ Fase 2 (Premium, 5 contatos, 7 dias) |
| Organizações, coleções, grupos | Bitwarden, 1Password, Keeper | ❌ Plano Business |
| SSO, SCIM, trusted devices, Key Connector | Bitwarden Enterprise | ❌ |
| Secrets Manager para máquinas | Bitwarden, CyberArk Conjur e Secrets Hub | ❌ |
| Rotação automática de credenciais de terceiros | CyberArk CPM (centenas de plataformas) | 🟡 6 conectores em beta |
| Controle duplo, check-out exclusivo, senha de uso único | CyberArk PAM | ❌ Proposta zero-knowledge em [Inovação](/product/innovation) |
| Isolamento e gravação de sessões | CyberArk PSM | ❌ Fora do escopo |
| Analytics de ameaça | CyberArk PTA, Bitwarden Access Intelligence | ❌ |
| Trilha de auditoria à prova de adulteração | CyberArk (cofre), poucos gerenciadores de senha | ✅ Cadeia SHA-256 com âncoras |
| Verificação de vazamentos com k-anonimato | Todos | ✅ |
| Lixeira | Bitwarden, Idira (early access) | ✅ Premium, 14 dias |
| OTP integrado | Bitwarden Premium, 1Password | ✅ Premium |
| Auditorias publicadas, SOC 2, ISO 27001 | Bitwarden, 1Password, CyberArk | ❌ |
| Código aberto | Bitwarden, Proton | 🟡 Repositório público; licença a decidir |

## O que o mercado valoriza para assinantes corporativos
1. **Garantia independente:** pentest com relatório, SOC 2 ou ISO 27001.
2. **SSO e provisionamento:** SCIM, saída imediata de quem sai da empresa.
3. **Cobertura de plataformas:** preenchimento nativo no Android, iOS e desktop.
4. **Administração de equipe:** coleções, grupos, políticas, relatórios.
5. **Recuperação:** contato de emergência, recuperação pelo administrador da empresa (opt-in).
