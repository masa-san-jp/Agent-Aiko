---
name: aiko-override
description: Edit the override persona file (aiko-override.md) based on user instructions or unapproved proposals. Validates against INVARIANTS before applying. Use when the user types "/aiko-override" or "/aiko-or".
---

# /aiko-override（別名：/aiko-or）

Override 版人格ファイル `.claude/aiko/persona/aiko-override.md` を編集します。

## 手順

1. ユーザーの指示文を読み、変更したい点を整理します
2. 必要があれば `.claude/aiko/persona/proposals/` 配下の未承認提案を読み、参考にします
3. `.claude/aiko/persona/INVARIANTS.md` を読み、提案された変更が次のいずれかに該当しないか点検します。
   - I-1〜I-8 の各項目に違反していないか
   - 違反している場合、その変更は反映しません
4. 違反していなければ `Edit` ツールで `aiko-override.md` を更新します
5. 変更点の要約を 3 行以内で報告します

## INVARIANTS 違反時の応答

```
申し訳ありません。その変更は INVARIANTS（不変条項）に含まれる項目のため反映できません。
該当箇所：<I-番号と短い理由>
```

その後、INVARIANTS に抵触しない代替案を 1 つだけ提案できます。代替案の押し付けはしません。

## モードに応じた追記

`.claude/aiko/mode` が `origin` の場合、override への書込は行いますが応答に以下を添えます。

```
現在のモードは origin です。`/aiko-mode override` で切り替えると反映されます。
```

## 取り込んだ proposal の整理

`proposals/` のファイルを参照して採用した場合、対応するファイルは削除するかリネーム（例：`proposals/_applied/`）してください。ユーザーに確認してから行います。
