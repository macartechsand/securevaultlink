# SecureVault agent broker (MCP)

AI agents use a credential only after a human approves a time-limited request (JIT), and the secret is injected into one command instead of the model context. Docs: [docs/product/agent-broker.md](../docs/product/agent-broker.md).

```sh
node agent-broker/build.mjs                 # -> agent-broker/dist/securevault-mcp.mjs
node --test agent-broker/test/broker.test.mjs
```
