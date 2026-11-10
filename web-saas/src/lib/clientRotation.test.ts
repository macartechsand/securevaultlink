import { describe, expect, it } from 'vitest';
import { type HttpRequest, type HttpTransport, browserTransport, gitlabBase, isDesktopApp, onDeviceTransport, rotateCloudflare, rotateGitlab, rotateOnDevice } from './clientRotation';

function fake(routes: Record<string, (req: HttpRequest) => { status: number; body: unknown }>) {
  const calls: HttpRequest[] = [];
  const http: HttpTransport = async (req) => {
    calls.push(req);
    const key = `${req.method} ${req.url}`;
    const handler = routes[key];
    if (!handler) return { status: 404, body: '{}' };
    const r = handler(req);
    return { status: r.status, body: JSON.stringify(r.body) };
  };
  return { http, calls };
}

describe('client-side rotation', () => {
  it('GitLab: rotates, verifies the new token, and never sends the token anywhere else', async () => {
    const { http, calls } = fake({
      'POST https://gitlab.com/api/v4/personal_access_tokens/self/rotate': (req) =>
        req.headers['PRIVATE-TOKEN'] === 'old' ? { status: 200, body: { token: 'new-token', expires_at: '2027-02-11' } } : { status: 401, body: {} },
      'GET https://gitlab.com/api/v4/personal_access_tokens/self': (req) => ({ status: req.headers['PRIVATE-TOKEN'] === 'new-token' ? 200 : 401, body: {} }),
    });
    const r = await rotateGitlab('old', {}, http, Date.parse('2026-11-13T00:00:00Z'));
    expect(r).toEqual({ secret: 'new-token', expiresAt: '2027-02-11', verified: true });
    expect(calls.every((c) => c.url.startsWith('https://gitlab.com/'))).toBe(true);
    expect(JSON.parse(calls[0].body!)).toEqual({ expires_at: '2027-02-11' });
  });

  it('GitLab: wrong token and missing scope give clear errors', async () => {
    const unauthorized = fake({ 'POST https://gitlab.com/api/v4/personal_access_tokens/self/rotate': () => ({ status: 401, body: {} }) });
    await expect(rotateGitlab('x', {}, unauthorized.http)).rejects.toThrow(/recusou o token atual/);
    const forbidden = fake({ 'POST https://gitlab.com/api/v4/personal_access_tokens/self/rotate': () => ({ status: 403, body: {} }) });
    await expect(rotateGitlab('x', {}, forbidden.http)).rejects.toThrow(/self_rotate/);
  });

  it('GitLab base URL refuses internal targets (no SSRF through the item)', () => {
    expect(gitlabBase('https://gitlab.example.com/group')).toBe('https://gitlab.example.com');
    for (const bad of ['http://gitlab.com', 'https://10.0.0.1', 'https://localhost', 'https://gitlab.internal', 'https://intranet']) {
      expect(() => gitlabBase(bad)).toThrow();
    }
  });

  it('Cloudflare: verify, roll, verify', async () => {
    const { http } = fake({
      'GET https://api.cloudflare.com/client/v4/user/tokens/verify': (req) =>
        req.headers.Authorization === 'Bearer old' || req.headers.Authorization === 'Bearer rolled'
          ? { status: 200, body: { success: true, result: { id: 'tok1', status: 'active', expires_on: '2027-01-01T00:00:00Z' } } }
          : { status: 401, body: { success: false } },
      'PUT https://api.cloudflare.com/client/v4/user/tokens/tok1/value': () => ({ status: 200, body: { success: true, result: 'rolled' } }),
    });
    expect(await rotateCloudflare('old', http)).toEqual({ secret: 'rolled', expiresAt: '2027-01-01T00:00:00Z', verified: true });
  });

  it('transport choice: GitLab in the browser, Cloudflare only in the desktop app, others on the server', async () => {
    expect(onDeviceTransport('gitlab-pat', false)).not.toBeNull();
    expect(onDeviceTransport('cloudflare-api-token', false)).toBeNull();
    expect(onDeviceTransport('cloudflare-api-token', true)).not.toBeNull();
    expect(onDeviceTransport('aws-iam-access-key', true)).toBeNull();
    expect(await rotateOnDevice('aws-iam-access-key', 's', {}, null)).toBeNull();
    // Self-managed GitLab is not in the web app's CSP: browser falls back to the server path.
    expect(await rotateOnDevice('gitlab-pat', 's', { baseUrl: 'https://gitlab.example.com' }, browserTransport)).toBeNull();
    expect(isDesktopApp({})).toBe(false);
    expect(isDesktopApp({ __TAURI__: { core: { invoke: () => Promise.resolve() } } })).toBe(true);
  });
});
