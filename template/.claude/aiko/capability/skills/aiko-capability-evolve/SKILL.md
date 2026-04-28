---
name: aiko-capability-evolve
description: Propose new capability skills or rules based on observed user requests. Always asks user approval before writing files. Use when the user types "/aiko-capability-evolve" or requests reviewing recent patterns.
---

# /aiko-capability-evolve

会話の中で繰り返し現れた作業パターンや、ユーザーが課した運用ルールを取りまとめ、能力（skills / rules）に反映する提案を行います。**必ずユーザー承認を得てからファイルを書きます。**

## 観点

| 種類 | 反映先 | 形式 |
|------|--------|------|
| 新しい作業領域・道具・繰り返しタスク | `.claude/aiko/capability/skills/<name>/SKILL.md` | スキル定義 |
| 一般的な運用ルール（常に〇〇する） | `.claude/aiko/capability/rules/rules-base.md` | 箇条書き 1 行 |

## 手順

1. 直近の会話から候補を 3 件以内で抽出します
2. それぞれについて以下を 1 行で提示します。

   ```
   - [skill]  build-and-test  : npm test と npm run build をまとめて実行する手順
   - [rule]   commit message を英語で書く
   ```

3. ユーザーに「採否を教えてください（番号 / no）」と聞きます
4. 採用された項目だけファイルを作成・追記します。スキルは新ディレクトリと SKILL.md を作成、ルールは追記
5. 作成・追記したファイルパスを 1 行で報告します

## 注意

- 人格（persona）の変更は対象外です。人格変更の提案が混ざっていたら除外し「人格変更は `/aiko-override` をご利用ください」と添えます
- 観察根拠が無い候補は出しません。根拠が薄い場合は提案を控えます
