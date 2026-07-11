---
name: gslides-read
description: "TRIGGER: Google Slides の URL または fileId が提供され、スピーカーノートを含むスライド全体の内容が必要な場合（Drive の通常エクスポートではノートが省略されるため）。SKIP: Google Slides 以外のファイル形式（PDF・Docs・Sheets 等）・ノートが不要でスライドタイトルのみ必要な場合・オフラインまたは ADC 未設定の場合。Examples - /gslides-read <url>, /gslides-read <fileId> -o deck.md."
---

# /gslides-read

Google Slides を `.pptx` として Drive API でダウンロードし、各スライドの本文とスピーカーノートを Markdown で取り出すスキル。実装本体は `{{ORG_REPO_PATH}}/Agent-team/tools/gslides-read/` に配置する前提（薄いラッパー）。環境に合わせてパスは読み替える。

## 引数

| 形 | 用途 |
|---|---|
| `/gslides-read <file-id-or-url>` | 標準出力に Markdown を吐く |
| `/gslides-read <file-id-or-url> -o <path>` | 指定先に書き出す |
| `/gslides-read <file-id-or-url> --title "Deck Name"` | 見出しにタイトルを付与 |
| `/gslides-read setup` | 依存インストール + ADC 確認 |

入力は生のファイル ID（`<FILE_ID>`）か Drive 共有 URL（`/presentation/d/<FILE_ID>/...`）どちらでも可。

## 実行手順

### setup（初回のみ）

```bash
bash {{ORG_REPO_PATH}}/Agent-team/tools/gslides-read/setup.sh
```

ADC（Application Default Credentials）が無い、または `drive.readonly` スコープが付いていない場合：

```bash
gcloud auth application-default login \
    --scopes='https://www.googleapis.com/auth/drive.readonly'
```

### 通常実行

```bash
{{ORG_REPO_PATH}}/Agent-team/tools/gslides-read/gslides-read.py <file-id-or-url>
{{ORG_REPO_PATH}}/Agent-team/tools/gslides-read/gslides-read.py <file-id-or-url> -o out.md
{{ORG_REPO_PATH}}/Agent-team/tools/gslides-read/gslides-read.py <file-id-or-url> --title "Deck Name"
```

## ツール挙動（SPEC）

実装がまだ無い環境でも仕様として成立するよう、想定挙動を明記する。

- 入力の ID / URL から Drive ファイルを特定し、Drive API の export で `.pptx`（`application/vnd.openxmlformats-officedocument.presentationml.presentation`）としてダウンロードする。
- ダウンロードした `.pptx` を解析し、スライドごとに本文テキストとスピーカーノートを抽出する。Drive の通常 Markdown/テキストエクスポートはノートを落とすため、`.pptx` 経由でノートを確保する点が肝。
- 出力は下記フォーマットの Markdown。`--title` 指定時は先頭に H1 を付ける。`-o` 指定時はファイルへ書き出し、省略時は標準出力。
- 認証は ADC の `drive.readonly` を利用。

## 出力

```markdown
# (オプションのタイトル)

## Slide 1

### Content
スライド本文

### Speaker Notes
スピーカーノート本体

---

## Slide 2
...
```

## 終了コード

| コード | 意味 |
|---|---|
| 0 | 成功 |
| 1 | ダウンロード / 実行時エラー |
| 2 | 引数違反 |
| 3 | 依存欠落、または ADC 不備 |

## 用途

- ネイティブ Google Slides のエクスポートがスピーカーノートを落とすため、ノートまで欲しい時の補完
- プレゼンの原稿レビュー、時間配分計算（ノートの文字数）
- バッチで複数デッキの内容＋ノートを一括テキスト化、要約・索引化

## 制約

- Google Slides ファイル限定（オリジナル PowerPoint アップロード版は要動作確認）
- スコープ：`drive.readonly` 推奨。`drive.file` だと自分が作ったファイル以外で失敗することがある
- ノート内の画像・図形はテキスト抽出できない
- API クォータ：Drive API デフォルト枠で個人利用は十分。バッチでの大量取得は注意
- スライド内容・ノートは元のドキュメントの著作物。要約・引用する際はソースを明示。機密スライド（人事・財務・契約）の取り扱いは各自の守秘ルールに従う

## 関連

- 実装：`{{ORG_REPO_PATH}}/Agent-team/tools/gslides-read/`
- README：`{{ORG_REPO_PATH}}/Agent-team/tools/gslides-read/README.md`
- テキスト抽出の統合エントリ：`/extract-text` スキル
