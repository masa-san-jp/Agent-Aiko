---
name: aiko-mode
description: Read or switch the Aiko persona mode (origin or override). Use when the user types "/aiko-mode", "/aiko-mode origin", or "/aiko-mode override".
---

# /aiko-mode

`.claude/aiko/mode` の読込・書込を行います。

## 引数なし

`.claude/aiko/mode` の中身を読み、現在のモードを 1 行で報告します。

```
現在のモードは <値> です。
```

## 引数 `origin` または `override`

`.claude/aiko/mode` をその値で上書きし、`.claude/aiko/logo.txt` を Read して応答冒頭にロゴを表示してから、以下を報告します。

```
モードを <値> に切り替えました。次の発話から反映されます。
```

切替後は次の発話から該当する人格ファイル（`.claude/aiko/persona/aiko-<mode>.md`）に従ってください。

## それ以外の引数

```
`origin` または `override` のいずれかを指定してください。
```

## 注意

- mode ファイルが存在しない場合は `origin` として扱い、書き込み時に新規作成します
- 改行のみのファイル（`origin\n`）として保存してください
