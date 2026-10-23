import { createHash } from "node:crypto";
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";

export interface OAuthResourceOptions {
  issuer: string;
  resource: string;
  /** Explicitly trusted subjects and preregistered OAuth clients for this local owner's data. */
  subjects: string[];
  clientIds: string[];
  scope?: string;
  fetch?: typeof globalThis.fetch;
}

function httpsUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("OAuth URLs must use HTTPS without credentials, query or fragment");
  }
  return url;
}

export class OAuthAccessError extends Error {
  constructor(readonly status: 401 | 403) { super(status === 401 ? "Invalid access token" : "Insufficient access"); }
}

/** Resource server only. Login, consent, PKCE and token issuance belong to the configured AS. */
export class OAuthResource {
  readonly resource: string;
  readonly metadataPath: string;
  readonly metadata: Record<string, unknown>;
  readonly scope: string;
  readonly #options: OAuthResourceOptions;
  readonly #keys: ReturnType<typeof createRemoteJWKSet>;

  private constructor(options: OAuthResourceOptions, jwks: URL) {
    this.#options = { ...options, subjects: [...options.subjects], clientIds: [...options.clientIds] };
    this.resource = options.resource;
    this.scope = options.scope ?? "mcp:tools";
    this.metadataPath = `/.well-known/oauth-protected-resource${new URL(options.resource).pathname.replace(/\/$/, "")}`;
    this.metadata = {
      resource: this.resource, authorization_servers: [options.issuer],
      scopes_supported: [this.scope], bearer_methods_supported: ["header"], resource_name: "Aiko MCP",
    };
    this.#keys = createRemoteJWKSet(jwks, {
      timeoutDuration: 5000, cacheMaxAge: 300_000,
      ...(options.fetch ? { [customFetch]: options.fetch } : {}),
    });
  }

  static async discover(options: OAuthResourceOptions): Promise<OAuthResource> {
    const issuer = httpsUrl(options.issuer);
    const resource = httpsUrl(options.resource);
    if (issuer.href !== options.issuer || resource.href !== options.resource) throw new Error("OAuth URLs must be canonical");
    if (resource.pathname !== "/mcp") throw new Error("OAuth resource must use the /mcp path");
    if (options.subjects.length !== 1 || !options.clientIds.length ||
        [...options.subjects, ...options.clientIds].some((v) => !v.trim()) ||
        !/^[\x21\x23-\x5B\x5D-\x7E]+$/.test(options.scope ?? "mcp:tools")) {
      throw new Error("OAuth requires exactly one owner subject, explicit client IDs and a valid scope");
    }
    // RFC 8414 inserts the well-known component before the issuer's path.
    const path = issuer.pathname.replace(/\/$/, "");
    const discovery = new URL(`/.well-known/oauth-authorization-server${path}`, issuer.origin);
    const fetchMetadata = (url: URL) => (options.fetch ?? fetch)(url, { redirect: "error", signal: AbortSignal.timeout(5000) });
    let response = await fetchMetadata(discovery);
    if (response.status === 404) {
      response = await fetchMetadata(new URL(`${issuer.pathname.replace(/\/$/, "")}/.well-known/openid-configuration`, issuer.origin));
    }
    if (!response.ok) throw new Error("OAuth discovery failed");
    const metadata = await response.json() as Record<string, unknown>;
    if (metadata["issuer"] !== options.issuer || typeof metadata["jwks_uri"] !== "string" ||
        !Array.isArray(metadata["code_challenge_methods_supported"]) || !metadata["code_challenge_methods_supported"].includes("S256") ||
        !Array.isArray(metadata["response_types_supported"]) || !metadata["response_types_supported"].includes("code")) {
      throw new Error("OAuth issuer must advertise authorization code, S256 PKCE and a JWKS endpoint");
    }
    for (const name of ["authorization_endpoint", "token_endpoint"] as const) {
      if (typeof metadata[name] !== "string") throw new Error("OAuth endpoints missing");
      httpsUrl(metadata[name]);
    }
    return new OAuthResource(options, httpsUrl(metadata["jwks_uri"]));
  }

  challenge(status: 401 | 403 = 401): string {
    const metadata = new URL(this.metadataPath, this.resource).href;
    return `Bearer resource_metadata="${metadata}", scope="${this.scope}"${status === 403 ? ', error="insufficient_scope"' : ""}`;
  }

  async verify(token: string): Promise<string> {
    let claims;
    try {
      ({ payload: claims } = await jwtVerify(token, this.#keys, {
        issuer: this.#options.issuer, audience: this.resource, algorithms: ["RS256", "ES256"],
        typ: "at+jwt", requiredClaims: ["exp", "iat", "sub", "client_id"], maxTokenAge: "1h",
      }));
    } catch { throw new OAuthAccessError(401); }
    if (typeof claims.sub !== "string" || typeof claims["client_id"] !== "string" ||
        !this.#options.subjects.includes(claims.sub) || !this.#options.clientIds.includes(claims["client_id"]) ||
        typeof claims["scope"] !== "string" || !claims["scope"].split(" ").includes(this.scope)) {
      throw new OAuthAccessError(403);
    }
    return createHash("sha256").update(JSON.stringify([this.#options.issuer, claims.sub, claims["client_id"]])).digest("hex");
  }
}
