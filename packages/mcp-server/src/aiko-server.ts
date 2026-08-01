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
import { CapabilityRegistry } from "@agent-aiko/capability-registry";
// 型も含め、SDK から受け取る。型のためだけの import も依存として残るため
// （SDK 設計書 §1・R3 の直接 import 禁止テスト）。
import {
  createRuntimeSdk,
  EvaluateActionRequestSchema,
  RuntimeSdkError,
  SemanticBudget,
  ValidateResponseRequestSchema,
  type BinderRuntimeId as RuntimeId,
  type InjectionCapability,
  type InjectionMethod,
  type PersonaRepository,
  type PersonaSnapshot,
  type ResolvedUserContext,
  type CreateRuntimeSdkOptions,
  type RuntimeId as SdkRuntimeId,
} from "@agent-aiko/runtime-sdk";
import { ProfileStore } from "./profile-store.js";
import { registerPrompts } from "./prompts.js";

export const SERVER_NAME = "aiko-mcp";
export const SERVER_VERSION = "0.1.0";

export interface AikoServerDeps {
  personaRepository: PersonaRepository;
  /** User Profile の解決結果。取得の仕方（ファイル／別経路）はサーバーの外で決める。 */
  user: ResolvedUserContext;
  personaId?: string;
  profileStore?: ProfileStore;
  /** Policy Engine / Response Validator の設定。渡さなければ両 Tool は
   *  「この起動では使えない」と返す（R7 §9）。 */
  policy?: CreateRuntimeSdkOptions["policy"];
  responseValidation?: CreateRuntimeSdkOptions["responseValidation"];
  clock?: () => Date;
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
  // R2: Binder を直接呼ばない（SDK 設計書 §1・§23 R2 の完了基準）。生成も SDK に
  // 任せる。型だけは MCP の公開スキーマが Binder の綴りで固定されているので使う。
  const sdk = createRuntimeSdk({
    personaRepository: deps.personaRepository,
    user: deps.user,
    // MCP サーバーが元から持っている置き場をそのまま使う。SDK 側に別の置き場を
    // 持たせると、bind した Profile と get_runtime_profile が見る Profile がずれる。
    profileStore: store,
    ...(deps.policy ? { policy: deps.policy } : {}),
    ...(deps.responseValidation ? { responseValidation: deps.responseValidation } : {}),
    ...(deps.clock ? { clock: deps.clock } : {}),
  });

  // MCP の公開スキーマ（§7.4）は Binder の綴りで固定されている。SDK は別の綴りを
  // 使うので、ここで写す。**公開面は変えない**（§16.3 挙動一致）。
  const TO_SDK_RUNTIME: Record<RuntimeId, SdkRuntimeId> = {
    "claude-code": "claude-code",
    codex: "codex",
    "antigravity-cli": "antigravity",
    "generic-mcp-host": "generic-mcp",
  };
  // Binder が持っていた「ランタイムごとの到達レベル」。SDK には要求レベルを渡す
  // 必要があるので、移行前と同じ判定になるようここに写す。
  const REQUESTED_LEVEL: Record<RuntimeId, 1 | 2> = {
    "claude-code": 2,
    codex: 2,
    "antigravity-cli": 1,
    "generic-mcp-host": 1,
  };

  let requestSeq = 0;
  const nextRequestId = (): string => `mcp-${++requestSeq}`;

  const bindThroughSdk = async (
    runtime: RuntimeId,
    injectionMethod: InjectionMethod | undefined,
    capabilityManifest: unknown,
    outputPrefix: string | undefined,
  ) => {
    const injectionCapability: InjectionCapability =
      injectionMethod && injectionMethod !== "none"
        ? { systemLevel: [injectionMethod] }
        : { systemLevel: [] };
    const bundle = await sdk.prepareLaunch({
      requestId: nextRequestId(),
      personaRef: { personaId },
      userRef: { userId: deps.user.context.id },
      runtime: { id: TO_SDK_RUNTIME[runtime], version: SERVER_VERSION },
      injectionCapability,
      requestedConsistencyLevel: REQUESTED_LEVEL[runtime],
      ...(capabilityManifest === undefined ? {} : { capabilityManifest }),
      ...(outputPrefix ? { outputPrefix } : {}),
    });
    return bundle.profile;
  };

  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const loadPersona = (): Promise<PersonaSnapshot> =>
    deps.personaRepository.load({ id: personaId });

  // §7.3 Prompts。system 級に注入できないホスト（§8.4）が、会話の先頭で人格を
  // 置くための口。合成には Binder を通す——ここで独自に組み立てると、Adapter が
  // 注入するものと違う人格が Prompt から出る。
  registerPrompts(server, {
    compileInstructions: async () => {
      const compiled = await sdk.compileInstructions({
        requestId: nextRequestId(),
        personaRef: { personaId },
        userRef: { userId: deps.user.context.id },
        runtime: { id: "generic-mcp", version: SERVER_VERSION },
      });
      return { instructions: compiled.content, personaVersion: compiled.personaVersion };
    },
  });

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
        const profile = await bindThroughSdk(
          runtime as RuntimeId,
          injectionMethod as InjectionMethod | undefined,
          capabilityManifest,
          outputPrefix,
        );
        return json(summarize(profile));
      } catch (err) {
        // 例外をそのまま投げるとクライアントには通信断と区別が付かない。
        // 「合成できなかった」ことと理由を、成功と同じ形で返す。
        // SDK のエラーは利用者向けの文言を持っているので、それを使う（§10.2）。
        const reason =
          err instanceof RuntimeSdkError
            ? err.userMessage
            : err instanceof Error
              ? err.message
              : String(err);
        return json({ bound: false, reason }, true);
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

  // R7-5: SDK 直呼びと同じ結果を返す口。**判定はここに書かない。**
  // MCP 側に判定を1行でも足すと、同じ入力で SDK と MCP の答えが割れる（§12.3）。
  server.registerTool(
    "aiko.evaluate_action",
    {
      title: "操作を実行してよいか判定する",
      description:
        "allow / allow_with_warning / require_approval / deny のいずれかと、その理由を返す。Policy Engine が登録されていなければ、その旨を返す",
      inputSchema: EvaluateActionRequestSchema.shape,
    },
    async (args) => {
      // MCP は shape から自前で schema を組むため strict が効かない。
      // 未知のキーを弾くのは元の schema でしかできない（§6）。
      const parsed = EvaluateActionRequestSchema.safeParse(args);
      if (!parsed.success) {
        return json({ evaluated: false, reason: parsed.error.issues[0]?.message ?? "入力が不正です" }, true);
      }
      try {
        // 上限は1ターン3回（§5.3）。Tool 1回の呼び出しを1ターンとして数える。
        return json(await sdk.evaluateAction(parsed.data, { budget: new SemanticBudget() }));
      } catch (err) {
        return json({ evaluated: false, reason: reasonOf(err) }, true);
      }
    },
  );

  server.registerTool(
    "aiko.validate_response",
    {
      title: "応答が人格の宣言に沿っているか検査する",
      description:
        "valid / valid_with_warnings / revision_required / blocked のいずれかを返す。照合元は Runtime Profile で、呼び名などを別入力で渡すことはできない",
      inputSchema: ValidateResponseRequestSchema.shape,
    },
    async (args) => {
      const parsed = ValidateResponseRequestSchema.safeParse(args);
      if (!parsed.success) {
        return json({ validated: false, reason: parsed.error.issues[0]?.message ?? "入力が不正です" }, true);
      }
      try {
        return json(await sdk.validateResponse(parsed.data));
      } catch (err) {
        return json({ validated: false, reason: reasonOf(err) }, true);
      }
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
      // §16.1 の対応表どおり SDK の health を使う。SDK は投げずに状態を返すので、
      // ここでは MCP の形へ写すだけ。公開する形は変えない（§16.3）。
      const health = await sdk.health({ requestId: nextRequestId(), personaId });
      if (health.status === "unavailable") {
        return json(
          {
            server: { name: SERVER_NAME, version: SERVER_VERSION },
            status: "persona-unavailable",
            reason: health.reason ?? "人格を読めません",
          },
          true,
        );
      }
      return json({
        server: { name: SERVER_NAME, version: SERVER_VERSION },
        persona: health.persona,
        profiles: store.size,
        status: "ok",
      });
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

/** 例外を「なぜできなかったか」に写す。SDK のエラーは利用者向けの文言を持つ（§10.2）。 */
function reasonOf(err: unknown): string {
  if (err instanceof RuntimeSdkError) return err.userMessage;
  return err instanceof Error ? err.message : String(err);
}

function json(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    ...(isError ? { isError: true } : {}),
  };
}
