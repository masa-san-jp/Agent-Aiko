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

- 配布�