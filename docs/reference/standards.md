# Padrões e frameworks

Para cada referência: o que é, o que ela exige **neste sistema** e onde está a evidência. Estado: ✅ atende · 🟡 parcial · ❌ falta.

## Governança e gestão de risco
| Referência | O que é | Aplicação no SecureVault | Estado | Evidência |
|---|---|---|---|---|
| [NIST CSF 2.0](https://www.nist.gov/cyberframework) | Funções Governar, Identificar, Proteger, Detectar, Responder, Recuperar | Avaliação completa por função | 🟡 | [Garantia](/security/security-assurance), seção 4 |
| [CSA CCM v4.1](https://cloudsecurityalliance.org/artifacts/cloud-controls-matrix-v4-1) e CAIQ | 207 controles de nuvem em 17 domínios; base do STAR | Avaliação por domínio; CAIQ pendente (B10) | 🟡 | [Garantia](/security/security-assurance), seção 5 |
| ISO/IEC 27001:2022 | SGSI e Anexo A | Referência para a certificação futura; sem afirmação de conformidade | ❌ | [Prontidão](/operations/release-readiness) |
| SOC 2 (AICPA) | Relatório de controles por auditor | Depois de haver receita | ❌ | — |
| [CIS Controls v8.1](https://www.cisecurity.org/controls) | Controles priorizados | Inventário, MFA, backups, gestão de vulnerabilidades | 🟡 | CI e backups |
| LGPD e Resolução CD/ANPD nº 15/2024 | Proteção de dados no Brasil; incidente comunicado em 3 dias úteis | Exportação e exclusão de conta; faltam Termos, Política e encarregado (B9); falta plano de incidentes (B5) | 🟡 | [Garantia](/security/security-assurance), B5 e B9 |

## Identidade e autenticação
| Referência | Exige | Aplicação | Estado |
|---|---|---|---|
| [NIST SP 800-63B-4](https://doi.org/10.6028/NIST.SP.800-63b-4) | Senha de 15+ como fator único; sem regras de composição; sem troca periódica; opção resistente a phishing | Senha mestra de 12+ com análise de força; conta com 10 + MFA opcional (B3); sem troca periódica forçada desde 2026-11-06 | 🟡 |
| FIDO2 / WebAuthn | Passkeys, extensão PRF | Planejado: segundo fator (B4) e desbloqueio | ❌ |
| RFC 6238 (TOTP) | Códigos por tempo | MFA da conta (Supabase) e OTP de sistemas externos (testado com os vetores da RFC) | ✅ |
| RFC 6749, 7636, 9700 | OAuth 2.0, PKCE, boas práticas de segurança | Google e GitHub com PKCE, Redirect URLs exatas | ✅ |
| NIST SP 800-207 | Zero trust | O servidor não é confiável para o conteúdo; RLS por requisição; `aal2` | ✅ |

## Criptografia
| Referência | Aplicação | Estado |
|---|---|---|
| FIPS 197, NIST SP 800-38D | AES-256-GCM com AAD | ✅ |
| NIST SP 800-132 e OWASP Password Storage | PBKDF2-SHA256, 600 mil iterações | ✅ (alvo: Argon2id) |
| RFC 5869, NIST SP 800-56C | HKDF | ✅ |
| NIST SP 800-56A | ECDH P-256 | ✅ |
| NIST SP 800-57 | Gestão de chaves: hierarquia, rotação, recuperação | 🟡 Falta rotação da DEK |
| NIST IR 8547, FIPS 203 | Transição pós-quântica (ECC descontinuada até 2030) | ❌ Planejado: híbrido com ML-KEM |
| FIPS 140-3 | Módulo validado | ❌ Não declarar (WebCrypto do navegador não é validada) |

## Desenvolvimento e aplicação
| Referência | Aplicação | Estado |
|---|---|---|
| [OWASP ASVS 5.0](https://owasp.org/www-project-application-security-verification-standard/) | Base do pentest web | 🟡 Em andamento |
| [OWASP MASVS 2](https://mas.owasp.org/MASVS/) | Base do pentest mobile | 🟡 |
| OWASP Top 10 | XSS, controle de acesso, criptografia, configuração | 🟡 Pentest |
| NIST SP 800-218 (SSDF) | CI, revisão, dependências, procedência | 🟡 Faltam SBOM e builds com procedência (B8) |
| RFC 9116 | `security.txt` | ✅ (falta o relato privado no GitHub) |
| Chromium MV3 | Modelo de segurança da extensão | ✅ |

## Ameaças e PAM
| Referência | Aplicação | Estado |
|---|---|---|
| MITRE ATT&CK T1555 e T1552 | Modelo de ameaças do cofre e da extensão | 🟡 |
| CyberArk Blueprint (3 princípios) | Roubo de credenciais, movimento lateral, escalada de privilégio | 🟡 [Revisão comparada](/architecture/security-architecture-review), seção 8 |
| Controles PAM (controle duplo, check-out, senha de uso único, CPM, PSM, PTA) | Governança | 🟡 Ver [Inovação](/product/innovation) |
