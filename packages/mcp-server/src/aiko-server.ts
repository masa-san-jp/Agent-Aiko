// Aiko-MCP の MCP サーバー本体。設計書 §7。
//
// Resource を取得しただけでは人格適用を保証しない（§7.2 明記）。人格を効かせる
// のは Adapter による system 級注入であって、このサーバーではない。ここが提供
// するのは「人格の内容を読める口」と「Profile を合成する口」。
//
// Tool の結果には Persona version と hash を必ず載せる（§7.4）。載せないと、
// クライアント側は自分が何版の人格で動いているかを追えない（§16 の追跡性）。

import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { type PersonaRepository, type PersonaSnapshot } from "@agent-aiko/core";
import { type ResolvedUserContext } from "@agent-aiko/user-context";
import { CapabilityRegistry } from "@agent-aiko/capability-registry";
import {
  RuntimeProfileBinder,
  type InjectionMethod,
  type RuntimeId,
} from "@agent-aiko/binder";
import { ProfileStore } from "./profile-store.js";

export const SERVER_NAME = "aiko-mcp";
export const SERVER_VERSION = "0.1.0";

export interface AikoServerDeps {
  personaRepository: PersonaRepository;
  /** User Profile の解決結果。取得の仕方（ファイル／別経路）はサーバーの外で決める。 */
  user: ResolvedUserContext;
  personaId?: string;
  profileStore?: ProfileStore;
}

const RUNTIME_IDS = ["claude-code", "codex", "antigravity-cli", "generic-mcp-host"] as const;
const INJECTION_METHODS = [
  "claude-code:system-prompt-file",
  "claude-code:append-system-prompt-file",
  "codex:base-instructions",
  "none",
] as const;

export function createAikoServer(deps: AikoServerDeps): McpServer {
  const personaId = deps.personaId ?? "aiko";
  const store = deps.profileStore ?? new ProfileStore();
  const binder = new RuntimeProfileBinder({
    personaRepository: deps.personaRepository,
    capabilityRegistry: new CapabilityRegistry(),
  });

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const loadPersona = (): Promise<PersonaSnapshot> =>
    deps.personaRepository.load({ id: personaId });

  const textResource = (uri: string, name: string, description: string, pick: (p: PersonaSnapshot) => string) => {
    server.registerResource(
      name,
      uri,
      { title: name, description, mimeType: "text/markdown" },
      async () => {
        const persona = await loadPersona();
        return { contents: [{ uri, text: pick(persona) }] };
      },
    );
  };

  // --- Resources（§7.2）---
  textResource(
    `persona://${personaId}/core`,
    "persona-core",
    "自己認識の中核。Identity Consistency の対象",
    (p) => p.identityCore,
  );
  textResource(
    `persona://${personaId}/invariants`,
    "persona-invariants",
    "不変条項。欠落は fail closed",
    (p) => p.invariants,
  );
  textResource(
    `persona://${personaId}/behavior-contract`,
    "persona-behavior-contract",
    "判断原則。優先順位では不変条項より下",
    (p) => p.behavioralContract,
  );

  server.registerResource(
    "persona-version",
    `persona://${personaId}/version/current`,
    { title: "persona version", description: "適用中の人格の版", mimeType: "text/plain" },
    async () => {
      const persona = await loadPersona();
      return {
        contents: [{ uri: `persona://${personaId}/version/current`, text: persona.version }],
      };
    },
  );

  server.registerResource(
    "persona-manifest",
    `persona://${personaId}/manifest`,
    { title: "persona manifest", description: "人格の構成と由来", mimeType: "application/json" },
    async () => {
      const persona = await loadPersona();
      return {
        contents: [
          {
            uri: `persona://${personaId}/manifest`,
            text: JSON.stringify(
              { id: persona.id, version: persona.version, sources: persona.sources },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // §7.2 の runtime-profile://{profile_id}/summary。bind が返した profile_id を
  // そのまま URI に入れて引ける必要がある。固定 URI にすると、返した id で参照
  // できない＝プロトコル上は存在するのに使えない口になる。
  // profile_id に "latest" を渡した場合だけ直近のものを指す。
  server.registerResource(
    "runtime-profile-summary",
    new ResourceTemplate("runtime-profile://{profile_id}/summary", { list: undefined }),
    {
      title: "runtime profile summary",
      description:
        "合成済み Runtime Profile の要約。profile_id に latest を渡すと直近のもの。instructions 本文は含まない",
      mimeType: "application/json",
    },
    async (uri, variables) => {
      const raw = variables["profile_id"];
      const profileId = Array.isArray(raw) ? raw[0] : raw;
      const profile =
        profileId === undefined || profileId === "latest"
          ? store.latest()
          : store.get(profileId);
      const text = profile
        ? JSON.stringify(summarize(profile), null, 2)
        : JSON.stringify(
            {
              error:
                profileId === undefined || profileId === "latest"
                  ? "まだ bind されていません"
                  : `profile_id ${profileId} の Runtime Profile がありません`,
            },
            null,
            2,
          );
      return { contents: [{ uri: uri.href, text }] };
    },
  );

  // --- Tools（§7.4）---
  server.registerTool(
    "aiko.bind_runtime",
    {
      title: "Runtime Profile を合成する",
      description:
        "人格・ユーザー・能力を合成して Runtime Profile を作る。合成できない場合は理由を返し、Profile は返さない（fail closed）",
      inputSchema: {
        runtime: z.enum(RUNTIME_IDS),
        injectionMethod: z.enum(INJECTION_METHODS).optional(),
        capabilityManifest: z.unknown().optional(),
        outputPrefix: z.string().optional(),
      },
    },
    async ({ runtime, injectionMethod, capabilityManifest, outputPrefix }) => {
      try {
        const profile = await binder.bind(
          {
            persona: { id: personaId },
            runtime: {
              id: runtime as RuntimeId,
              ...(injectionMethod ? { injectionMethod: injectionMethod as InjectionMethod } : {}),
            },
            ...(capabilityManifest === undefined ? {} : { capabilityManifest }),
            ...(outputPrefix ? { outputPrefix } : {}),
          },
          deps.user,
        );
        store.put(profile);
        return json(summarize(profile));
      } catch (err) {
        // 例外をそのまま投げるとクライアントには通信断と区別が付かない。
        // 「合成できなかった」ことと理由を、成功と同じ形で返す。
        return json(
          { bound: false, reason: err instanceof Error ? err.message : String(err) },
          true,
        );
      }
    },
  );

  server.registerTool(
    "aiko.get_runtime_profile",
    {
      title: "合成済みの Runtime Profile を取得する",
      description:
        "profile_id を省略すると直近のものを返す。instructions 本文を含めるかは includeInstructions で選ぶ",
      inputSchema: {
        profileId: z.string().optional(),
        includeInstructions: z.boolean().optional(),
      },
    },
    async ({ profileId, includeInstructions }) => {
      const profile = profileId ? store.get(profileId) : store.latest();
      if (!profile) {
        return json({ found: false, reason: "該当する Runtime Profile がありません" }, true);
      }
      return json(
        includeInstructions === true
          ? { ...summarize(profile), instructions: profile.instructions }
          : summarize(profile),
      );
    },
  );

  server.registerTool(
    "aiko.report_capabilities",
    {
      title: "Capability Manifest を解釈する",
      description:
        "使える能力と、使えない能力（理由つき）に分ける。認証情報の値を含む宣言は拒否する",
      inputSchema: { capabilityManifest: z.unknown() },
    },
    async ({ capabilityManifest }) => {
      try {
        return json(new CapabilityRegistry().resolve(capabilityManifest));
      } catch (err) {
        return json({ reason: err instanceof Error ? err.message : String(err) }, true);
      }
    },
  );

  server.registerTool(
    "aiko.health",
    {
      title: "サーバーと人格の状態を返す",
      description: "人格を読めているか、Profile をいくつ保持しているかを返す",
      inputSchema: {},
    },
    async () => {
      try {
        const persona = await loadPersona();
        return json({
          server: { name: SERVER_NAME, version: SERVER_VERSION },
          persona: { id: persona.id, version: persona.version, invariantsPresent: persona.invariants.trim().length > 0 },
          profiles: store.size,
          status: "ok",
        });
      } catch (err) {
        return json(
          {
            server: { name: SERVER_NAME, version: SERVER_VERSION },
            status: "persona-unavailable",
            reason: err instanceof Error ? err.message : String(err),
          },
          true,
        );
      }
    },
  );

  return server;
}

/** §7.4: Tool の結果には Persona version と hash を必ず載せる。
 *  instructions 本文は既定で含めない（要求されたときだけ返す）。 */
function summarize(profile: {
  profile_id: string;
  profile_hash: string;
  configuration_hash: string;
  persona: { id: string; version: string };
  runtime: { id: string; consistency_level: number; injection_method: string };
  excluded_capabilities: Array<{ id: string; reason: string }>;
}) {
  return {
    bound: true,
    profile_id: profile.profile_id,
    profile_hash: profile.profile_hash,
    configuration_hash: profile.configuration_hash,
    persona: profile.persona,
    runtime: profile.runtime,
    excluded_capabilities: profile.excluded_capabilities,
  };
}

function json(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}
