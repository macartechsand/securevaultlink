# Cores para output no PowerShell
$Red = [System.ConsoleColor]::Red
$Green = [System.ConsoleColor]::Green
$Yellow = [System.ConsoleColor]::Yellow

Write-Host "🔒 Iniciando verificação de segurança do SecureLink Vault" -ForegroundColor Green

# Verifica dependências com vulnerabilidades conhecidas
Write-Host "`n📦 Verificando dependências..." -ForegroundColor Yellow
npm audit

# Verifica dependências não utilizadas
Write-Host "`n🧹 Verificando dependências não utilizadas..." -ForegroundColor Yellow
npx depcheck

# Verifica tipos TypeScript
Write-Host "`n📝 Verificando tipos TypeScript..." -ForegroundColor Yellow
npm run type-check

# Executa ESLint
Write-Host "`n🔍 Executando análise estática de código..." -ForegroundColor Yellow
npm run lint

# Executa testes de segurança
Write-Host "`n🧪 Executando testes de segurança..." -ForegroundColor Yellow
npm run test:security

Write-Host "`n✅ Verificação de segurança concluída!" -ForegroundColor Green 