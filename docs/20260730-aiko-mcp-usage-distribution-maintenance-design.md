---
title: Aiko-MCP 使用・配布・継続保守設計書
document_id: AIKO-MCP-USAGE-DESIGN
version: 1.0.0-draft
status: Draft
created_at: 2026-07-30
repository: https://github.com/masa-san-jp/Agent-Aiko
---

# Aiko-MCP 使用・配布・継続保守設計書

## 0. 結論

Aiko-MCPは、Claude Code、Codex、Gemini CLI、その他のMCP対応クライアントから利用しても、Aikoを同一人格として認識・運用できるようにする人格基盤である。

配布対象を単なるMCPサーバーに限定しない。GitHubリポジトリから以下を一体として配布する。

```text
Aiko-MCP Distribution
├─ Persona Package
├─ Aiko Core
├─ MCP Server
├─ Runtime Profile Binder
├─ User Context Interface
├─ Capability Registry
├─ Runtime Adapters
└─ Installer / Updater / CLI
```

実行時には必ず次を合成する。

```text
Aiko Runtime Profile
= Common Persona Package
+ User Relationship Profile
+ Capability Manifest
+ Permission Manifest
+ Runtime Context
+ Task Context
```

人格の一貫性を保証する主体はMCP単体ではない。`Runtime Profile Binder`と各ランタイム用Adapterが、起動時にこの合成を強制する。

---

# 1. 目的

## 1.1 プロダクト目的

以下を異なるモデル・クライアント・端末間で一貫させる。

- Aiko自身の自己認識
- 人格的特徴
- 価値観
- 判断原則
- 不変条項
- ユーザーとの関係形成方法
- 不確実性への対応
- 自律実行と確認の境界
- 人格変更の許容範囲

以下は環境またはユーザーごとに異なってよい。

- 利用可能なツール・スキル
- 参照可能データ
- 認証済みサービス
- モデル能力
- ファイルアクセス範囲
- UI・応答速度
- ユーザーの呼び名
- ユーザーとの関係性・記憶

## 1.2 配布目的

- 1コマンドで導入できる
- 既存クライアント設定を破壊しない
- ユーザーの既存ツール・スキルを利用できる
- ユーザー情報を配布元へ送信しない
- 更新・ロールバック・削除が容易
- 複数ランタイムへ同時導入できる
- stable / beta / nightlyを分離できる
- 継続的なメンテナンスコストを制御できる

## 1.3 非目的

- すべてのモデルで文字単位に同一の回答を生成すること
- 認証情報をAiko-MCPで集中管理すること
- 各クライアントのエージェントループを置き換えること
- Aiko-MCP単体で長期記憶システム全体を実装すること

---

# 2. 一貫性の定義

| 軸 | 保証内容 |
|---|---|
| Identity Consistency | どの環境でもAikoを同じ存在として扱う |
| Value Consistency | 同じ価値観・不変条項に従う |
| Decision Consistency | 同種の状況で概ね同じ判断を行う |
| Relationship Consistency | 同一ユーザーに同じ関係情報を適用する |
| Boundary Consistency | 禁止事項・承認境界・権限制約を守る |

表現、語彙、文章長、推論経路、ツール選択、処理速度の完全一致は保証しない。

## 2.1 適合レベル

### Level 0：MCP接続のみ

ResourceやToolを利用できるが、クライアントが人格情報を使用する保証はない。

### Level 1：起動時人格注入

```text
Runtime Adapter
→ Runtime Profile生成
→ system/developer級指示へ注入
→ MCP接続
```

### Level 2：継続的一貫性管理

```text
Level 1
+ 重要判断のPolicy評価
+ コンテキスト圧縮後の再注入
+ 応答検証
+ バージョン記録
+ User Relationship Profile適用
```

正式AdapterはLevel 2を目標とする。

---

# 3. 基本設計原則

## 3.1 ローカルファースト

初期標準はユーザー端末で起動するstdio MCPサーバーとする。

- ユーザー情報を端末外へ出さない
- OAuth基盤なしで利用可能
- GitHubから配布しやすい
- ローカルのツール・スキルを検出可能
- サーバー運用費が不要

リモートStreamable HTTP版は、複数端末同期・組織運用が必要になった段階で追加する。

## 3.2 人格とユーザー情報の分離

```text
Persona Package = Aikoが何者か
Relationship Profile = Aikoと特定ユーザーの関係
User Memory = ユーザーに関する記憶
Capability Manifest = 実行環境で使える能力
Runtime Profile = 今回の実行に適用する合成結果
```

## 3.3 認証情報を扱わない

Aiko-MCPはAPI Key、OAuth Token、PAT、SSH鍵、Cookieを保持しない。

```yaml
tool:
  id: github
  availability: true
  operations:
    - repository.read
    - issue.write
  credential_provider: host
```

実認証情報は各クライアント、OS Keychain、Credential Broker、既存MCPサーバーが保持する。

## 3.4 Fail Closed

モデルが任意に人格Toolを呼ぶ設計にしない。Adapterはエージェント起動前に必ずBinderを実行する。

```text
Binding成功 → Aikoとして起動
Binding失敗 → Aikoとして起動しない
```

---

# 4. ユーザー体験

## 4.1 初回導入

```bash
curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/main/scripts/install-aiko-mcp.sh | bash
```

インストーラーは最新stable releaseを解決し、OS・CPUに対応する成果物を取得、checksumを検証してユーザー領域へ配置する。

安全な代替手段も提供する。

```bash
git clone https://github.com/masa-san-jp/Agent-Aiko.git
cd Agent-Aiko
git checkout <release-tag>
bash scripts/install-aiko-mcp.sh
```

## 4.2 初回セットアップ

```text
Aiko-MCP setup

検出されたクライアント:
✓ Claude Code
✓ Codex
○ Gemini CLI

登録対象:
[x] Claude Code
[x] Codex

呼び名:
> Masa

既存 ~/.aiko/:
✓ 検出 → 移行
```

入力必須項目はクライアント選択とUser Profile IDのみとする。

## 4.3 日常利用

ユーザーは通常どおりクライアントを起動する。

```bash
claude
codex
gemini
```

Adapterが以下を透過的に行う。

1. Aiko-MCP確認
2. Persona Package検証
3. User Profile解決
4. Tool / Skill Manifest収集
5. Runtime Profile生成
6. system/developer級指示へ注入
7. MCP接続確認
8. セッション開始

毎回`/aiko`を入力する方式は標準としない。

## 4.4 CLI

```bash
aiko install
aiko configure
aiko status
aiko doctor
aiko doctor --fix
aiko update
aiko rollback
aiko uninstall
```

### 状態確認

```text
Aiko-MCP 1.4.2
Persona: aiko@3.2.0
User: default
Binding: healthy
Protocol: MCP 2026-07-28
Adapters:
  Claude Code  ready  Level 2
  Codex        ready  Level 2
  Gemini CLI   not installed
```

---

# 5. システム構成

```text
GitHub Repository / Releases
        │ install / update
        ▼
User Environment
├─ Aiko Core
│  ├─ Persona Registry
│  ├─ Compiler
│  ├─ Policy Engine
│  └─ Validator
├─ Runtime Profile Binder
├─ User Context Provider
├─ Capability Registry
├─ MCP Server
└─ Runtime Adapters
   ├─ Claude Code
   ├─ Codex
   ├─ Gemini CLI
   └─ Generic MCP Host
```

## 5.1 Persona Registry

保持内容：Identity Core、Narrative、Behavioral Contract、Invariants、Persona version、migration metadata、compatibility metadata。

## 5.2 Persona Compiler

入力：Persona Package、User Relationship Profile、Runtime、Model Family、Capability Manifest、Task Context。

出力：runtime-specific instructions、policy bundle、resource references、configuration hash、provenance。

## 5.3 Runtime Profile Binder

- 入力取得
- スキーマ検証
- 参照解決
- 最小権限化
- 競合解消
- Runtime Profile生成
- profile hash生成
- fail-closed判定

## 5.4 User Context Provider

preferred name、relationship profile、memory namespace、ユーザー許可に基づく最小情報を提供する。

## 5.5 Capability Registry

Runtime組込みツール、MCPサーバー、Skill、操作範囲、権限、version、availabilityを記録する。

---

# 6. 実行時バインディング

## 6.1 Binding Request

```yaml
binding_request:
  persona_ref:
    id: aiko
    version: 3.2.0
  user_ref:
    id: default
  runtime:
    id: claude-code
    model_family: claude
  capabilities_ref:
    source: runtime-discovery
  task_context:
    project_root: /home/user/project
    task_type: software-development
```

## 6.2 User Profile

```yaml
schema_version: 1
user_id: default
identity:
  preferred_name: Masa
communication:
  language: ja
  verbosity: concise
  directness: high
relationship:
  familiarity: established
  memory_namespace: users/default/aiko
privacy:
  allow_remote_persona_service: false
  allow_usage_telemetry: false
```

## 6.3 Capability Manifest

```yaml
schema_version: 1
runtime_id: claude-code
built_in_tools:
  - id: filesystem
    operations: [read, write]
mcp_servers:
  - id: github
    availability: ready
skills:
  - id: code-review
    version: 2.1.0
credentials:
  handling: host-managed
  values_included: false
```

## 6.4 優先順位

1. Host safety policy
2. Organization policy
3. Aiko invariants
4. User privacy policy
5. Runtime permissions
6. Aiko behavioral contract
7. User relationship profile
8. Project rules
9. Task context
10. Style preferences

## 6.5 Fail-closed条件

- Persona Packageの署名またはhash不正
- 必須スキーマ不正
- Persona versionがAdapter非対応
- User Profile解決不能
- Adapterが人格指示を注入できない
- Invariants欠落
- configuration hash検証失敗

ToolやSkillの一部が利用不能な場合は、その能力を除外して警告する。

---

# 7. MCPサーバー仕様

## 7.1 Transport

初期標準はstdio。将来Streamable HTTPを追加する。リモート版はセッション状態に依存しない。

## 7.2 Resources

```text
persona://aiko/manifest
persona://aiko/core
persona://aiko/narrative
persona://aiko/invariants
persona://aiko/behavior-contract
persona://aiko/version/current
runtime-profile://{profile_id}/summary
```

Resource取得だけで人格適用を保証しない。

## 7.3 Prompts

```text
aiko.activate
aiko.activate_for_task
aiko.review_as_aiko
aiko.handoff
```

正式AdapterはPromptに依存せず、Compiler出力をsystem/developer級指示へ注入する。

## 7.4 Tools

```text
aiko.bind_runtime
aiko.get_runtime_profile
aiko.compile_instructions
aiko.evaluate_action
aiko.validate_response
aiko.get_relationship_context
aiko.report_capabilities
aiko.health
```

Tool結果にはPersona version、Policy version、hashを含める。

---

# 8. Runtime Adapter

## 8.1 Claude Code

- 既存MCP設定を保持
- 既存`CLAUDE.md`を上書きしない
- Compiler出力を`--system-prompt-file` / `--append-system-prompt-file`でsystem級指示として注入する（§8.5で実測確認済み）
- 旧`.claude/aiko/`を移行
- コンテキスト圧縮後に人格を再適用

## 8.2 Codex

- MCP設定へAiko-MCPを追加
- `thread/start`の`baseInstructions`へ注入する。スレッド存続中は固定され、ターン単位で上書きできない（既存`codex/src/aiko-prompt-builder.ts`で実現済み）
- 組込みツール、MCP、skillsをCapability Manifest化
- sandbox / approval policyをPermission Manifestへ反映
- 既存Codex Runtimeを段階統合

## 8.3 Antigravity CLI（旧 Gemini CLI）

Gemini CLIはAntigravity CLIへ移行した。本設計が前提にしていた設定ファイル名・コマンド定義形式・hooks定義・設定パスが変わっている可能性があり、その調査と`antigravity/`配下の表記統一は独立課題として分離した（#45）。

- MCP設定へAiko-MCPを追加
- コンテキストファイルには薄いbootstrapのみを置く
- extensionsとの競合を検出
- 既存`antigravity/`実装から移行

現行のコンテキストファイル（`GEMINI.md`）はユーザー級のコンテキストであり、モデルが従う保証がない。#45でsystem級注入の手段が判明するまで、このランタイムはLevel 2の対象と見なさない（§8.5）。本設計はClaude CodeとCodexの2ランタイムで先行する。

## 8.4 Generic MCP Host

system-level instruction注入を制御できないクライアントではLevel 2を保証しない。

## 8.5 注入手段の検証状況

Level 2（§2.1）とFail Closed（§3.4）は「エージェントループ開始前にsystem/developer級へ人格を注入できる」ことに依存する。この前提はクライアントごとに成否が異なるため、実装フェーズに入る前に個別に確認した（2026-07-30）。

| ランタイム | 注入手段 | 検証状況 |
|---|---|---|
| Claude Code | `--system-prompt` / `--system-prompt-file` / `--append-system-prompt-file`（実測）<br>`--append-system-prompt`（未実測・上記の inline 版） | **実測で確認済み**。`--setting-sources ''`（`CLAUDE.md`・settings を一切読まない状態）で次の3通りを実行し、いずれも指定した一人称と応答プレフィックスが適用された。①`--system-prompt`（文字列）②`--system-prompt-file`（ファイル）③`①のファイル版 + --append-system-prompt-file`（併用時は両方が合成され、base の指示と append の指示が同時に効く）。人格がsystem級注入だけで成立する |
| Codex | `thread/start`の`baseInstructions` | 既存実装で実現済み（コードで確認）。ターン単位の上書き不可という性質はLevel 2に適合する。本設計としての実行検証は未実施 |
| Antigravity CLI（旧 Gemini CLI） | 不明（現行のコンテキストファイルはユーザー級） | **未検証**。検証環境にCLI未インストール。加えてGemini CLIからAntigravity CLIへの移行で仕様自体が変わっている可能性があり、調査は#45で行う |
| Generic MCP Host | なし | §8.4のとおりLevel 2非対象 |

Claude CodeとCodexについては前提が成立する。Antigravity CLIはsystem級注入の手段が判明するまで、Level 1（起動時注入・保証なし）として扱う。したがって本設計の§15以降はClaude CodeとCodexの2ランタイムを対象に進め、Antigravity CLIは#45の結果を待って合流させる。

この検証を先に行ったのは、6種のスキーマを固めた後にAdapterで前提が崩れると、固めたスキーマを作り直すことになるため。

---

# 9. リポジトリ構成

```text
Agent-Aiko/
├─ persona/aiko/
├─ packages/
│  ├─ core/
│  ├─ binder/
│  ├─ mcp-server/
│  ├─ cli/
│  ├─ user-context/
│  ├─ capability-registry/
│  └─ runtime-sdk/
├─ adapters/
│  ├─ claude-code/
│  ├─ codex/
│  ├─ gemini/
│  └─ generic/
├─ schemas/
├─ scripts/
├─ tests/
├─ docs/
└─ .github/workflows/
```

既存`claude-code/`、`codex/`、`antigravity/`は直ちに削除せず、段階的にAdapterへ移行する。

---

# 10. 配布・更新・互換性

## 10.1 配布

- GitHub Repository：ソース、ドキュメント、Issue、PR
- GitHub Releases：安定版成果物、checksum、署名、SBOM
- npm：将来の補助配布

## 10.2 Release Channel

```text
stable  正式利用
beta    次期機能検証
nightly main自動ビルド
```

## 10.3 バージョン

Distribution、MCP Server、Persona Package、Schema、Compiler、Adapterを個別にSemVer管理する。

### 10.3.1 スキーマの互換性方針（マサさん確定 2026-07-30）

各スキーマの`schema_version`は1から始まる整数で、後方非互換な変更のたびに1つ増やす。項目の追加など後方互換な変更では増やさない。

**受理する範囲は「現行版とその1つ前」まで。** それより古い`schema_version`は読まずに拒否する（§6.5 の「必須スキーマ不正」に当たる扱い）。

| 現行 | 受理 | 拒否 |
|---|---|---|
| 2 | 2, 1 | 0 以下 |
| 3 | 3, 2 | 1 以下 |

無期限に受理しない理由は、古い形式を読むコードが恒久的に残り、以後すべての変更がその分岐を抱え続けるため。1つ前まで受理するのは、更新が一段階遅れているだけの利用者を、更新のためだけに止めないため。

拒否するときは、拒否した版・受理できる範囲・更新方法を示す。読めない事実だけを伝えて終わらない。

対象は`schema_version`を持つファイル（User Profile・Capability Manifest・Permission Manifest・Persona Package・Runtime Profile）。Persona Package の`compatibility.schema_versions`は、そのパッケージが受理できる版を宣言するもので、この方針の下位に位置する（宣言が方針より広くても、方針の範囲を超えて受理しない）。

## 10.4 更新

```bash
aiko update --check
aiko update --channel stable
aiko update --channel beta
```

標準は自動更新OFF。patchのみ自動更新対象にできる。minor / majorは承認を要求する。

## 10.5 ロールバック

```bash
aiko rollback
aiko rollback 1.3.4
```

ユーザーデータはロールバック対象に含めない。

## 10.6 Persona更新

```bash
aiko persona update
aiko persona pin 3.2.0
aiko persona diff 3.2.0 3.3.0
```

重大な人格変更は自動適用しない。

---

# 11. セキュリティ・プライバシー

## 11.1 ユーザー端末に保持する情報

呼び名、User Profile、Relationship Profile、Memory Reference、Tool / Skill Manifest、Permission Manifest、Runtime Profile、ローカルログ。

## 11.2 標準で外部送信しない情報

会話全文、個人情報、認証情報、ファイル内容、メール・カレンダー内容、Memory本文。

## 11.3 ファイル権限

```text
~/.config/aiko/       0700
User Profile          0600
Relationship Profile  0600
Runtime Profile       0600
Persona Package       0444
```

## 11.4 Supply Chain

SHA-256 checksum、signed tag、artifact attestation、SBOM、lockfile、SECURITY.md、脆弱性報告窓口を提供する。

---

# 12. テスト・CI/CD

## 12.1 テスト

- Unit Test
- Schema Validation
- MCP Contract Test
- Adapter Integration Test
- Fresh Install / Upgrade / Rollback Test
- Security Test
- Persona Golden Test

Golden Testではself identification、value alignment、invariant compliance、decision consistency、relationship behavior、uncertainty behavior、autonomy behaviorを評価する。文章の完全一致は評価しない。

## 12.2 Pull Request CI

```text
format
lint
typecheck
unit test
schema validation
contract test
adapter test
security scan
dependency audit
build
```

Persona変更時はsemantic diff、invariants change detection、Golden Test、maintainer approvalを追加する。

---

# 13. 継続保守

| 対象 | 変更理由 | 頻度 |
|---|---|---|
| Persona Package | 人格改善 | 低 |
| MCP Server | protocol・security | 中 |
| Binder | 合成規則・schema | 中 |
| Adapter | クライアント更新 | 高 |
| CLI / Installer | UX・OS対応 | 中 |
| Documentation | 全変更 | 継続 |

Adapterを独立更新可能にし、クライアント更新追随の影響を局所化する。

毎週dependency、client release、CI、security alertを確認する。毎月compatibility matrix、install test、link check、Issue triageを行う。四半期ごとにpersona consistency benchmark、deprecation、schema、threat model、rollback演習を行う。

---

# 14. 既存Agent-Aikoからの移行

再利用対象：`~/.aiko/`、origin / override / 名前付き人格、`INVARIANTS.md`、`AikoPersonaSnapshot`、Persona Loader、Prompt Builder、Runtime起動処理、override history、diff / export / reset、各ランタイム実装知見。

```text
Phase 1  現行ファイルをFileSystemPersonaRepositoryで読む
Phase 2  manifest.yaml追加
Phase 3  構造化データを正本化
Phase 4  Runtime AdapterをAiko Coreへ接続
Phase 5  旧コマンドを新CLIへalias
Phase 6  互換期間終了後に旧Runtimeを整理
```

```bash
aiko migrate detect
aiko migrate plan
aiko migrate apply
aiko migrate verify
aiko migrate rollback
```

---

# 15. 実装フェーズ

## Phase 0：仕様固定

Schema、一貫性レベル、互換性方針、Threat Modelを確定する。

進捗（2026-07-30）: Schema 確定済（`schemas/` の6本・#48）。一貫性レベル確定済（§2.1・ランタイム別の到達可否は §8.5）。互換性方針 確定済（§10.3.1）。**Threat Model 未着手** — Phase 5（配布・署名）までに用意する。

## Phase 1：Aiko Core抽出

Repository Interface、Resolver、Compiler、共通Policy型・Rule schemaの定義、hash / versionを実装する。

Policy Engine本体とResponse Validatorの実装はR7で行う（R7仕様書 §10.2）。Phase 1の成果物定義が過剰だったため実態へ合わせたものであり、Phase 1は完了扱いを維持する。

## Phase 2：BinderとUser Context

Runtime Profile Binder、User Context Provider、Capability Registry、Permission Manifestを実装する。

## Phase 3：stdio MCP Server

Resources、Prompts、Tools、MCP Inspector Testを実装する。

## Phase 4：正式Adapter

Claude Code、Codexの順でLevel 2対応する。Antigravity CLI（旧 Gemini CLI）はsystem級注入の手段が未確認のため本フェーズの対象に含めない（§8.3・§8.5）。#45で手段が判明した時点で本フェーズへ追加する。

## Phase 5：配布・更新

GitHub Releases、checksum、attestation、updater、rollback、release channelを実装する。

## Phase 6：リモート版

Streamable HTTP、OAuth / OIDC、multi-device、organization policyを追加する。

---

# 16. 受入基準

- 1コマンドで導入できる
- 5分以内に最初のAikoセッションを開始できる
- 既存設定を破壊しない
- root権限を要求しない
- 正式Adapterで同一Persona versionを使用する
- 同じユーザーへ同じ呼び名とInvariantsを適用する
- profile hashとversionを追跡できる
- update / rollbackでUser Profileを失わない
- 認証情報をログへ記録しない
- Adapterを独立更新できる
- 主要OSをCIで検証する

---

# 17. 最終判断

Aiko-MCPを「人格ファイルを返すMCPサーバー」として配布するだけでは、クライアント間の人格一貫性は保証できない。

正式な配布単位は以下とする。

```text
Aiko-MCP Distribution
= Persona Package
+ Aiko Core
+ MCP Server
+ Runtime Profile Binder
+ User Context Interface
+ Capability Registry
+ Runtime Adapters
+ Installer / Updater
```

ユーザー操作は単純に保つ。

```text
インストール
→ 普段どおりClaude Code / Codex / Geminiを起動
→ Aikoとして一貫して振る舞う
→ 必要時だけaiko doctor / update
```

内部では毎回、人格検証、ユーザー関係情報解決、Tool / Skill / Permission検出、Runtime Profile合成、各クライアントへの強制注入、一貫性検証を実行する。
