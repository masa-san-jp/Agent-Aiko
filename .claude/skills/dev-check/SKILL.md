# /dev-check — 三層分離チェックスキル

コミット・push 前に三層分離の整合性を検証します。

前提：開発ログ用リポは `../Agent-Aiko-dev/`（本リポの兄弟ディレクトリ）として clone 済みであること。

## チェック項目

### 1. claude-code/template/ スキャン（配布用の汚染チェック）

```bash
grep -rnE "dev-docs|Agent-Aiko-dev" claude-code/template/ --include="*.md" --include="*.sh" --include="*.json" \
  | sed -E 's|https?://[^[:space:]"<>)]+||g' \
  | grep -E "dev-docs|Agent-Aiko-dev"
```

- ローカルパス参照として `dev-docs` または `Agent-Aiko-dev` が含まれていれば **NG**（push ブロック対象）
- 開発者固有のパス・ツールが含まれていれば **NG**
- 許容されるのは **`https?://` の公開アセット URL のみ**。URL を一旦除去した上で再度マッチさせるため、`file://` 等のローカル依存 URL や、URL とローカルパスが同じ行に混在するケースもローカル参照は確実に検出される（`template-check.sh` と同じロジック）

### 2. dev-log.jsonl の更新確認

- `../Agent-Aiko-dev/dev-log.jsonl` の最終行の `ts` フィールドが今日の日付か確認
- 更新されていなければ `/dev-log` の実行を促す

### 3. ../Agent-Aiko-dev/README.md の整合確認

- `../Agent-Aiko-dev/` 内の実ファイル一覧と README のテーブルを照合
- ファイルの追加・削除・リネームが README に反映されていなければ **NG**

## 実行タイミング

- `git commit` または `git push` の前
- セッション終了時

## 出力形式

```
=== /dev-check ===
[OK]  claude-code/template/ に dev-docs / Agent-Aiko-dev 参照なし
[OK]  dev-log.jsonl: 今日（YYYY-MM-DD）更新済み
[WARN] ../Agent-Aiko-dev/README.md: 未反映ファイルあり → <ファイル名>
```

問題があれば修正手順を添えて報告し、ユーザーの確認を得てから push を続行してください。
