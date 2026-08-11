# Documentação da API

## Serviços Internos

### 1. Serviço de Encriptação

#### 1.1 Interface
```typescript
interface EncryptionService {
  initializeMasterKey(): Promise<void>;
  savePassword(password: StoredPassword): Promise<StoredPassword>;
  getAllPasswords(): Promise<StoredPassword[]>;
  getPassword(id: string): Promise<StoredPassword | null>;
  updatePassword(id: string, updates: Partial<StoredPassword>): Promise<StoredPassword | null>;
  deletePassword(id: string): Promise<boolean>;
}
```

#### 1.2 Uso
```typescript
// Inicialização
await encryptionService.initializeMasterKey();

// Salvar senha
const newPassword = await encryptionService.savePassword({
  title: 'Gmail',
  username: 'user@gmail.com',
  password: 'securePassword123'
});
```

### 2. Serviço HIBP (Have I Been Pwned)

#### 2.1 Interface
```typescript
interface HIBPService {
  checkPassword(password: string): Promise<{
    isBreached: boolean;
    count: number;
  }>;
}
```

#### 2.2 Uso
```typescript
const result = await HIBPService.checkPassword('mypassword');
if (result.isBreached) {
  console.warn(`Senha encontrada em ${result.count} vazamentos`);
}
```

### 3. Serviço VirusTotal

#### 3.1 Interface
```typescript
interface URLScanResult {
  isClean: boolean;
  positives: number;
  total: number;
  threats: string[];
}

interface VirusTotalService {
  scanURL(url: string): Promise<URLScanResult>;
  quickScanURL(url: string): Promise<URLScanResult | null>;
}
```

#### 3.2 Uso
```typescript
const result = await VirusTotalService.scanURL('https://example.com');
if (!result.isClean) {
  console.warn('URL suspeita detectada');
}
```

## Serviços Externos

### 1. Have I Been Pwned API

#### 1.1 Endpoint
```
GET https://api.pwnedpasswords.com/range/{hash-prefix}
```

#### 1.2 Parâmetros
- `hash-prefix`: Primeiros 5 caracteres do hash SHA-1 da senha

#### 1.3 Resposta
```
Hash-Suffix:Count
```

### 2. VirusTotal API

#### 2.1 Endpoints
```
POST https://www.virustotal.com/vtapi/v2/url/scan
GET https://www.virustotal.com/vtapi/v2/url/report
```

#### 2.2 Headers
```
X-ApiKey: YOUR-API-KEY
```

## Modelos de Dados

### 1. StoredPassword
```typescript
interface StoredPassword {
  id: string;
  title: string;
  username: string;
  password: string;
  url?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
}
```

### 2. PasswordStrength
```typescript
interface PasswordStrength {
  score: number;        // 0-4
  feedback: string;     // Mensagem de feedback
  warnings: string[];   // Avisos específicos
  suggestions: string[]; // Sugestões de melhoria
}
```

## Tratamento de Erros

### 1. Códigos de Erro
```typescript
enum ErrorCodes {
  ENCRYPTION_ERROR = 'ENCRYPTION_ERROR',
  DECRYPTION_ERROR = 'DECRYPTION_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  UNAUTHORIZED = 'UNAUTHORIZED'
}
```

### 2. Exemplo de Erro
```typescript
interface ApiError {
  code: ErrorCodes;
  message: string;
  details?: any;
}
```

## Rate Limiting

### 1. APIs Externas
- HIBP: 1000 requisições/dia
- VirusTotal: 4 requisições/minuto

### 2. Cache
```typescript
interface CacheConfig {
  ttl: number;        // Tempo de vida em segundos
  maxSize: number;    // Tamanho máximo do cache
  cleanupInterval: number; // Intervalo de limpeza
}
```

## Websockets (Futuro)

### 1. Eventos
```typescript
enum WebSocketEvents {
  PASSWORD_UPDATED = 'password_updated',
  SECURITY_ALERT = 'security_alert',
  SYNC_REQUIRED = 'sync_required'
}
```

### 2. Exemplo de Uso
```typescript
socket.on(WebSocketEvents.SECURITY_ALERT, (data) => {
  console.warn('Alerta de segurança:', data);
});
```

## Versionamento

### 1. API Version
```typescript
const API_VERSION = 'v1';
```

### 2. Compatibilidade
- Suporte garantido para as últimas 2 versões
- Deprecação com aviso de 3 meses
- Breaking changes apenas em major versions 