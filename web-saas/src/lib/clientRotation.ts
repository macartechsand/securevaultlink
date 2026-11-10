/**
 * Client-side rotation (docs/product/innovation.md 9.2): the user's own device calls the platform API,
 * so the current and the new credential never pass through SecureVault's servers (zero-knowledge kept,
 * unlike the `rotate` Edge Function, which needs per-item consent).
 *
 * Transport:
 *  - browser fetch, for APIs that allow cross-origin calls (GitLab REST API);
 *  - the desktop app (Tauri), whose native `rotation_http` command calls an allowlist of provider hosts
 *    without the browser's CORS limits (Cloudflare and, next, AWS/Google/Microsoft).
 * Connectors without an on-device path keep using the Edge Function.
 */

export type HttpRequest = { url: string; method: 'GET' | 'POST' | 'PUT'; headers: Record<string, string>; body?: string };
export type HttpResponse = { status: number; body: string };
export type HttpTransport = (req: HttpRequest) => Promise<HttpResponse>;

export type ClientRotationResult = { secret: string; expiresAt: string | null; verified: boolean; warning?: string };

export class ClientRotationError extends Error {}

type TauriGlobal = { core?: { invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown> } };

/** True inside the SecureLink desktop app (Tauri 2 with withGlobalTauri). */
export function isDesktopApp(w: unknown = globalThis): boolean {
  return typeof (w as { __TAURI__?: TauriGlobal }).__TAURI__?.core?.invoke === 'function';
}

export const browserTransport: HttpTransport = async ({ url, method, headers, body }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(url, { method, headers, body, redirect: 'error', credentials: 'omit', cache: 'no-store', signal: controller.signal });
    return { status: res.status, body: await res.text() };
  } finally {
    clearTimeout(timer);
  }
};

export const desktopTransport: HttpTransport = async (req) => {
  const tauri = (globalThis as { __TAURI__?: TauriGlobal }).__TAURI__;
  if (!tauri?.core) throw new ClientRotationError('Disponível só no app desktop.');
  const res = (await tauri.core.invoke('rotation_http', { request: req })) as HttpResponse;
  return res;
};

/** Connectors that can rotate on the device, and where. */
export const ON_DEVICE: Record<string, 'browser' | 'desktop'> = {
  'gitlab-pat': 'browser',
  'cloudflare-api-token': 'desktop',
};

export function onDeviceTransport(connectorId: string, desktop = isDesktopApp()): HttpTransport | null {
  const where = ON_DEVICE[connectorId];
  if (!where) return null;
  if (desktop) return desktopTransport;
  return where === 'browser' ? browserTransport : null;
}

const parse = (body: string) => {
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return {} as Record<string, unknown>;
  }
};

/** Public HTTPS GitLab only (no IP literals, localhost or internal names), as in the Edge Function. */
export function gitlabBase(raw: string | undefined): string {
  let url: URL;
  try {
    url = new URL((raw ?? '').trim() || 'https://gitlab.com');
  } catch {
    throw new ClientRotationError('Endereço do GitLab inválido.');
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== 'https:' || !host.includes('.') || /^[\d.]+$/.test(host) || host.includes(':') || /(^|\.)(localhost|local|internal)$/.test(host)) {
    throw new ClientRotationError('Use o endereço HTTPS público do GitLab (ex.: https://gitlab.com).');
  }
  return url.origin;
}

export async function rotateGitlab(token: string, config: Record<string, string>, http: HttpTransport, now = Date.now()): Promise<ClientRotationResult> {
  const base = gitlabBase(config.baseUrl);
  const days = Number(config.expiresInDays || 90);
  if (!Number.isInteger(days) || days < 1 || days > 365) throw new ClientRotationError('Validade do novo token: de 1 a 365 dias.');
  const expires = new Date(now + days * 86_400_000).toISOString().slice(0, 10);
  const res = await http({
    url: `${base}/api/v4/personal_access_tokens/self/rotate`,
    method: 'POST',
    headers: { 'PRIVATE-TOKEN': token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ expires_at: expires }),
  });
  if (res.status === 401) throw new ClientRotationError('O GitLab recusou o token atual (expirado, revogado ou incorreto).');
  if (res.status === 403) throw new ClientRotationError('O token precisa do escopo api ou self_rotate para se rotacionar.');
  if (res.status < 200 || res.status >= 300) throw new ClientRotationError(`O GitLab recusou a rotação (HTTP ${res.status}). Nada foi alterado.`);
  const body = parse(res.body) as { token?: string; expires_at?: string };
  if (!body.token) throw new ClientRotationError('Resposta inesperada do GitLab.');
  // GitLab already revoked the old token: from here on the new one MUST reach the vault.
  const check = await http({ url: `${base}/api/v4/personal_access_tokens/self`, method: 'GET', headers: { 'PRIVATE-TOKEN': body.token } }).catch(() => null);
  return { secret: body.token, expiresAt: body.expires_at ?? expires, verified: Boolean(check && check.status === 200) };
}

const CF = 'https://api.cloudflare.com/client/v4';

async function cfVerify(token: string, http: HttpTransport) {
  const res = await http({ url: `${CF}/user/tokens/verify`, method: 'GET', headers: { Authorization: `Bearer ${token}` } });
  const body = parse(res.body) as { success?: boolean; result?: { id?: string; status?: string; expires_on?: string } };
  return res.status === 200 && body.success && body.result?.status === 'active' ? body.result : null;
}

export async function rotateCloudflare(token: string, http: HttpTransport): Promise<ClientRotationResult> {
  const current = await cfVerify(token, http);
  if (!current?.id) throw new ClientRotationError('A Cloudflare recusou o token atual (ou ele é um token de conta, ainda não suportado).');
  const res = await http({
    url: `${CF}/user/tokens/${encodeURIComponent(current.id)}/value`,
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
  });
  const body = parse(res.body) as { success?: boolean; result?: unknown };
  if (res.status === 401 || res.status === 403) throw new ClientRotationError('O token precisa da permissão "API Tokens: Edit" para gerar um novo valor.');
  if (res.status !== 200 || !body.success || typeof body.result !== 'string') throw new ClientRotationError('A Cloudflare recusou a rotação. Nada foi alterado.');
  const verified = Boolean(await cfVerify(body.result, http).catch(() => null));
  return { secret: body.result, expiresAt: current.expires_on ?? null, verified };
}

/** Rotates on this device when the connector supports it here; null = use the Edge Function. */
export async function rotateOnDevice(
  connectorId: string,
  secret: string,
  config: Record<string, string>,
  transport: HttpTransport | null = onDeviceTransport(connectorId),
): Promise<ClientRotationResult | null> {
  if (!transport) return null;
  if (connectorId === 'gitlab-pat') {
    // In the browser only gitlab.com is reachable (the app's CSP connect-src); self-managed GitLab goes
    // through the desktop app or the Edge Function.
    if (transport === browserTransport && gitlabBase(config.baseUrl) !== 'https://gitlab.com') return null;
    return rotateGitlab(secret, config, transport);
  }
  if (connectorId === 'cloudflare-api-token') return rotateCloudflare(secret, transport);
  return null;
}
