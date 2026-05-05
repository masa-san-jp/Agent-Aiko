# /dev-check — 三層分離チェックスキル

コミット・push 前に三層分離の整合性を検証します。

## チェック項目

### 1. claude-code/template/ スキャン（配布用の汚染チェック）

```bash
grep -r "dev-docs" claude-code/template/ --include="*.md" --include="*.sh" --include="*.json" -l
```

- `dev-docs/` への参照が含まれていれば **NG**（push ブロック対象）
- 開発者固有のパス・ツールが含まれていれば **NG**

### 2. dev-log.jsonl の更新確認

- 最終行の `ts` フィールドが今日の日付か確認
- 更新されていなければ `/dev-log` の実行を促す

### 3. dev-docs/README.md の整合確認

- `dev-docs/` 内の実ファイル一覧と README のテーブルを照合
- ファイルの追加・削除・リネームが README に反映されていなければ **NG**

## 実行タイミング

- `git commit` または `git push` の前
- セッション終了時

## 出力形式

```
=== /dev-check ===
[OK]  claude-code/template/ に dev-docs 参照なし
[OK]  dev-log.jsonl: 今日（YYYY-MM-DD）更新済み
[WARN] dev-docs/README.md: 未反映ファイルあり → <ファイル名>
```

問題があれば修正手順を添えて報告し、ユーザーの確認を得てから push を続行してください。
