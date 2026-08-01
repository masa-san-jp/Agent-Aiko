---
title: Aiko Runtime SDK R7 Policy Engine / Response Validator 設計仕様書
document_id: AIKO-RUNTIME-SDK-R7-POLICY-VALIDATION-SPEC
version: 1.0.0-draft
status: Draft
created_at: 2026-08-01
repository: https://github.com/masa-san-jp/Agent-Aiko
related_documents:
  - docs/20260730-aiko-mcp-usage-distribution-maintenance-design.md
  - docs/20260801-aiko-runtime-sdk-design-specification.md
related_issue:
  - https://github.com/masa-san-jp/Agent-Aiko/issues/44
---

# Aiko Runtime SDK R7 Policy Engine / Response Validator 設計仕様書

## 0. 目的

本書は、Aiko Runtime SDKのR7で未確定となっている以下の2機能を仕様化する。

```typescript
evaluateAction(request: EvaluateActionRequest): Promise<ActionDecision>;
validateResponse(request: ValidateResponseRequest): Promise<ResponseValidation>;
```

対象は、判定結果、強制力、承認主体、判定基準、呼出頻度、照合元、4型の定義、既存設計書間の矛盾解消である。

---

# 1. 基本方針

Policy EngineとResponse Validatorは、**構造化規則とモデル判定を組み合わせるハイブリッド方式**とする。

```text
構造化規則
- 権限
- 承認要否
- 不可逆性
- 明示的禁止事項
- 呼び名
- 一人称
- 必須表現
- 禁止表現
- schemaで表現可能な不変条項

モデル判定
- 人格価値観との重大な衝突
- 関係性の不自然さ
- 不確実性表現の妥当性
- 人格自己認識の意味的逸脱
- ユーザー要求と人格原則の競合
```

強制停止できるのは原則として次である。

- 構造化された権限違反
- 構造化された安全・禁止規則違反
- `enforcement: block`の規則
- HostまたはOrganization Policyによる拒否

モデル判定だけを根拠として不可逆的に拒否してはならない。モデル判定は警告、承認要求、修正要求、監査記録に用いる。

---

# 2. evaluateActionの判定結果

判定結果は4種類とする。

```text
allow
allow_with_warning
require_approval
deny
```

## 2.1 allow

そのまま実行できる。

## 2.2 allow_with_warning

実行可能だが、非致命的な懸念がある。

例：

- 可逆だが影響範囲が広い
- 推奨手順から外れている
- 情報不足だが安全に試行できる
- 人格原則との軽微な緊張がある

## 2.3 require_approval

実行前に承認が必要である。

対象例：

- 不可逆操作
- 外部公開
- 課金
- 本番環境変更
- データ削除
- 権限昇格
- ユーザー本人しか決定できない価値判断
- モデル判定で重大な人格原則との衝突が疑われる

## 2.4 deny

実行してはならない。

対象例：

- 権限外操作
- 明示的禁止規則違反
- 承認では解除できないOrganization Policy違反
- 保護対象ファイルの変更禁止
- 改ざんされたRuntime Profileによる操作
- 既知の安全境界違反

## 2.5 severity

判定とは別に以下を持つ。

```text
info
low
medium
high
critical
```

## 2.6 confidence

モデル判定を含む場合は`0.0-1.0`のconfidenceを持つ。構造化規則だけで決定した場合は原則`1.0`とする。

## 2.7 承認主体

`require_approval`は承認主体を明示する。

```text
user
repository_owner
organization_admin
security_admin
runtime_host
external_system
```

標準は`user`。承認主体はPolicy RuleまたはPermission Manifestで指定し、Adapterは推測しない。

---

# 3. 強制停止と誤判定

## 3.1 enforcement mode

Policy Ruleごとに以下を定義する。

```text
observe
warn
approve
block
```

- `observe`: 記録のみ
- `warn`: 警告するが実行可能
- `approve`: 承認まで停止
- `block`: 承認でも解除不可

## 3.2 deny時

Adapterは対象操作を実行してはならない。

禁止事項：

- 警告だけ出して続行
- 別Toolへ置き換えて同じ結果を実行
- Actionを分割して回避
- モデルが独自判断で上書き
- fallback pathで実行

## 3.3 require_approval時

承認取得前は停止する。承認は以下に紐づける。

- action hash
- policy version
- profile id
- scope
-有効期限
-承認者
-承認時刻

操作内容が変わった場合、承認は無効。

## 3.4 誤判定への対応

- 構造化規則による`deny`はその場で解除不可
- モデル判定による重大懸念は原則`require_approval`
- emergency overrideは初期版では実装しない

判定不能時：

```text
可逆・低影響
→ allow_with_warning

不可逆・外部影響・高権限
→ require_approval

権限情報そのものが欠落
→ deny
```

---

# 4. 判定基準

案Cを採用する。

> 判定可能な項目を構造化し、意味的な人格判断だけをモデルへ委ねる。

現行の日本語INVARIANTSは正本として維持し、機械判定対象だけに補助メタデータを付与する。

```yaml
invariants:
  - id: no-unconfirmed-destructive-change
    text: 確認なく破壊的変更を行わない
    machine_policy:
      category: approval
      action_types:
        - delete
        - overwrite
        - force-push
      enforcement: approve
      approval_authority: user
```

`text`が人格・人間向けの正本、`machine_policy`が実行制御用の派生定義である。

## 4.1 PolicyRule

```typescript
export interface PolicyRule {
  id: string;
  version: string;
  category:
    | "permission"
    | "approval"
    | "irreversibility"
    | "persona-invariant"
    | "safety"
    | "privacy"
    | "relationship"
    | "response-style"
    | "organization";
  description: string;
  matcher: StructuredMatcher | SemanticMatcher;
  enforcement: "observe" | "warn" | "approve" | "block";
  approvalAuthority?: ApprovalAuthority;
  priority: number;
  enabled: boolean;
  source: PolicySource;
  remediation?: string;
}
```

## 4.2 優先順位

```text
1. Host safety policy
2. Organization policy
3. Permission Manifest
4. Structured persona invariants
5. User privacy policy
6. User approval policy
7. Semantic persona evaluation
8. Advisory best practices
```

上位の`deny`を下位規則で解除できない。

---

# 5. 呼出頻度と性能

## 5.1 evaluateAction必須対象

- 外部副作用
- データ書換え
- ファイル削除・上書き
- Git commit、push、merge、issue変更
- メール送信
- Calendar変更
- 課金・購入
- 権限変更
- 本番環境変更
- 個人情報の外部送信
-秘密情報へのアクセス
- Permission Manifestで評価必須のTool
- Adapterが高リスク分類した操作

原則対象外：

- 読取り専用検索
- ローカルの一時解析
-純粋計算
-副作用のないformat変換
-モデル内部推論

## 5.2 2段階評価

```text
Stage 1: deterministic evaluation
Stage 2: semantic evaluation
```

Stage 1目標：

```text
p50 5ms以下
p95 20ms以下
p99 50ms以下
```

Stage 2は、構造化規則で決定できない場合だけ呼ぶ。

```text
local model 2秒以内
remote model 5秒以内
```

タイムアウト時：

```text
低リスク・可逆
→ allow_with_warning

高リスク・不可逆・外部影響
→ require_approval
```

## 5.3 上限

```text
deterministic evaluation: 制限なし
semantic evaluation: 1ターン3回まで
response semantic validation: 最終応答1回まで
```

同一action hash、profile id、policy versionはキャッシュする。不可逆操作はキャッシュしない。

---

# 6. validateResponseの照合元

正本はRuntime Profileとする。

Runtime Profileから取得する情報：

- preferred name
- address style
- first-person rule
- persona identity
- invariants
- behavior contract
- relationship profile
- language preference
- uncertainty policy
- prohibited expressions
- required disclosures

呼出側が毎回、正しい呼び名等を別入力で渡してはならない。

Requestには以下だけを持たせる。

```typescript
profileRef: {
  profileId: string;
  contentHash: string;
}
```

## 6.1 deterministic checks

- preferred name
- 一人称
- 明示的禁止語
- 必須prefix
-出力言語
-秘密情報の混入
-禁止された断定表現
- required disclaimer

## 6.2 semantic checks

- Aiko自身の自己認識
-人格価値観との重大な矛盾
-関係性の不自然な変化
-不確実な内容の断定
-ユーザーとの距離感
-拒否時の姿勢
-自律性と確認境界

---

# 7. 型定義

## 7.1 EvaluateActionRequest

```typescript
export interface EvaluateActionRequest {
  requestId: string;
  profileRef: RuntimeProfileRef;
  action: CandidateAction;
  context?: ActionEvaluationContext;
  requestedMode?: "enforce" | "advisory";
  timeoutMs?: number;
  traceContext?: TraceContext;
}

export interface RuntimeProfileRef {
  profileId: string;
  contentHash: string;
}

export interface CandidateAction {
  actionId: string;
  type: string;
  toolId?: string;
  operation?: string;
  summary: string;
  arguments?: Record<string, unknown>;
  targets?: ActionTarget[];
  effects: {
    external: boolean;
    irreversible: boolean;
    production: boolean;
    financial: boolean;
    privacyRelevant: boolean;
  };
  requestedPermissions?: string[];
  proposedBy: "model" | "user" | "adapter" | "automation";
}

export interface ActionTarget {
  type:
    | "file"
    | "repository"
    | "issue"
    | "email"
    | "calendar-event"
    | "database"
    | "service"
    | "user"
    | "other";
  identifier: string;
  dataClassification?:
    | "public"
    | "internal"
    | "confidential"
    | "secret"
    | "personal";
}

export interface ActionEvaluationContext {
  userIntent?: string;
  taskSummary?: string;
  priorApprovalRef?: string;
  runtimeId?: string;
  projectRoot?: string;
  environment?: "local" | "development" | "staging" | "production";
  metadata?: Record<string, unknown>;
}
```

## 7.2 ActionDecision

```typescript
export interface ActionDecision {
  decision:
    | "allow"
    | "allow_with_warning"
    | "require_approval"
    | "deny";
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: number;
  enforcement: "observe" | "warn" | "approve" | "block";
  reasons: DecisionReason[];
  matchedRules: MatchedPolicyRule[];
  approval?: ApprovalRequirement;
  remediation?: RemediationAction[];
  evaluation: {
    deterministic: boolean;
    semantic: boolean;
    semanticEvaluator?: string;
  };
  cache?: {
    cacheable: boolean;
    cacheKey?: string;
    expiresAt?: string;
  };
  policyBundleHash: string;
  profileId: string;
  decidedAt: string;
}

export interface ApprovalRequirement {
  authority: ApprovalAuthority;
  approvalId: string;
  actionHash: string;
  expiresAt?: string;
  prompt: string;
}

export type ApprovalAuthority =
  | "user"
  | "repository_owner"
  | "organization_admin"
  | "security_admin"
  | "runtime_host"
  | "external_system";
```

## 7.3 ValidateResponseRequest

```typescript
export interface ValidateResponseRequest {
  requestId: string;
  profileRef: RuntimeProfileRef;
  response: ResponseCandidate;
  context?: ResponseValidationContext;
  mode?: "enforce" | "advisory";
  checks?: ResponseCheckId[];
  timeoutMs?: number;
  traceContext?: TraceContext;
}

export interface ResponseCandidate {
  responseId: string;
  content: string;
  language?: string;
  format?: "plain-text" | "markdown" | "json" | "code" | "mixed";
  channel?: "chat" | "email" | "document" | "tool-result" | "system-message";
  generatedBy?: string;
}

export interface ResponseValidationContext {
  userMessage?: string;
  taskSummary?: string;
  actionDecisionRef?: string;
  runtimeId?: string;
  priorResponseIds?: string[];
  metadata?: Record<string, unknown>;
}

export type ResponseCheckId =
  | "preferred-name"
  | "first-person"
  | "prohibited-expression"
  | "required-expression"
  | "persona-identity"
  | "value-alignment"
  | "uncertainty"
  | "relationship"
  | "privacy"
  | "language"
  | "format";
```

## 7.4 ResponseValidation

```typescript
export interface ResponseValidation {
  status:
    | "valid"
    | "valid_with_warnings"
    | "revision_required"
    | "blocked";
  severity: "info" | "low" | "medium" | "high" | "critical";
  confidence: number;
  issues: ResponseIssue[];
  checked: ResponseCheckResult[];
  suggestedRevision?: SuggestedRevision;
  validation: {
    deterministic: boolean;
    semantic: boolean;
    semanticEvaluator?: string;
  };
  profileId: string;
  policyBundleHash: string;
  validatedAt: string;
}

export interface ResponseIssue {
  code: string;
  check: ResponseCheckId;
  message: string;
  severity: "info" | "low" | "medium" | "high" | "critical";
  location?: { start: number; end: number };
  evidence?: string;
  blocking: boolean;
}

export interface SuggestedRevision {
  strategy: "patch" | "regenerate" | "remove-content" | "add-disclosure";
  instructions: string[];
  patchedContent?: string;
}
```

---

# 8. Response Validationの強制力

```text
valid
→ 送信可能

valid_with_warnings
→ 送信可能、警告記録

revision_required
→ 修正必須

blocked
→ 送信禁止
```

`blocked`を返せる条件は原則以下に限定する。

-秘密情報の露出
-明示的禁止表現
-HostまたはOrganization Policy違反
-保護された人格自己認識の重大な改ざん
-重大な虚偽の自己表示
-構造化された不変条項への明白な違反

モデルによる価値観評価だけでは原則`revision_required`まで。

形式的違反は自動patch可能。意味的な人格違反は再生成を要求する。Validatorが意味を変更する全文書換えを勝手に行ってはならない。

対象はユーザーへ最終送信する応答、外部送信文、重要な拒否応答、高リスク操作の説明等。内部メッセージすべてには呼ばない。

---

# 9. 機能未実装時

Policy EngineまたはResponse Validator未登録時：

```text
evaluateAction
→ AIKO_RUNTIME_FEATURE_UNAVAILABLE

validateResponse
→ AIKO_RUNTIME_FEATURE_UNAVAILABLE
```

起動時の必須条件にはしない。ただし以下では必須化できる。

- Organization Policy
- Adapter設定`policyRequired: true`
- Runtime Profileの`responseValidationRequired: true`
- 高リスク専用ランタイム

`enforce`要求時に機能未実装なら処理を開始しない。`advisory`要求時はwarningとして既存Host Policyへ委ねられる。

---

# 10. 設計書間の矛盾解消

## 10.1 正とする記述

SDK設計書の以下を正とする。

> Policy EngineとResponse Validatorは、Runtime SDKの基本起動に必須ではなく、interfaceを先に固定し、R7で実装する。

## 10.2 MCP設計書Phase 1の修正

変更前：

```text
Phase 1: Aiko Core抽出
- Policy Engine
```

変更後：

```text
Phase 1: Aiko Core抽出
- Persona Repository Interface
- Resolver
- Compiler
- 共通Policy型・Rule schemaの定義
- hash / version

R7:
- Policy Engine実装
- Response Validator実装
- Adapter / MCP Server接続
```

Phase 1は完了扱いを維持する。未実装機能を完了扱いにするのではなく、Phase 1の成果物定義が過剰だったため、文書を実態へ合わせる。

## 10.3 文書優先順位

```text
1. 本R7仕様書
2. Aiko Runtime SDK設計仕様書
3. Aiko-MCP使用・配布・継続保守設計書
4. package README
5. Issueコメント
```

---

# 11. 実装構造

```text
packages/
├─ policy-engine/
│  ├─ rule-engine/
│  ├─ semantic-evaluator/
│  ├─ approval/
│  ├─ cache/
│  └─ audit/
├─ response-validator/
│  ├─ deterministic-checks/
│  ├─ semantic-checks/
│  ├─ patcher/
│  └─ audit/
└─ runtime-sdk/
   ├─ policy-service.ts
   └─ validation-service.ts
```

初期実装では`runtime-sdk`内部moduleとして開始してよい。ただし公開interfaceとRule schemaは本書に従う。

---

# 12. テスト

## 12.1 Policy Engine

- 4判定
- rule priority
- approval authority
- action hash
- low confidence
- timeout
- cache
- permission missing
- semantic evaluator unavailable

## 12.2 Response Validator

- preferred name
- first person
- prohibited expression
- required expression
- privacy leak
- persona identity
- value conflict
- uncertainty
- relationship
- auto patch
- regenerate
- blocked
- timeout

## 12.3 Cross-runtime

同一ActionとProfileでClaude Code、Codex、MCP Toolが同じActionDecisionを返すこと。同一ResponseとProfileで同じResponseValidationを返すこと。

## 12.4 False Positive

正当な操作Fixtureを最低100件用意し、構造化規則による誤denyを0件にする。

---

# 13. 性能要件

```text
deterministic evaluateAction
p95 20ms以下

deterministic validateResponse
p95 30ms以下

semantic evaluation
標準timeout 5秒

1ターンのsemantic evaluation
最大3回

response semantic validation
最終応答につき最大1回
```

---

# 14. 監査ログ

記録：

- requestId
- actionId / responseId
- profileId
- policy bundle hash
- decision / status
- matched rule id
- approval id
- evaluator種別
- latency
- timestamp

記録禁止：

-秘密情報
-Tool引数全文
-Response全文
-User Profile全文
-Relationship Memory全文

---

# 15. 受入基準

1. 4つの公開型が実装される
2. 4種類のActionDecisionが実装される
3. 4種類のResponseValidation statusが実装される
4. Structured Ruleが実装される
5. Semantic Evaluator interfaceが実装される
6. モデル判定だけでdenyしない
7. require_approvalに承認主体が含まれる
8. approvalがaction hashへ紐づく
9. 権限不明時に高リスク操作を拒否する
10. deterministic評価がp95 20ms以下
11. semantic評価が1ターン3回以下
12. preferred nameをRuntime Profileから取得する
13. Adapterが呼び名を別入力しない
14. 自動patch対象が形式的違反に限定される
15. 意味変更を伴う修正は再生成扱いになる
16. Claude Code、Codex、MCP Toolで結果が一致する
17. 既存設計書のPhase記述が修正される
18. SDK設計書へ本書参照が追加される
19. 100件の正当操作Fixtureで構造化ruleの誤denyが0件
20. audit logに秘密情報が含まれない

---

# 16. 最終決定

1. Action判定は`allow / allow_with_warning / require_approval / deny`の4種類。
2. `require_approval`では承認主体を明示し、標準はユーザー。
3. `deny`は実行を停止する。ただしモデル判定だけでは原則`deny`にしない。
4. 判定方式は案Cを基礎とするハイブリッド方式。
5. deterministic評価は高リスクTool実行前に必須。モデル評価は必要時のみ。
6. Response Validatorの照合元はRuntime Profile。
7. 4つの型は本書の定義で固定。
8. Phase 1は完了扱いを維持し、Policy Engine実装をR7へ正式移管する。
