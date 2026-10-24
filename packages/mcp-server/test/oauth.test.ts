import { test } from "node:test";
import assert from "node:assert/strict";
import { generateKeyPair, exportJWK, SignJWT } from "jose";
import { OAuthResource, OAuthAccessError, type OAuthResourceOptions } from "../src/oauth.js";
import { startLocalHttpServer } from "../src/http.js";
import { createAikoServer } from "../src/aiko-server.js";

const issuer = "https://auth.example.test/tenant";
const resource = "https://aiko.example.test/mcp";
const pair = await generateKeyPair("ES256");
const jwk = { ...await exportJWK(pair.publicKey), kid: "test-key", alg: "ES256", use: "sig" };
const metadata = {
  issuer, jwks_uri: "https://auth.example.test/keys",
  authorization_endpoint: "https://auth.example.test/authorize",
  token_endpoint: "https://auth.example.test/token",
  response_types_supported: ["code"], code_challenge_methods_supported: ["S256"],
};
const mockFetch: typeof fetch = async (input) => {
  const url = String(input);
  if (url === "https://auth.example.test/.well-known/oauth-authorization-server/tenant") return Response.json(metadata);
  if (url === metadata.jwks_uri) return Response.json({ keys: [jwk] });
  throw new Error("Unexpected fetch");
};
const config: OAuthResourceOptions = { issuer, resource, subjects: ["owner"], clientIds: ["registered-client", "other-client"], fetch: mockFetch };
async function token(overrides: Record<string, unknown> = {}, typ = "at+jwt") {
  return new SignJWT({ client_id: "registered-client", scope: "mcp:tools", ...overrides })
    .setProtectedHeader({ alg: "ES256", kid: "test-key", typ })
    .setIssuer(typeof overrides["iss"] === "string" ? overrides["iss"] : issuer)
    .setAudience(typeof overrides["aud"] === "string" ? overrides["aud"] : resource)
    .setSubject(typeof overrides["sub"] === "string" ? overrides["sub"] : "owner")
    .setIssuedAt(typeof overrides["iat"] === "number" ? overrides["iat"] : Math.floor(Date.now() / 1000))
    .setExpirationTime(overrides["exp"] === 0 ? 0 : "5m").sign(pair.privateKey);
}

test("OAuth: pinned discovery advertises resource, issuer and scope", async () => {
  const auth = await OAuthResource.discover(config);
  assert.equal(auth.metadataPath, "/.well-known/oauth-protected-resource/mcp");
  assert.deepEqual(auth.metadata["authorization_servers"], [issuer]);
  assert.equal(auth.metadata["resource"], resource);
  assert.match(auth.challenge(), /resource_metadata="https:\/\/aiko.example.test\/\.well-known\/oauth-protected-resource\/mcp"/);
  assert.equal(typeof await auth.verify(await token()), "string");
});

test("OAuth: a valid root issuer without a trailing slash is preserved verbatim", async () => {
  const rootIssuer = "https://auth.example.test";
  const auth = await OAuthResource.discover({ ...config, issuer: rootIssuer, fetch: async (input) => {
    assert.equal(String(input), `${rootIssuer}/.well-known/oauth-authorization-server`);
    return Response.json({ ...metadata, issuer: rootIssuer });
  } });
  assert.deepEqual(auth.metadata["authorization_servers"], [rootIssuer]);
  await assert.rejects(OAuthResource.discover({ ...config, issuer: rootIssuer, fetch: async () =>
    Response.json({ ...metadata, issuer: `${rootIssuer}/` }) }));
});

test("OAuth: wrong signature, issuer, audience, expiry, type and malformed tokens fail closed", async () => {
  const auth = await OAuthResource.discover(config);
  const foreign = await generateKeyPair("ES256");
  const forged = await new SignJWT({ sub: "owner", client_id: "registered-client", scope: "mcp:tools" })
    .setProtectedHeader({ alg: "ES256", kid: "test-key", typ: "at+jwt" })
    .setIssuer(issuer).setAudience(resource).setIssuedAt().setExpirationTime("5m").sign(foreign.privateKey);
  for (const invalid of ["not-a-jwt", forged, await token({ iss: "https://evil.test" }),
    await token({ aud: "https://other.test/mcp" }), await token({ exp: 0 }), await token({}, "JWT"),
    await token({ iat: Math.floor(Date.now() / 1000) + 600 }), await token({ iat: Math.floor(Date.now() / 1000) - 7200 })]) {
    await assert.rejects(auth.verify(invalid), (error: unknown) => error instanceof OAuthAccessError && error.status === 401);
  }
});

test("OAuth: OIDC discovery fallback only follows a 404, and still pins issuer", async () => {
  const fetched: string[] = [];
  const auth = await OAuthResource.discover({ ...config, fetch: async (input) => {
    fetched.push(String(input));
    return fetched.length === 1 ? new Response(null, { status: 404 }) : Response.json(metadata);
  } });
  assert.equal(auth.resource, resource);
  assert.equal(fetched[1], "https://auth.example.test/tenant/.well-known/openid-configuration");
  let count = 0;
  await assert.rejects(OAuthResource.discover({ ...config, fetch: async () => { count++; return new Response(null, { status: 500 }); } }));
  assert.equal(count, 1);
});

test("OAuth: explicit owner/client allowlists and required scope are enforced", async () => {
  const auth = await OAuthResource.discover(config);
  for (const claims of [{ sub: "stranger" }, { client_id: "unknown" }, { scope: "openid" }, { scope: undefined }]) {
    await assert.rejects(auth.verify(await token(claims)), (error: unknown) => error instanceof OAuthAccessError && error.status === 403);
  }
});

test("OAuth: unsafe or incomplete provider configuration refuses startup", async () => {
  for (const settings of [{ issuer: "http://auth.test" }, { subjects: [] }, { subjects: ["owner", "other-owner"] }, { clientIds: [] }, { resource: `${resource}?token=x` }]) {
    await assert.rejects(OAuthResource.discover({ ...config, ...settings }));
  }
  for (const bad of [{ ...metadata, issuer: "https://evil.test" }, { ...metadata, code_challenge_methods_supported: ["plain"] },
    { ...metadata, token_endpoint: "http://auth.test/token" }]) {
    await assert.rejects(OAuthResource.discover({ ...config, fetch: async () => Response.json(bad) }));
  }
});

test("OAuth HTTP: discovery, challenges, authorization and principal-bound sessions", async () => {
  const oauth = await OAuthResource.discover(config);
  const gateway = await startLocalHttpServer(() => createAikoServer({
    personaRepository: { load: async () => ({ id: "aiko", version: "1", identityCore: "Aiko", invariants: "test", behavioralContract: "test", sources: [] }) },
    user: { context: { id: "owner" }, privacy: { allowRemotePersonaService: false, allowUsageTelemetry: false } },
  }), { port: 0, oauth });
  const contentHeaders = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
  try {
    const discovery = await fetch(new URL(oauth.metadataPath, gateway.url));
    assert.equal(discovery.status, 200);
    assert.equal((await discovery.json() as Record<string, unknown>)["resource"], resource);
    const unauthenticated = await fetch(gateway.url, { method: "POST" });
    assert.equal(unauthenticated.status, 401);
    assert.equal(unauthenticated.headers.get("www-authenticate"), oauth.challenge());
    const missingScope = await fetch(gateway.url, { method: "POST", headers: { Authorization: `Bearer ${await token({ scope: "openid" })}` } });
    assert.equal(missingScope.status, 403);
    const ownToken = await token();
    const initialized = await fetch(gateway.url, { method: "POST", headers: { ...contentHeaders, Authorization: `Bearer ${ownToken}` }, body: JSON.stringify({
      jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "oauth-test", version: "1" } },
    }) });
    assert.equal(initialized.status, 200);
    const session = initialized.headers.get("mcp-session-id")!;
    await initialized.text();
    const called = await fetch(gateway.url, { method: "POST", headers: {
      ...contentHeaders, Authorization: `Bearer ${ownToken}`, "mcp-session-id": session,
    }, body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "aiko.health", arguments: {} } }) });
    assert.equal(called.status, 200);
    const callBody = await called.json() as { result: { content: { text: string }[] } };
    assert.equal((JSON.parse(callBody.result.content[0]!.text) as { status: string }).status, "ok");
    const other = await fetch(gateway.url, { method: "DELETE", headers: { Authorization: `Bearer ${await token({ client_id: "other-client" })}`, "mcp-session-id": session } });
    assert.equal(other.status, 404);
    const deleted = await fetch(gateway.url, { method: "DELETE", headers: { Authorization: `Bearer ${ownToken}`, "mcp-session-id": session } });
    assert.equal(deleted.status, 200);
  } finally { await gateway.close(); }
});
