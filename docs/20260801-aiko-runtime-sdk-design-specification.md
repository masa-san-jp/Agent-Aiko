---
title: Aiko Runtime SDK 設計仕様書
document_id: AIKO-RUNTIME-SDK-SPEC
version: 1.0.0-draft
status: Draft
created_at: 2026-08-01
repository: https://github.com/masa-san-jp/Agent-Aiko
related_document:
  - docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md
related_issue:
  - https://github.com/masa-san-jp/Agent-Aiko/issues/44
---

# Aiko Runtime SDK 設計仕様書

## 0. 文書の目的

本書は、Agent-Aikoにおける`runtime-sdk`の責務、公開API、依存関係、実行フロー、エラー処理、セキュリティ境界、Adapterとの契約、MCP Serverとの関係、移行方法および受入基準を定義する。

既存のAiko-MCP設計書では、`packages/runtime-sdk/`がリポジトリ構成に記載されている一方、その仕様が定義されていなかった。その結果、現在のClaude Code AdapterおよびCodex Adapterは、`binder`、`core`、`user-context`等へ直接依存している。

この状態のままAdapterを増やすと、各Adapterが以下を独自実装する可能性がある。

- 人格の解決
- User Contextの取得
- Capability Manifestの生成
- Runtime Profileの合成
- schema互換性判定
- fail-closed判定
- instruction生成
- profile hash生成
- 再バインド
- ログの秘匿
- エラーコード変換

これは、Aiko-MCPの中心目的である「異なるランタイムから呼び出しても、同じAiko人格を適用すること」を損なう。

`runtime-sdk`は、これらの処理を一つの公開契約へ集約し、すべてのRuntime Adapter、MCP Server、CLIが同一の実装を利用するための共通実行層である。

---

# 1. 結論

正式名称は以下とする。

```text
Package name: @agent-aiko/runtime-sdk
Directory:    packages/runtime-sdk/
```

責務は次の一文で定義する。

> Aiko Runtime SDKは、Persona、User Context、Capability、PermissionおよびRuntime情報を解決・検証・合成し、各ランタイムがAiko人格を安全かつ一貫して注入するための唯一の公開実行インターフェースである。

依存関係は以下とする。

```text
Persona Repository
User Context Provider
Capability Registry
Permission Resolver
        │
        ▼
@agent-aiko/core
        │
        ▼
@agent-aiko/binder
        │
        ▼
@agent-aiko/runtime-sdk
      ┌─┼───────────────┐
      ▼ ▼               ▼
MCP Server           CLI
      │
      ├─ Claude Code Adapter
      ├─ Codex Adapter
      ├─ Antigravity Adapter
      └─ Generic Adapter
```

Adapter、MCP Server、CLIは、人格を適用する通常処理において`core`や`binder`を直接呼び出してはならない。

---

# 2. 設計目標

## 2.1 必須目標

Runtime SDKは以下を実現する。

1. すべてのRuntime Adapterが同じバインディング手順を利用する
2. Claude Code、Codex、Antigravity等の違いをRuntime Profileへ明示する
3. 人格、ユーザー情報、能力、権限の解決失敗を統一的に処理する
4. Aiko人格を適用できない場合は、Aikoとして起動しない
5. 同じ入力から同じRuntime Profileおよび同じhashを再現する
6. User Profileおよび秘密情報を必要以上に公開しない
7. Adapterがホスト固有処理だけに集中できるようにする
8. MCP ServerとローカルAdapterの挙動を同一にする
9. Personaやschemaの更新に対する互換性判定を一箇所へ集約する
10. 将来のPolicy Engine、Response Validator、Remote Backendを追加できる

## 2.2 非目標

Runtime SDKは以下を直接実装しない。

- Claude Codeプロセスの起動
- Codexのthread開始
- Antigravity固有設定の編集
- ツール本体の実行
- ユーザーの認証情報管理
- 会話履歴全体の保存
- LLM推論
- MCP Transportの実装
- UIの提供
- モデル間の文章表現の完全一致

これらはAdapter、MCP Server、Host、Memory System等の責務とする。

---

# 3. 現状と変更後

## 3.1 現状

現在のClaude Code Adapterは、少なくとも以下へ直接依存している。

```text
@agent-aiko/binder
@agent-aiko/core
@agent-aiko/user-context
```

概念上の構造は次のとおりである。

```text
Claude Adapter ─┬─ Binder
                ├─ Core
                └─ User Context

Codex Adapter  ─┬─ Binder
                ├─ Core
                └─ User Context

MCP Server     ─┬─ Binder
                ├─ Core
                └─ User Context
```

各呼び出し元が、必要な処理順序やエラー処理を知る必要がある。

## 3.2 変更後

```text
Claude Adapter ─┐
Codex Adapter   ├─ Runtime SDK
MCP Server      ┤      │
CLI             ┘      ▼
                    Binder
                      │
               Core / Providers
```

Runtime Adapterは、原則として以下の2操作だけを行う。

1. Runtime情報とCapability情報を収集してRuntime SDKへ渡す
2. Runtime SDKが返したLaunch Bundleをホスト固有の方法で注入する

---

# 4. コンポーネント責務

## 4.1 Runtime SDK

Runtime SDKが所有する責務：

- Bind Requestの受付
- 入力schema検証
- Persona参照の解決
- User Contextの解決
- Capability Manifestの正規化
- Permission Manifestの解決
- Binderの呼び出し
- Runtime Profileの検証
- Runtime Profile hashの確認
- ランタイム別instruction生成
- consistency level判定
- fail-closed判定
- warningの正規化
- error codeの正規化
- profile provenanceの生成
- 再バインド
- health check
- Policy Engineへの接続
- Response Validatorへの接続
- redacted diagnosticsの生成

## 4.2 Binder

Binderが所有する責務：

- Persona、User、Capability、Permission、Runtime Contextの合成
- 優先順位に基づく競合解消
- 最小権限化
- Runtime Profile生成
- Runtime Profile schema検証
- 決定的なprofile hash生成

Binderは起動フローやAdapter固有の注入方法を知らない。

## 4.3 Core

Coreが所有する責務：

- Persona Packageの読取り
- 現行`~/.aiko/`形式および互換形式の解決
- Personaの構造化
- INVARIANTSの読取り
- 共通instruction要素の生成
- schema version互換性判定
- canonical serialization
- hash utility

## 4.4 Runtime Adapter

Adapterが所有する責務：

- ホストの検出
- ホストバージョンの取得
- ホスト組込みToolの検出
- MCP ServerおよびSkillの検出
- sandbox、approval、permission情報の取得
- Runtime SDKへのBind Request作成
- Launch Bundleのsystem/developer級への注入
- ホストプロセスまたはthreadの起動
- Injection Receiptの生成
- ホスト固有エラーの変換
- 更新、アンインストール時の設定編集

## 4.5 MCP Server

MCP Serverが所有する責務：

- MCP Resources、Prompts、Toolsの公開
- MCPリクエストをRuntime SDKのAPIへ変換
- Runtime SDKの結果をMCP responseへ変換
- MCP protocol errorへの変換
- Transport管理

MCP Serverは、BinderやCoreの処理を独自に再実装しない。

## 4.6 CLI

CLIが所有する責務：

- ユーザー入力
- 設定ファイルの管理
- status、doctor、bind、update等のコマンド
- Runtime SDKの結果の表示
- redaction済み診断情報の出力

---

# 5. アーキテクチャ

## 5.1 推奨パッケージ構造

```text
packages/runtime-sdk/
├─ package.json
├─ tsconfig.json
├─ README.md
├─ src/
│  ├─ index.ts
│  ├─ runtime-sdk.ts
│  ├─ launch-service.ts
│  ├─ instruction-service.ts
│  ├─ profile-service.ts
│  ├─ policy-service.ts
│  ├─ validation-service.ts
│  ├─ health-service.ts
│  ├─ diagnostics-service.ts
│  ├─ errors.ts
│  ├─ types.ts
│  ├─ constants.ts
│  └─ internal/
│     ├─ canonicalize.ts
│     ├─ provenance.ts
│     ├─ redaction.ts
│     └─ compatibility.ts
└─ test/
   ├─ bind-runtime.test.ts
   ├─ launch-bundle.test.ts
   ├─ fail-closed.test.ts
   ├─ determinism.test.ts
   ├─ compatibility.test.ts
   ├─ redaction.test.ts
   └─ adapter-contract.test.ts
```

## 5.2 依存方向

許可：

```text
runtime-sdk → binder
runtime-sdk → core（公開型と共通utilityに限る）
runtime-sdk → user-context
runtime-sdk → capability-registry
runtime-sdk → permission resolver
runtime-sdk → policy interface
runtime-sdk → profile store interface
```

禁止：

```text
core → runtime-sdk
binder → runtime-sdk
user-context → runtime-sdk
capability-registry → runtime-sdk
```

AdapterおよびMCP Serverの通常コードからの直接依存を禁止する。

```text
adapter-* → runtime-sdk
mcp-server → runtime-sdk
cli → runtime-sdk
```

## 5.3 循環依存の禁止

Runtime SDKは、Adapterの実装型をimportしない。

Adapter固有の情報は、共通の`RuntimeDescriptor`、`InjectionCapability`、`CapabilityManifest`として受け取る。

---

# 6. 公開API

## 6.1 エントリーポイント

```typescript
export interface AikoRuntimeSdk {
  prepareLaunch(request: PrepareLaunchRequest): Promise<RuntimeLaunchBundle>;

  verifyInjection(
    bundle: RuntimeLaunchBundle,
    receipt: InjectionReceipt
  ): Promise<VerifiedLaunch>;

  rebind(request: RebindRequest): Promise<RuntimeLaunchBundle>;

  getProfile(request: GetProfileRequest): Promise<RuntimeProfile>;

  compileInstructions(
    request: CompileInstructionsRequest
  ): Promise<CompiledInstructions>;

  evaluateAction(
    request: EvaluateActionRequest
  ): Promise<ActionDecision>;

  validateResponse(
    request: ValidateResponseRequest
  ): Promise<ResponseValidation>;

  health(request?: HealthRequest): Promise<RuntimeHealth>;

  diagnostics(
    request: DiagnosticsRequest
  ): Promise<RedactedDiagnostics>;
}
```

## 6.2 SDK生成

```typescript
export interface CreateRuntimeSdkOptions {
  binder: RuntimeProfileBinder;
  personaRepository: PersonaRepository;
  userContextProvider: UserContextProvider;
  capabilityRegistry: CapabilityRegistry;
  permissionResolver: PermissionResolver;
  profileStore?: RuntimeProfileStore;
  policyEvaluator?: PolicyEvaluator;
  responseValidator?: ResponseValidator;
  logger?: AikoLogger;
  clock?: Clock;
  idGenerator?: IdGenerator;
}

export function createRuntimeSdk(
  options: CreateRuntimeSdkOptions
): AikoRuntimeSdk;
```

Dependency Injectionを標準とし、グローバルなactive user、active persona、current projectを保持しない。

---

# 7. データ型

## 7.1 PrepareLaunchRequest

```typescript
export interface PrepareLaunchRequest {
  requestId: string;

  personaRef: {
    personaId: string;
    version?: string;
    overrideId?: string;
  };

  userRef: {
    userId: string;
    relationshipProfileId?: string;
  };

  runtime: RuntimeDescriptor;

  capabilityManifest: CapabilityManifest;

  permissionInput?: PermissionInput;

  taskContext?: TaskContext;

  injectionCapability: InjectionCapability;

  requestedConsistencyLevel: 1 | 2;

  previousProfileId?: string;
}
```

### 必須条件

- `requestId`は呼び出し側が生成する
- `personaId`と`userId`は明示する
- `runtime.id`と`runtime.version`を明示する
- Adapterは利用可能な注入手段を`injectionCapability`へ列挙する
- Level 2要求時はsystem/developer級注入手段を必須とする

## 7.2 RuntimeDescriptor

```typescript
export interface RuntimeDescriptor {
  id:
    | "claude-code"
    | "codex"
    | "antigravity"
    | "generic-mcp"
    | string;

  version: string;

  modelFamily?: string;

  hostId?: string;

  platform: {
    os: string;
    arch: string;
  };

  projectRoot?: string;

  processMode?: "interactive" | "print" | "service" | "api";
}
```

## 7.3 InjectionCapability

```typescript
export interface InjectionCapability {
  methods: InjectionMethod[];

  canInjectBeforeAgentLoop: boolean;

  canVerifyAppliedPayload: boolean;

  canReinjectAfterCompaction: boolean;
}

export interface InjectionMethod {
  id:
    | "system-prompt"
    | "system-prompt-file"
    | "append-system-prompt"
    | "append-system-prompt-file"
    | "developer-instructions"
    | "base-instructions"
    | "context-file"
    | string;

  priority: number;

  instructionLevel:
    | "system"
    | "developer"
    | "user"
    | "unknown";

  maxBytes?: number;
}
```

## 7.4 RuntimeLaunchBundle

```typescript
export interface RuntimeLaunchBundle {
  bundleId: string;
  requestId: string;

  profile: RuntimeProfile;

  compiledInstructions: CompiledInstructions;

  injectionPlan: InjectionPlan;

  consistencyLevel: 1 | 2;

  provenance: RuntimeProvenance;

  warnings: RuntimeWarning[];

  createdAt: string;

  expiresAt?: string;
}
```

## 7.5 CompiledInstructions

```typescript
export interface CompiledInstructions {
  targetRuntime: string;

  content: string;

  contentHash: string;

  format:
    | "plain-text"
    | "markdown"
    | "json";

  personaVersion: string;

  invariantsVersion?: string;

  compilerVersion: string;

  sections: {
    identity: boolean;
    invariants: boolean;
    behavior: boolean;
    relationship: boolean;
    capabilitySummary: boolean;
    permissionSummary: boolean;
    taskContext: boolean;
  };
}
```

## 7.6 InjectionPlan

```typescript
export interface InjectionPlan {
  method: InjectionMethod["id"];

  instructionLevel:
    | "system"
    | "developer"
    | "user";

  mustApplyBeforeAgentLoop: boolean;

  failClosed: boolean;

  expectedContentHash: string;

  adapterInstructions?: Record<string, unknown>;
}
```

## 7.7 InjectionReceipt

```typescript
export interface InjectionReceipt {
  bundleId: string;

  runtimeId: string;

  runtimeVersion: string;

  method: string;

  appliedContentHash: string;

  appliedBeforeAgentLoop: boolean;

  hostReference?: string;

  appliedAt: string;
}
```

## 7.8 VerifiedLaunch

```typescript
export interface VerifiedLaunch {
  bundleId: string;

  profileId: string;

  verified: true;

  consistencyLevel: 1 | 2;

  runtimeId: string;

  instructionHash: string;

  verifiedAt: string;
}
```

---

# 8. 起動フロー

## 8.1 標準フロー

```text
1. AdapterがRuntime、Tool、Skill、Permissionを検出
2. AdapterがPrepareLaunchRequestを作成
3. Runtime SDKが入力schemaを検証
4. Runtime SDKがPersonaを解決
5. Runtime SDKがUser Contextを解決
6. Runtime SDKがCapabilityを正規化
7. Runtime SDKがPermissionを解決
8. Runtime SDKがBinderを呼び出す
9. BinderがRuntime Profileを生成
10. Runtime SDKがProfile schemaとhashを検証
11. Runtime SDKがランタイム向けinstructionsを生成
12. Runtime SDKがInjection Planを選択
13. Runtime SDKがRuntime Launch Bundleを返す
14. Adapterがinstructionsを注入
15. AdapterがInjection Receiptを生成
16. Runtime SDKがhashと注入時点を検証
17. 検証成功後、AdapterがAgent Loopを開始
```

## 8.2 重要原則

Agent Loopは`verifyInjection`成功前に開始してはならない。

例外として、ホストAPIの制約上「注入と起動が単一操作」である場合、Adapterは次を満たす。

- 注入内容のhashを起動前に確定
- 起動APIへ渡したpayloadを記録
- 起動APIが失敗した場合は起動失敗として扱う
- 注入なしのfallback起動を行わない

## 8.3 Claude Code

```text
prepareLaunch
→ system-prompt-file等を選択
→ Claude CLIへ指定
→ Injection Receipt生成
→ Agent Loop開始
```

## 8.4 Codex

```text
prepareLaunch
→ baseInstructions生成
→ thread/startへ指定
→ threadIdとinstruction hashをReceiptへ記録
→ turn開始
```

## 8.5 Generic MCP Host

system/developer級の注入を保証できない場合、Level 2を返さない。

```text
requested Level 2
+ system/developer注入手段なし
→ AIKO_RUNTIME_INJECTION_UNSUPPORTED
```

Level 1を明示的に要求した場合のみ起動可能とする。

---

# 9. Fail Closed仕様

## 9.1 起動を拒否する条件

以下のいずれかに該当する場合、`prepareLaunch`はLaunch Bundleを返さない。

| 条件 | エラーコード |
|---|---|
| Persona Packageが見つからない | `AIKO_RUNTIME_PERSONA_NOT_FOUND` |
| Persona Packageのschemaが不正 | `AIKO_RUNTIME_PERSONA_INVALID` |
| INVARIANTSが欠落 | `AIKO_RUNTIME_INVARIANTS_MISSING` |
| User Profileが解決不能 | `AIKO_RUNTIME_USER_NOT_FOUND` |
| User Profileのschemaが不正 | `AIKO_RUNTIME_USER_INVALID` |
| schema versionが受理範囲外 | `AIKO_RUNTIME_SCHEMA_UNSUPPORTED` |
| Runtime Profile生成失敗 | `AIKO_RUNTIME_BIND_FAILED` |
| Runtime Profileのhash不一致 | `AIKO_RUNTIME_PROFILE_HASH_MISMATCH` |
| Level 2に必要な注入手段がない | `AIKO_RUNTIME_INJECTION_UNSUPPORTED` |
| PersonaとRuntimeが非互換 | `AIKO_RUNTIME_INCOMPATIBLE_RUNTIME` |
| Permission解決不能 | `AIKO_RUNTIME_PERMISSION_UNRESOLVED` |
| 競合規則を解決できない | `AIKO_RUNTIME_POLICY_CONFLICT` |

## 9.2 起動を継続できる条件

以下はwarningとして扱い、利用不能能力を除外して続行できる。

- 一部Toolが利用不能
- 一部Skillが見つからない
- optional memory namespaceが利用不能
- optional relationship fieldがない
- telemetryが利用不能
- cacheが利用不能
- 非必須のPolicy Evaluatorが未実装

ただし、黙って除外してはならない。

`RuntimeLaunchBundle.warnings`へ理由、対象、影響を記録する。

## 9.3 fallback禁止

禁止：

```text
Persona読取り失敗
→ 空のinstructionsで起動

User Profile失敗
→ default userを推測

Level 2注入失敗
→ user messageで人格を渡して起動

hash不一致
→ warningだけ出して継続
```

Aiko人格を保証できない場合、Aikoを名乗る実行を開始しない。

---

# 10. エラーモデル

## 10.1 RuntimeSdkError

```typescript
export class RuntimeSdkError extends Error {
  readonly code: RuntimeErrorCode;
  readonly severity: "warning" | "error" | "fatal";
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly remediation?: string;
  readonly details?: Record<string, unknown>;
  readonly cause?: unknown;
}
```

## 10.2 エラー出力要件

エラーには最低限以下を含める。

- 機械可読code
- ユーザー向け説明
- 再試行可能性
- 修復方法
- 失敗したcomponent
- requestId

秘密情報、Persona全文、User Profile全文、Tool引数全文を含めない。

## 10.3 Adapterエラー変換

Adapterはホスト固有エラーを`RuntimeAdapterError`へ変換する。

Runtime SDKのエラーコードを別の意味へ置き換えてはならない。

---

# 11. 再バインド

## 11.1 再バインド条件

次の場合に再バインドする。

- Persona version変更
- override変更
- User Profile変更
- Relationship Profile変更
- Tool追加・削除
- Skill追加・削除
- Permission変更
- Runtime version変更
- project変更
- context compaction後の再注入
- profile expiration
- security policy更新

## 11.2 RebindRequest

```typescript
export interface RebindRequest {
  requestId: string;
  previousProfileId: string;
  reason:
    | "persona-changed"
    | "user-context-changed"
    | "capability-changed"
    | "permission-changed"
    | "runtime-changed"
    | "project-changed"
    | "compaction"
    | "manual";

  overrides?: Partial<PrepareLaunchRequest>;
}
```

## 11.3 再バインド結果

新しいProfileは新しい`profileId`およびhashを持つ。

旧Profileを上書きしない。

Codex等、スレッド存続中にinstructionsを変更できないRuntimeでは、Adapterへ`restartRequired: true`を返す。

---

# 12. Policy EngineおよびResponse Validator

## 12.1 現時点の扱い

Policy EngineおよびResponse Validatorが未実装でも、Runtime SDKのinterfaceは先に固定する。

未提供の場合：

```text
evaluateAction
→ AIKO_RUNTIME_FEATURE_UNAVAILABLE

validateResponse
→ AIKO_RUNTIME_FEATURE_UNAVAILABLE
```

`prepareLaunch`の必須処理にはしない。ただしPersona INVARIANTSとschema検証は必須である。

## 12.2 将来の責務

### evaluateAction

- 不可逆操作
- 承認要否
- INVARIANTSとの衝突
- Permissionとの衝突
- ユーザー要求と人格原則の競合

### validateResponse

- 呼び名
- 一人称
- 明示的禁止表現
- 人格自己認識
- 重大な価値観違反
- 不確実性表現
- 関係性の整合性

---

# 13. セキュリティ・プライバシー

## 13.1 Runtime SDKが扱ってよい情報

- Personaの公開・ローカル定義
- preferred name
- address style
- communication preference
- relationship stateの必要最小限
- Tool名
- Skill名
- 権限scope
- Runtime version
- project root
- profile hash

## 13.2 扱ってはならない情報

- API Key
- OAuth Token
- Cookie
- SSH秘密鍵
- メール本文全体
- カレンダー本文全体
- 会話履歴全体
- Toolの秘密引数
- Credential Providerの内部値

Capability Manifestには認証情報ではなく、利用可能性とCredential Provider参照だけを含める。

## 13.3 Redaction

ログおよびdiagnosticsでは以下を秘匿する。

- userIdの外部公開可能性がない場合はhash化
- ホームディレクトリを`~`へ置換
- token形式の文字列
- URL query
- 環境変数値
- Tool引数
- relationship memory本文

## 13.4 権限

Runtime SDKはCapabilityの存在だけで利用許可を判断しない。

Permission Resolverの結果を必須とする。

---

# 14. 決定性とhash

## 14.1 決定性要件

同じ以下の入力から、同じProfile content hashを生成する。

- Persona content
- Persona version
- User Context
- Capability Manifest
- Permission Manifest
- Runtime Descriptor
- Task Context
- compiler version
- schema version

生成時刻、requestId、bundleId等はcontent hash対象から除外する。

## 14.2 canonicalization

- object keyを辞書順へ整列
- 未定義値を除外
- 配列は意味に応じて順序を固定
- 改行をLFへ統一
- Unicode normalizationをNFCへ統一
- canonical JSONをhash対象とする
- hashはSHA-256を標準とする

## 14.3 Profile ID

```text
profileId = "rp_" + first_24_chars(sha256(canonical_profile))
```

Profile IDだけで完全性を検証せず、完全な`contentHash`も保持する。

---

# 15. Profile Store

## 15.1 標準

Runtime SDKはProfile Storeをoptional dependencyとして扱う。

標準ローカル実装：

```text
~/.cache/aiko/runtime-profiles/
```

## 15.2 保存対象

- Runtime Profile
- profile hash
- provenance
- compiled instruction hash
- warning
- createdAt
- expiresAt

## 15.3 保存しないもの

- 認証情報
- 会話全文
- Tool実行結果全文
- ユーザー記憶本文

## 15.4 stateless対応

Profile Storeがなくても、すべての処理は明示的な入力で実行可能でなければならない。

MCP Serverのリモート構成では、接続やプロセスをセッション境界として扱わない。

---

# 16. MCP Serverとの契約

## 16.1 Tool対応

| MCP Tool | Runtime SDK |
|---|---|
| `aiko.bind_runtime` | `prepareLaunch` |
| `aiko.get_runtime_profile` | `getProfile` |
| `aiko.compile_instructions` | `compileInstructions` |
| `aiko.evaluate_action` | `evaluateAction` |
| `aiko.validate_response` | `validateResponse` |
| `aiko.health` | `health` |

MCP Serverは、Runtime SDKの結果をそのまま公開可能な形式へ変換する。

## 16.2 MCP固有処理

MCP Serverだけが所有する処理：

- MCP input schema
- MCP result schema
- JSON-RPC error変換
- MCP Resource URI
- Prompt定義
- Transport
- protocol version negotiation

## 16.3 挙動一致

同じBind Request相当の入力に対し、ローカルAdapter経由とMCP Tool経由で同一のRuntime Profile content hashを返さなければならない。

---

# 17. Adapter Contract

## 17.1 AdapterがRuntime SDKへ渡すもの

- Runtime Descriptor
- Injection Capability
- Capability Manifest
- Permission Input
- Task Context
- Persona Ref
- User Ref

## 17.2 AdapterがRuntime SDKから受け取るもの

- Runtime Launch Bundle
- Compiled Instructions
- Injection Plan
- Profile hash
- consistency level
- warning
- fail-closed結果

## 17.3 Adapterの禁止事項

Adapterは以下を行ってはならない。

- Personaファイルを直接読む
- INVARIANTSを直接合成する
- Runtime Profileを独自生成する
- schema versionを独自判定する
- profile hashを独自生成する
- User Contextを直接fallbackする
- fail-closed条件を緩和する
- Level 2を独自認定する
- SDKが拒否した起動を強制続行する

## 17.4 例外

開発・移行用の診断コードで直接読取りが必要な場合は、通常起動経路から分離し、公開APIとして利用しない。

---

# 18. CLIとの契約

以下のCLIコマンドはRuntime SDKを利用する。

```text
aiko bind
aiko status
aiko doctor
aiko profile show
aiko profile export
aiko adapters test
```

`aiko doctor`はRuntime SDKの`health`と`diagnostics`を利用し、Adapter固有診断を追加する。

---

# 19. バージョンと互換性

## 19.1 SemVer

`@agent-aiko/runtime-sdk`は独立したSemVerを持つ。

```text
0.x 仕様確定前
1.x 公開契約安定
```

## 19.2 schema互換性

Aiko-MCP全体の方針に従い、現行schema versionとその1つ前までを受理する。

それより古いversionは拒否し、以下を返す。

- 入力version
- 受理可能version
- migration方法
- 関連コマンド

## 19.3 Adapter互換性

Adapterはpackage.jsonまたは機械可読Manifestで対応SDK範囲を宣言する。

```json
{
  "aikoRuntimeSdk": {
    "min": "1.0.0",
    "maxTested": "1.3.x"
  }
}
```

## 19.4 API廃止

- 最低1 minorのdeprecated期間
- 破壊的変更はmajorで行う
- migration guideを提供
- deprecated API使用時にwarningを返す

---

# 20. テスト仕様

## 20.1 Unit Test

- request validation
- Persona解決
- User Context解決
- Capability正規化
- Permission解決
- instruction生成
- injection method選択
- error変換
- redaction
- canonicalization
- hash

## 20.2 Contract Test

すべてのAdapterへ共通のcontract test suiteを提供する。

```typescript
runRuntimeAdapterContract({
  adapter,
  sdk,
  fixtures
});
```

検証：

- SDK以外から人格を読まない
- Level 2注入手段を正しく報告
- content hashを変更しない
- Injection Receiptを返す
- fail-closedを迂回しない

## 20.3 Cross-runtime Test

同じFixtureを以下へ渡す。

- Claude Code Adapter
- Codex Adapter
- MCP Server
- 将来のAntigravity Adapter

期待：

- Runtime Profile content hashが一致
- Persona versionが一致
- Invariants versionが一致
- User relationship hashが一致
- Capability差分以外の人格部分が一致

## 20.4 Fail Closed Test

以下を1つずつ欠落させる。

- Persona
- INVARIANTS
- User Profile
- injection method
- supported schema
- permission
- hash

すべて起動拒否となること。

## 20.5 Determinism Test

同一入力を100回処理し、同じcontent hashが生成されること。

## 20.6 Security Test

- token redaction
- path redaction
- malformed manifest
- oversized input
- path traversal
- prototype pollution
- schema bomb
- log injection

## 20.7 Acceptance Test

Claude CodeとCodexで同じPersona Fixtureを用い、両方が同じprofile hashを表示すること。

---

# 21. パフォーマンス要件

ローカル標準環境における目標値：

| 処理 | 目標 |
|---|---:|
| cached prepareLaunch | 100ms以下 |
| uncached prepareLaunch | 500ms以下 |
| compileInstructions | 100ms以下 |
| health | 200ms以下 |
| diagnostics | 2秒以下 |

LLMを利用するPolicy評価およびResponse Validationは対象外とする。

最大入力：

- Persona Package: 1MB
- User Profile: 256KB
- Capability Manifest: 1MB
- Permission Manifest: 512KB
- Compiled Instructions: 512KB

超過時は明示的に拒否する。

---

# 22. 可観測性

## 22.1 ログ項目

- requestId
- bundleId
- profileId
- runtimeId
- personaId
- personaVersion
- SDK version
- Adapter version
- processing duration
- warning code
- error code

## 22.2 記録禁止

- compiled instruction全文
- Persona全文
- User Profile全文
- relationship memory本文
- 認証情報
- Tool引数全文

## 22.3 Trace

将来のOpenTelemetry対応を想定し、trace contextをoptionで受け取る。

```typescript
interface TraceContext {
  traceparent?: string;
  tracestate?: string;
}
```

---

# 23. 移行計画

## Phase R0：仕様固定

成果物：

- 本設計書
- Runtime SDKの型定義
- Adapter Contract
- Error Code一覧
- Launch Bundle schema

完了基準：

- Claude Code Adapter、Codex Adapter、MCP Serverの既存処理を対応付けられる
- 未定義の責務がない

## Phase R1：Facade実装

`packages/runtime-sdk`を追加し、既存Binderを呼ぶ薄いFacadeを実装する。

この段階では挙動を変更しない。

成果物：

- `prepareLaunch`
- `getProfile`
- `compileInstructions`
- `health`
- 共通error model
- test

## Phase R2：MCP Server移行

MCP Serverの直接Binder依存をRuntime SDKへ置換する。

完了基準：

- 既存MCP testが維持
- profile hashが移行前後で同じ
- MCP ServerからBinderの直接importがない

## Phase R3：Claude Code Adapter移行

依存を以下へ変更する。

変更前：

```text
binder
core
user-context
```

変更後：

```text
runtime-sdk
```

完了基準：

- 実起動テスト成功
- fail-closed維持
- profile hash維持
- 直接import禁止テスト成功

## Phase R4：Codex Adapter移行

Claude Codeと同じ基準で移行する。

Codexの既存`codex/src`統合も、Runtime SDKを入口とする。

## Phase R5：CLI移行

status、doctor、profile表示をRuntime SDKへ統一する。

## Phase R6：Adapter境界の強制

ESLintまたはdependency-cruiser等で以下をCI違反とする。

```text
adapter-* → binder
adapter-* → core
adapter-* → user-context
mcp-server → binder
cli → binder
```

許可する依存は`runtime-sdk`だけとする。

## Phase R7：Policy・Response Validation

Policy EngineおよびResponse ValidatorをRuntime SDKへ接続する。

---

# 24. リポジトリ変更案

```text
packages/
├─ core/
├─ binder/
├─ user-context/
├─ capability-registry/
├─ runtime-sdk/              # 新設
├─ mcp-server/
├─ adapter-claude-code/
├─ adapter-codex/
└─ cli/
```

`runtime-sdk/package.json`案：

```json
{
  "name": "@agent-aiko/runtime-sdk",
  "version": "0.1.0",
  "description": "Agent-Aiko共通Runtime SDK。人格・ユーザー・能力・権限を一貫して解決し、各Adapter向けLaunch Bundleを生成する。",
  "private": true,
  "type": "module",
  "engines": {
    "node": ">=20"
  },
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "dependencies": {
    "@agent-aiko/binder": "*",
    "@agent-aiko/core": "*",
    "@agent-aiko/user-context": "*",
    "@agent-aiko/capability-registry": "*"
  }
}
```

Permission Resolverが独立packageになった段階で依存へ追加する。

---

# 25. 受入基準

Runtime SDKの初期実装は、以下をすべて満たしたとき完了とする。

1. `packages/runtime-sdk`が存在する
2. 公開APIが本書と一致する
3. MCP ServerがRuntime SDKを利用する
4. Claude Code AdapterがRuntime SDKだけを利用する
5. Codex AdapterがRuntime SDKだけを利用する
6. 同一Fixtureから同一profile hashを返す
7. Persona欠落時にすべての入口が同じerror codeで停止する
8. INVARIANTS欠落時に起動しない
9. Level 2注入不能時に起動しない
10. ToolやSkillの一部欠落はwarningとして継続できる
11. User Profileおよび秘密情報がログへ出ない
12. schema現行版と1つ前を受理する
13. AdapterからBinder/Coreへの直接importをCIで禁止する
14. 既存115件以上のテストを破壊しない
15. Runtime SDK追加分のcontract、fail-closed、determinismテストが成功する
16. Claude Code実起動テストが成功する
17. CodexのbaseInstructions生成テストが成功する
18. MCP stdio往復テストが成功する
19. 移行前後で人格instructionsの意味的内容が変わらない
20. READMEとAiko-MCP設計書へRuntime SDK仕様への参照を追加する

---

# 26. 設計判断

## 26.1 Runtime SDKを削除せず実装する理由

`runtime-sdk`を設計書から削除し、各AdapterがBinderを直接利用する設計も技術的には可能である。

しかしその場合、Adapterごとに以下が分散する。

- 起動フロー
- error変換
- consistency level
- injection plan
- 再バインド
- diagnostics
- Policy接続
- Response Validation接続

Aiko-MCPの価値は、単に同じPersonaファイルを読むことではなく、同じ手順で人格を適用することにある。

したがってRuntime SDKは必要である。

## 26.2 MCP Client SDKではない

本Runtime SDKは、MCP Serverへ接続するだけのクライアントライブラリではない。

ローカルAdapterとMCP Serverの双方が利用する共通Application Layerである。

```text
誤り:
Adapter → MCP Client → MCP Server → Binder

標準:
Adapter → Runtime SDK → Binder
MCP Server → Runtime SDK → Binder
```

これにより、起動前のsystem/developer級注入にMCP Tool Callを必須とせず、同時にMCP経由とローカル経由の挙動を一致させる。

将来リモートAiko-MCPへ接続する場合は、Runtime SDKへRemote Backendを追加できる。

## 26.3 状態を暗黙保持しない

Runtime SDKは`currentUser`、`activePersona`、`currentProject`をグローバル状態として保持しない。

毎回のrequestまたは明示的なProfile参照で指定する。

これはMCP 2026系のステートレス設計とも整合する。

---

# 27. 最終構造

```text
                    Persona Repository
                           │
                    User Context Provider
                           │
                    Capability Registry
                           │
                    Permission Resolver
                           │
                           ▼
                    @agent-aiko/core
                           │
                           ▼
                    @agent-aiko/binder
                           │
                           ▼
                  @agent-aiko/runtime-sdk
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
       MCP Server         CLI       Runtime Adapters
                                      ├─ Claude Code
                                      ├─ Codex
                                      ├─ Antigravity
                                      └─ Generic
```

この構造により、Aiko人格の読取り、合成、互換性判定、fail-closed、instruction生成、hash、診断は一箇所へ集約される。

各Adapterで異なってよいのは、Tool、Skill、Permission、注入方法、Host操作である。

各Adapterで異なってはいけないのは、Aikoが誰であり、どの規則を守り、どの条件でAikoとして起動できるかである。
