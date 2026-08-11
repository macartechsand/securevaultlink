# SecureLink Vault

SecureLink Vault é um projeto de segurança digital que hoje contém dois produtos principais:

- **Aplicativo mobile** (`root`): React Native + Expo + TypeScript, com foco em criptografia local, biometria e gerenciamento de vault.
- **Aplicação Web SaaS** (`web-saas`): React + Vite + Supabase, focada em autenticação e persistência na nuvem.

## Documentação completa

A documentação de desenvolvimento completa está em:

- `docs/PROJECT_DOCUMENTATION.md`

## Instruções rápidas

### Mobile
```bash
npm install
npm run start
npm run web
```

### Web SaaS
```bash
cd web-saas
npm install
npm run dev
```

## Próximos passos

1. Leia `docs/PROJECT_DOCUMENTATION.md`
2. Configure as variáveis de ambiente
3. Execute a aplicação desejada
4. Faça commit e deploy após revisão

## Fluxo de desenvolvimento

- Trabalhar em `dev` para desenvolvimento incremental
- Abrir PR de `dev` para `main` após validação
- Revisar build e variáveis antes do deploy em produção
- Manter `.env` fora do controle de versão
