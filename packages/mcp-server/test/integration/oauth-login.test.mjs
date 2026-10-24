// Test-only authorization server. Never import this from application code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createPrivateKey, randomBytes } from 'node:crypto';
import { createServer, request } from 'node:https';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Provider } from 'oidc-provider';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { OAuthResource, startLocalHttpServer, createAikoServer } from '../../dist/index.js';

const resource = 'https://aiko.example.test/mcp';
const clientId = 'aiko-login-test';
const redirectUri = 'http://127.0.0.1:17431/callback';

async function startIssuer() {
  const dir = await mkdtemp(join(tmpdir(), 'aiko-login-'));
  let server;
  try {
    const keyFile = join(dir, 'key.pem');
    const certFile = join(dir, 'cert.pem');
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyFile,
      '-out', certFile, '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
    const key = await readFile(keyFile);
    const cert = await readFile(certFile);
    let handler;
    server = createServer({ key, cert }, (req, res) => handler(req, res));
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
    const issuer = `https://127.0.0.1:${server.address().port}`;
    const signingKey = createPrivateKey(key).export({ format: 'jwk' });
    const provider = new Provider(issuer, {
      clients: [{ client_id: clientId, redirect_uris: [redirectUri], grant_types: ['authorization_code'],
        response_types: ['code'], token_endpoint_auth_method: 'none' }],
      cookies: { keys: [randomBytes(32).toString('hex')] },
      jwks: { keys: [{ ...signingKey, kid: 'fixture-signing-key', alg: 'RS256', use: 'sig' }] },
      pkce: { required: () => true, methods: ['S256'] },
      features: { devInteractions: { enabled: true }, resourceIndicators: {
        enabled: true,
        defaultResource: () => resource,
        getResourceServerInfo: (_ctx, requested) => {
          assert.equal(requested, resource);
          return { scope: 'mcp:tools', audience: resource, accessTokenFormat: 'jwt', accessTokenTTL: 60,
            jwt: { sign: { alg: 'RS256' } } };
        },
      } },
      findAccount: async (_ctx, id) => id === 'fixture-owner'
        ? { accountId: id, claims: async () => ({ sub: id }) } : undefined,
    });
    handler = provider.callback();
    // Trust only this ephemeral fixture certificate. Global TLS verification stays enabled.
    const trustedFetch = (input, init = {}) => new Promise((resolve, reject) => {
      const url = new URL(String(input));
      if (url.origin !== issuer) { reject(new Error('Unexpected outbound request')); return; }
      const req = request(url, { ca: cert, method: init.method ?? 'GET',
        headers: Object.fromEntries(new Headers(init.headers)), signal: init.signal ?? AbortSignal.timeout(5000) }, (res) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () => {
          const headers = new Headers();
          for (let i = 0; i < res.rawHeaders.length; i += 2) headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
          resolve(new Response(Buffer.concat(chunks), { status: res.statusCode, headers }));
        });
      });
      req.on('error', reject);
      req.end(init.body?.toString());
    });
    return { issuer, fetch: trustedFetch, close: async () => {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await rm(dir, { recursive: true, force: true });
    } };
  } catch (error) {
    server?.closeAllConnections(); server?.close();
    await rm(dir, { recursive: true, force: true });
    throw error;
  }
}

async function authorize(as) {
  const verifier = randomBytes(32).toString('base64url');
  const state = randomBytes(24).toString('base64url');
  const cookies = new Map();
  const url = new URL('/auth', as.issuer);
  url.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: 'code',
    scope: 'openid mcp:tools', resource, state, code_challenge_method: 'S256',
    code_challenge: createHash('sha256').update(verifier).digest('base64url') }).toString();
  let next = url;
  let init = {};
  let sawLogin = false;
  let sawConsent = false;
  for (let step = 0; step < 12; step++) {
    const response = await as.fetch(next, { ...init, headers: { ...init.headers,
      Cookie: [...cookies].map(([name, value]) => `${name}=${value}`).join('; ') } });
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(';')[0];
      const split = pair.indexOf('=');
      cookies.set(pair.slice(0, split), pair.slice(split + 1));
    }
    const location = response.headers.get('location');
    if (location) {
      const target = new URL(location, next);
      if (target.origin === new URL(redirectUri).origin && target.pathname === '/callback') {
        assert.equal(target.searchParams.get('state'), state);
        assert.equal(target.searchParams.get('error'), null);
        assert.ok(target.searchParams.get('code'));
        assert.ok(sawLogin && sawConsent, 'fixture must exercise both login and consent');
        return { code: target.searchParams.get('code'), verifier };
      }
      assert.equal(target.origin, as.issuer);
      next = target; init = {}; continue;
    }
    assert.equal(response.status, 200);
    const html = await response.text();
    const action = /<form[^>]*action="([^"]+)"/.exec(html)?.[1];
    assert.ok(action, 'expected an interaction form');
    const prompt = html.includes('name="prompt" value="login"') ? 'login' : 'consent';
    if (prompt === 'login') sawLogin = true; else sawConsent = true;
    next = new URL(action.replaceAll('&amp;', '&'), next);
    init = { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ prompt, ...(prompt === 'login' ? { login: 'fixture-owner', password: 'fixture-only' } : {}) }) };
  }
  throw new Error('Authorization did not finish');
}

async function exchange(as, authorization, overrides = {}) {
  return as.fetch(new URL('/token', as.issuer), { method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: clientId, redirect_uri: redirectUri,
      resource, code: authorization.code, code_verifier: authorization.verifier, ...overrides }) });
}

test('OAuth login: real TLS issuer, login, consent, PKCE exchange, MCP call and replay rejection', { timeout: 30_000 }, async () => {
  const as = await startIssuer();
  let gateway;
  const client = new Client({ name: 'login-flow-test', version: '1' });
  try {
    const oauth = await OAuthResource.discover({ issuer: as.issuer, resource, subjects: ['fixture-owner'],
      clientIds: [clientId], fetch: as.fetch });
    const authorization = await authorize(as);
    const exchanged = await exchange(as, authorization);
    assert.equal(exchanged.status, 200);
    const tokens = await exchanged.json();
    assert.equal(tokens.token_type, 'Bearer');
    assert.ok(tokens.access_token);
    gateway = await startLocalHttpServer(() => createAikoServer({ allowLocalMutations: false,
      personaRepository: { load: async () => ({ id: 'aiko', version: '1', identityCore: 'Test Aiko',
        invariants: 'Test only', behavioralContract: 'Test only', sources: [] }) },
      user: { context: { id: 'fixture-owner' }, privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false } },
    }), { port: 0, oauth });
    await client.connect(new StreamableHTTPClientTransport(gateway.url, {
      requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
    }));
    const result = await client.callTool({ name: 'aiko.health', arguments: {} });
    assert.equal(JSON.parse(result.content[0].text).status, 'ok');
    const replay = await exchange(as, authorization);
    assert.equal(replay.status, 400);
    assert.equal((await replay.json()).error, 'invalid_grant');
    const wrongVerifier = await exchange(as, await authorize(as), { code_verifier: randomBytes(32).toString('base64url') });
    assert.equal(wrongVerifier.status, 400);
    assert.equal((await wrongVerifier.json()).error, 'invalid_grant');
  } finally { await client.close(); await gateway?.close(); await as.close(); }
});
