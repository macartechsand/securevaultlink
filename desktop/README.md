# SecureLink Vault desktop (Tauri 2)

The same web app (`web-saas/dist`) in a native window, plus one native capability: `rotation_http`, an
HTTPS client restricted to an allowlist of provider API hosts, so credential rotation runs **on the
device** without browser CORS limits (docs/product/innovation.md 9.2). No shell, filesystem or generic
HTTP plugin is enabled.

```sh
# prerequisites: Rust stable, and on Linux the WebKitGTK packages (see .github/workflows/ci.yml)
cd web-saas && npm ci && npm run build         # frontendDist
cd ../desktop/src-tauri && cargo test          # allowlist tests
cargo install tauri-cli --version "^2" --locked
cargo tauri dev                                # needs `npm run dev` in web-saas (devUrl)
cargo tauri build                              # msi/nsis (Windows), appimage/deb (Linux)
```

Status: scaffold compiled and tested in CI only (not on the owner's machine yet). Code signing,
auto-update and the macOS build are pending (docs/security/security-assurance.md, Tauri section).
