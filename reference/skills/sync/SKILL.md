---
name: sync
description: "TRIGGER: ユーザーが /sync, /sync pull, /sync push, /sync status を入力した場合。エージェント定義ディレクトリと GitHub を双方向同期する。SKIP: ローカル作業のみで GitHub 反映不要な場合・オフライン環境・対象外ディレクトリの同期。ログ書き込みと push を同時に行いたい場合は /log-push を使用。"
---

# /sync

エージェント定義ディレクトリ（例：`{{ORG_REPO_PATH}}/Agent-team/agents/` 配下）を GitHub と同期する手動コマンドの参考実装。パス・名称は各組織の構成に合わせて調整して使う。SessionStart / SessionEnd で自動実行される同期スクリプト（`agent-sync.sh` 相当）と同じスクリプトを呼ぶ。**任意のタイミングで一発同期したいとき**に使う。

## 引数

- 引数なし（デフォルト）：full sync（`pull → push → status`）
- `pull`：GitHub の最新を取り込むだけ
- `push`：同期対象配下の変更を自動 commit & push するだけ
- `status`：同期状態だけを表示

## 引数なし（デフォルト：full sync）

`pull → push → status` を一気に実行する。「いつでも同期したい」ときの基本コマンド。

```bash
bash {{ORG_REPO_PATH}}/Agent-team/tools/agent-sync/agent-sync.sh
```

出力例：
```
[agent-sync] pull 完了：xxxxxxx ...
[agent-sync] push 完了：xxxxxxx chore(sync): auto-sync agents YYYY-MM-DD HH:MM
同期状態:
  リモートと一致
  agents/ 配下のローカル変更: 0 件
```

## 引数 `pull`

GitHub の最新を取り込むだけ（fast-forward 可能なときに限る）。

```bash
bash {{ORG_REPO_PATH}}/Agent-team/tools/agent-sync/agent-sync.sh pull
```

ローカル変更があればスキップして警告のみ表示する。

## 引数 `push`

同期対象ディレクトリ配下の変更を自動 commit & push するだけ。

```bash
bash {{ORG_REPO_PATH}}/Agent-team/tools/agent-sync/agent-sync.sh push
```

- 変更がなければ何もしない
- 他ディレクトリの変更には触れない
- コミットメッセージは `chore(sync): auto-sync agents YYYY-MM-DD HH:MM` で固定（書式は任意に変更可）

## 引数 `status`

同期状態だけを表示する。

```bash
bash {{ORG_REPO_PATH}}/Agent-team/tools/agent-sync/agent-sync.sh status
```

## それ以外の引数

`pull` / `push` / `status` 以外を指定された場合は、上記のいずれかを指定するよう案内する。

## 関連

- `/log-push` — ログ書き込みと push を同時に行う複合コマンド

## 関連ファイル

- スクリプト本体：`{{ORG_REPO_PATH}}/Agent-team/tools/agent-sync/agent-sync.sh`（`agent-sync.sh` 相当）
- 同期対象ディレクトリ：`{{ORG_REPO_PATH}}/Agent-team/agents/`
- 自動同期 hook：`{{ORG_REPO_PATH}}/.claude/settings.json` の SessionStart（pull）/ SessionEnd（push）
