---
title: Aiko-MCP 使用・配布・継続保守設計書
document_id: AIKO-MCP-USAGE-DESIGN
version: 1.0.0-draft
status: Draft
created_at: 2026-07-30
repository: https://github.com/masa-san-jp/Agent-Aiko
target_protocol:
  - MCP 2026-07-28
  - MCP 2025-era compatibility
---

# Aiko-MCP 使用・配布・継続保守設計書

## 0. 要約

Aiko-MCPは、Claude Code、Codex、Gemini CLI、その他のMCP対応クライアントから利用しても、Aikoを同一人格として認識・運用できるようにする人格基盤である。

配布対象を単なるMCPサーバーに限定しない。GitHubリポジトリから次の一式を配布する。

```text
Aiko Distribution
├─ Persona Package
│  ├─ Aikoの自己認識
│  ├─ ナラティブ
│  ├─ 不変条項
│  └─ 行動契約
├─ Aiko-MCP Server
│  ├─ 人格情報の提供
│  ├─ 実行プロファイルの生成
│  ├─ 判断規則の評価
│  └─ 応答整合性の検証
├─ Runtime Profile Binder
│  ├─ ユーザー情報の取得
│  ├─ ツール・スキルの検出
│  ├─ 権限・データ範囲の取得
│  └─ 人格との必須合成
├─ Runtime Adapters
│  ├─ Claude Code
│  ├─ Codex
│  ├─ Gemini CLI
│  └─ Generic MCP Host
└─ Aiko CLI
   ├─ install
   ├─ configure
   ├─ doctor
   ├─ update
   ├─ rollback
   └─ uninstall
```

Aikoの共通人格はリポジトリから配布する。ユーザー情報、呼び名、関係性記憶、利用可能なツール、スキル、認証情報、参照可能データはユーザー環境に保持する。

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

一貫性を保証する主体はMCPプロトコル単体ではない。`Runtime Profile Binder`と各ランタイム用Adapterが、起動時および必要な更新時にこの合成処理を強制する。

---

# 1. 目的

## 1.1 プロダクト目的

Aiko-MCPの目的は、異なるモデル、クライアント、端末、プロジェクトで利用しても、次の要素を一貫させることである。

- Aiko自身の自己認識
- Aikoの人格的特徴
- Aikoの価値観
- Aikoの判断原則
- Aikoの不変条項
- ユーザーとの関係形成方法
- 不確実性に対する姿勢
- 自律実行と確認の境界
- 人格変更の許容範囲
- Aikoとしての継続性

次は一貫させる必要がない。

- 利用可能なツール
- 利用可能なスキル
- 読み書きできるデータ
- 認証済みサービス
- モデル固有の能力
- ファイルアクセス範囲
- UI
- 応答速度
-文章表現の細部
- ユーザーごとの呼び方
- ユーザーごとの関係性
- ユーザーごとの記憶

## 1.2 配布目的

GitHubリポジトリを通じて、次を満たす形で配布する。

- 初回導入が1コマンドで完了する
- 既存のClaude Code、Codex、Gemini CLI設定を破壊しない
- ユーザーの既存ツールやスキルをそのまま利用できる
- ユーザー情報を配布元へ送信しない
- 更新が容易である
- 更新に失敗しても直前バージョンへ戻せる
- 複数ランタイムへ同時導入できる
- 一部ランタイムだけ導入・削除できる
- 開発版と安定版を分けられる
- 継続的な保守コストを制御できる

## 1.3 非目的

初期版では次を目的としない。

- すべてのモデルから文字単位で同一の応答を生成する
- ユーザーのすべての個人データをAiko-MCPへ集約する
- 各クライアントが持つツールをAiko-MCPへ移植する
- 認証情報をAiko-MCPで一元保管する
- Claude Code、Codex、Gemini CLIのエージェントループ自体を置き換える
- Aiko-MCPだけで長期記憶システム全体を実装する
- ホスト側の安全機構やサンドボックスを迂回する

---

# 2. 一貫性の定義

## 2.1 保証対象

Aiko-MCPが保証する一貫性を、以下の5軸で定義する。

| 軸 | 保証内容 |
|---|---|
| Identity Consistency | どの環境でもAiko自身を同じ存在として扱う |
| Value Consistency | 同じ価値観・不変条項に従う |
| Decision Consistency | 同種の状況で概ね同じ判断を行う |
| Relationship Consistency | 同じユーザーに対して保存済みの関係性を利用する |
| Boundary Consistency | 禁止事項、承認境界、権限制約を守る |

## 2.2 保証しない一致

次の完全一致は保証しない。

- 表現
- 語彙
- 文章長
- 推論経路
- ツール選択
- モデル固有の得意不得意
- 処理順序
- 回答速度

## 2.3 適合レベル

Aiko-MCPの対応状態を3段階に分ける。

### Level 0：接続のみ

```text
MCP Serverが登録されている
```

人格ResourceやToolは利用できるが、クライアントが使用する保証はない。一貫性は保証しない。

### Level 1：起動時人格注入

```text
Runtime Adapter
→ Runtime Profileを生成
→ system/developer級の指示へ注入
→ MCP Serverを接続
```

セッション開始時の人格一貫性を保証する。

### Level 2：継続的一貫性管理

```text
Level 1
+ 重要判断のPolicy評価
+ コンテキスト圧縮後の再注入
+ 応答検証
+ バージョン記録
+ ユーザー関係プロファイルの適用
```

Aiko-MCPの正式サポート対象はLevel 2とする。

Generic MCP HostはLevel 0またはLevel 1に留まる可能性がある。対応水準を明示し、保証範囲を誤認させない。

---

# 3. 基本設計原則

## 3.1 ローカルファースト

初期の標準構成は、ユーザー端末で起動するstdio MCPサーバーとする。

理由：

- ユーザー情報を端末外へ出さずに済む
- OAuth基盤を用意しなくても試せる
- GitHubリポジトリから配布しやすい
- Claude Code、Codex、Gemini CLIのローカル環境と接続しやすい
- ユーザーが持つローカルスキルや設定を検出できる
- サーバー運用費を抑えられる

リモートStreamable HTTP版は、複数端末同期、組織運用、中央ポリシー管理が必要になった段階で追加する。

## 3.2 人格とユーザー情報を分離する

```text
Persona Package
= Aikoが何者か

Relationship Profile
= Aikoと特定ユーザーの関係

User Memory
= 特定ユーザーについて保持する情報

Capability Manifest
= この実行環境で使える能力

Runtime Profile
= 今回の実行でAikoに適用する合成結果
```

## 3.3 認証情報を扱わない

Aiko-MCPは、GitHub PAT、Google OAuth Token、API Key、SSH鍵、Cookieなどの秘密情報を原則として読まない。

保持するのは次のメタデータに限定する。

```yaml
tool:
  id: github
  availability: true
  operations:
    - repository.read
    - issue.write
  credential_provider: host
```

実際の認証情報は、各クライアント、OS Keychain、Credential Broker、既存MCPサーバーが保持する。

## 3.4 MCP呼び出しを任意にしない

モデルが自発的に`persona.resolve`を呼ぶことへ依存しない。

各ランタイムAdapterは、起動前に必ずBinderを実行する。

```text
Binding成功
→ エージェント起動

Binding失敗
→ Aikoとしての起動を停止
→ 修復方法を表示
```

人格を取得できない場合に、通常のAIエージェントをAikoと名乗らせてはならない。

## 3.5 配布物とユーザーデータを更新時に分離する

```text
配布物
~/.local/share/aiko-mcp/releases/<version>/

ユーザー所有データ
~/.config/aiko/
~/.local/share/aiko/user-data/
```

更新・再インストール・ロールバックでユーザー情報を上書きしない。

---

# 4. 利用者像

## 4.1 一般利用者

要件：

- GitHubリポジトリから簡単に導入したい
- 設定ファイルを手作業で編集したくない
- Claude CodeまたはCodexなど一つ以上のCLIを使っている
- Aiko人格を試したい
- 個人情報を外部サーバーへ送信したくない

## 4.2 複数エージェント利用者

要件：

- `aiko-dev`、`aiko-pr`、`aiko-research`など複数インスタンスを使う
- 全インスタンスでAiko人格を共有したい
- ツール、スキル、プロジェクト、記憶スコープは分けたい
- インスタンスごとに使用する人格バージョンを固定したい

## 4.3 開発者・コントリビューター

要件：

- 人格定義、Binder、Adapter、テストを変更したい
-ローカルで開発版を試したい
- Golden Testを実行したい
- Pull Requestで互換性を確認したい

## 4.4 組織管理者

将来要件：

- 配布バージョンを固定したい
- 利用可能な人格バージョンを制御したい
- ユーザーデータを組織の管理範囲内に置きたい
- 監査ログと利用ポリシーを適用したい

---

# 5. ユーザー体験設計

## 5.1 初回導入

### 推奨コマンド

```bash
curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/main/scripts/install-aiko-mcp.sh | bash
```

インストーラーは、直接mainブランチの実装を実行してはならない。スクリプトは次のみ行う。

1. GitHub Releases APIから最新のstable releaseを解決
2. OSとCPUアーキテクチャに対応する成果物を選択
3. 成果物とSHA-256チェックサムをダウンロード
4. チェックサムを検証
5. 一時ディレクトリへ展開
6. `aiko` CLIをユーザー領域へ配置
7. `aiko install`を実行
8. インストール結果を表示

より安全な代替手段として次も提供する。

```bash
git clone https://github.com/masa-san-jp/Agent-Aiko.git
cd Agent-Aiko
git checkout <release-tag>
bash scripts/install-aiko-mcp.sh
```

将来、npm配布を行う場合は次も提供する。

```bash
npx @agent-aiko/cli@latest install
```

## 5.2 初回セットアップ

インストール後にウィザードを開始する。

```text
Aiko-MCP setup

検出されたクライアント:
✓ Claude Code
✓ Codex
○ Gemini CLI（未検出）

Aikoを登録するクライアント:
[x] Claude Code
[x] Codex

ユーザー情報の保存場所:
~/.config/aiko/users/default/

呼び名:
> Masa

既存のAgent-Aiko設定:
✓ ~/.aiko/ を検出
→ 移行する

設定を適用します。
```

入力必須項目は最小限にする。

必須：

- 使用するクライアント
- ユーザープロファイルID

任意：

- 呼び名
- 自動更新チャネル
- 匿名利用統計
- 既存Agent-Aikoデータの移行

## 5.3 日常利用

利用者は通常のクライアントをそのまま起動する。

```bash
claude
codex
gemini
```

Adapterが透過的に次を行う。

```text
1. Aiko-MCPの存在確認
2. Persona Packageの検証
3. User Profileの解決
4. Tool／Skill Manifestの収集
5. Runtime Profileの生成
6. system/developer級指示への注入
7. Aiko-MCP接続確認
8. セッション開始
```

利用者が毎回`/aiko`を入力する方式は標準としない。

## 5.4 状態確認

```bash
aiko status
```

出力例：

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
Last profile hash: sha256:9f...
Update channel: stable
```

## 5.5 診断

```bash
aiko doctor
```

診断項目：

- Node.jsバージョン
- Aiko-MCP実行可能性
- Persona Package署名・hash
- user profileのスキーマ
- MCP接続
- 各クライアント設定
- Adapterの整合性
- 書き込み権限
- 競合する旧設定
- ツール・スキル検出
- protocol compatibility
- 最新版との差
- 秘密情報の誤配置

自動修復可能な項目は次で修復する。

```bash
aiko doctor --fix
```

修復前にバックアップを作る。

## 5.6 更新

```bash
aiko update
```

標準動作：

1. 新バージョン情報を取得
2. Release Notesと破壊的変更の有無を表示
3. 成果物をダウンロード
4. checksum／署名を検証
5. 現行設定をバックアップ
6. 新版をside-by-side配置
7. migration dry-run
8. smoke test
9. active versionを切替
10. 失敗時は自動ロールバック

自動更新は初期値OFFとする。更新通知のみ表示する。

```bash
aiko update --channel stable
aiko update --channel beta
aiko update --check
```

## 5.7 ロールバック

```bash
aiko rollback
aiko rollback 1.3.4
```

ユーザー情報はロールバック対象に含めない。スキーマ移行を伴う場合は、旧g��互換スナップショットを作成する。

## 5.8 アンインストール

```bash
aiko uninstall
```

確認項目：

```text
Aiko-MCP本体を削除します。
ユーザープロファイルと関係性記憶は保持しますか？ [Y/n]
各クライアントのAiko設定を削除しますか？ [Y/n]
```

標準ではユーザーデータを保持する。

完全削除：

```bash
aiko uninstall --purge
```

---

# 6. システムアーキテクチャ

## 6.1 全体構造

```text
┌────────────────────────────────────────────────┐
│ GitHub Repository / GitHub Releases          │
│                                              │
│ Persona Package / CLI / MCP / Adapters       │
└───────────────────────┬───────────────────────┘
                       │ install / update
                       ▼
┌──────────────────────────────────────────────┐
│ User Environment                             │
│                                              │
│  ┌──────────────────────────────────────┐  │
│  │ Aiko Core                              │  │
│  │ Persona Registry / Compiler / Policy   │  │
│  └───────────────────┬────────────────────┘  │
│                      │                       │
│  ┌───────────────────▼────────────────────┐  │
│  │ Runtime Profile Binder                │  │
│  └───────────┬───────────────┬───────────┘  │
│              │               │              │
│      User Context     Capability Registry   │
│              │               │              │
│              └───────┬───────┘              │
│                      ▼                       │
│  ┌────────────────────────────────────────┐  │
│  │ Runtime Profile                       │  │
│  └───────┬───────────────┬───────────────┘  │
│          │               │                  │
│  Claude Adapter   Codex Adapter   Gemini Adapter
│          │               │                  │
└─────────┼───────────────┼──────────────────┘
           ▼               ▼
      Claude Code        Codex             Gemini CLI
```

## 6.2 コンポーネント責務

### Persona Registry

保持内容：

- Aiko Identity Core
- Narrative
- Behavioral Contract
- Invariants
- Persona metadata
- Persona version
- migration metadata
- compatibility metadata

### Persona Compiler

入力：

- Persona Package
- User Relationship Profile
- Runtime type
- Model family
- Capability Manifest
- Task Context

出力：

- runtime-specific instructions
- policy bundle
- resource references
- configuration hash
- provenance

### Runtime Profile Binder

責務：

- 全入力の取得
- スキーマ検証
- 参照解決
- 最小権限化
- 競合解消
- 実行プロファイル生成
- profile hash生成
- fail-closed判定

### User Context Provider

責務：

- user profile取得
- preferred address取得
- relationship profile取得
- memory namespace参照
- ユーザー許可に基づく最小情報の返却

### Capability Registry

責務：

- Runtimeが提供する組込みツールの記録
- MCPサーバー一覧
- Skill一覧
- 操作可能範囲
- 権限レベル
- データスコープ
- availability
- version

### Runtime Adapter

責務：

- 各クライアント設定の生成
- Aiko-MCP登録
- 人格指示の注入
- セッション再開時の整合性確認
- コンテキスト圧縮後の再適用
- クライアント固有差異の吸収

### Response Validator

責務：

- 出力の形式的検証
- 人格不変条項違反の検出
- 呼び名の検証
- 重大判断の整合性検証
- 必要な場合の修正要求

---

# 7. 実行時バインディング仕様

## 7.1 必須入力

```yaml
binding_request:
  persona_ref:
    id: aiko
    version: 3.2.0

  user_ref:
    id: default

  runtime:
    id: claude-code
    version: 2.x
    model_family: claude

  capabilities_ref:
    source: runtime-discovery

  task_context:
    project_root: /home/user/project
    task_type: software-development
```

## 7.2 User Profile

```yaml
schema_version: 1
user_id: def