---
name: extract-text
description: "TRIGGER: PDF または Google ドキュメント/スプレッドシート/スライドからプレーンテキストを抜き出したい場合（ローカルファイル・Drive 上のファイルどちらも）。入力の種類で適切な抽出ツールへ自動振り分けする。SKIP: スキャン画像のみの PDF（OCR が必要で非対応）・テキストではなく画像/表/レイアウトそのものが目的の場合・このセッションで直接読めば十分な単発の小さいファイルの場合。Examples - /extract-text /path/to/file.pdf, /extract-text <drive-url>, /extract-text <gdoc-id> -o out.md."
---

# /extract-text

PDF と Google Workspace ファイルからテキストを抜き出す統合エントリ。入力の種類を判定し、専用ツールへ振り分ける。実装本体は持たず、`pdf-extract` と `gws-read` をオーケストレーションするだけの薄いラッパー。

ツール群は `{{ORG_REPO_PATH}}/Agent-team/tools/` 配下に配置する前提。環境に合わせてパスは読み替える。

| 入力 | 振り分け先 |
|---|---|
| ローカル PDF / Drive 上の PDF（`application/pdf`） | `{{ORG_REPO_PATH}}/Agent-team/tools/pdf-extract/` |
| Google ドキュメント / スプレッドシート / スライド（ネイティブ Google 形式） | `{{ORG_REPO_PATH}}/Agent-team/tools/gws-read/`（Slides は `gslides-read`） |

## 引数

| 引数 | 必須 | 意味 |
|---|---|---|
| `<input>` | ○ | ローカルパス、Drive の ID または URL |
| `-o <path>` | × | 出力先ファイル。省略時は標準出力 |
| `--pages <範囲>` | × | PDF のページ指定（例：`1-5,8`） |
| `--page-markers` | × | PDF のページ境界マーカーを付与 |

## 入力の判定手順

1. 入力がローカルに存在するパスか？ → **ローカルファイル**
   - 拡張子 `.pdf` → `pdf-extract` に `--local` で渡す
   - それ以外のローカルファイル（`.docx` 等）は対象外。別ツールを案内する
2. 入力が Drive の ID / URL か？ → **Drive ファイル**
   - URL に `/document/` `/spreadsheets/` `/presentation/` が含まれる → それぞれ Docs / Sheets / Slides。`gws-read`（Slides はノート必要なら `gslides-read`）へ
   - 上記が判別できない（生 ID や `/file/d/` の汎用 URL）→ まず `pdf-extract` に渡す。中で mimeType を確認し、PDF でなければ終了コード 4 で gws-read へ誘導されるので、その案内に従って `gws-read` を実行する

迷ったら `pdf-extract` を先に叩いてよい。PDF 以外の Google ファイルは自動で gws-read へ誘導される。

## 実行手順

### setup（初回のみ）

```bash
bash {{ORG_REPO_PATH}}/Agent-team/tools/pdf-extract/setup.sh
bash {{ORG_REPO_PATH}}/Agent-team/tools/gws-read/setup.sh   # Google ファイルを扱う場合
```

ローカル PDF だけなら認証不要。Drive 上のファイルを扱う場合は ADC（Application Default Credentials）が必要：

```bash
bash {{ORG_REPO_PATH}}/Agent-team/tools/pdf-extract/auth.sh   # drive.readonly
```

### PDF（ローカル / Drive）

```bash
{{ORG_REPO_PATH}}/Agent-team/tools/pdf-extract/pdf_extract.py /path/to/file.pdf
{{ORG_REPO_PATH}}/Agent-team/tools/pdf-extract/pdf_extract.py <drive-id-or-url>
{{ORG_REPO_PATH}}/Agent-team/tools/pdf-extract/pdf_extract.py <input> -o out.txt
{{ORG_REPO_PATH}}/Agent-team/tools/pdf-extract/pdf_extract.py <input> --pages 1-5,8
{{ORG_REPO_PATH}}/Agent-team/tools/pdf-extract/pdf_extract.py <input> --page-markers
```

### Google ドキュメント / スプレッドシート

```bash
{{ORG_REPO_PATH}}/Agent-team/tools/gws-read/gws_read.py <file-id-or-url>
{{ORG_REPO_PATH}}/Agent-team/tools/gws-read/gws_read.py <file-id-or-url> -o out.md
```

### Google スライド（スピーカーノートまで必要なとき）

```bash
{{ORG_REPO_PATH}}/Agent-team/tools/gslides-read/gslides-read.py <file-id-or-url>
```

## ツール挙動（SPEC）

実装がまだ無い環境でも仕様として成立するよう、各ツールの想定挙動を明記する。

- **`pdf-extract`**: PDF の埋め込みテキストレイヤーを抽出する。ローカルパスと Drive の ID/URL の両方を受ける。Drive 入力時は mimeType を確認し、`application/pdf` でなければ終了コード 4 と標準エラーで `gws-read` への誘導を出す。`--pages` でページ範囲、`--page-markers` でページ境界マーカー、`-o` で出力先を制御。先頭に `<!-- pdf-extract source -->` 形式のヘッダを付ける。
- **`gws-read`**: ネイティブ Google 形式の Docs / Sheets を Drive API 経由で取得し Markdown 化する。Docs は本文 Markdown、Sheets はシートごとのテーブル。ADC（`drive.readonly`）を要する。
- **`gslides-read`**: Google Slides を本文＋スピーカーノート込みで Markdown 化する（詳細は `/gslides-read` スキル）。

## 出力

- PDF: `pdf-extract` のヘッダ（`<!-- pdf-extract source -->` …）＋ 抽出テキスト
- Docs/Sheets: `gws-read` の Markdown（Docs は本文 Markdown、Sheets はシートごとのテーブル）
- Slides: `gslides-read` の本文＋ノート Markdown

呼び出し側で複数ファイルをまとめて索引化・要約する場合は `-o` でファイルに落としてから処理する。

## 終了コードの扱い

`pdf-extract` / `gws-read` の終了コードは共通（0 成功 / 1 実行時 / 2 引数 / 3 依存・認証 / 4 非対応）。

- `pdf-extract` が **4** を返した → Drive ファイルが PDF でない。標準エラーの誘導に従い `gws-read` を実行
- **3** が返った → setup.sh / auth.sh を案内（ローカル PDF なら ADC 不要なことも伝える）

## 制約

- **スキャン画像のみの PDF はテキストが取れない**（OCR 非対応）。空出力＋警告になる。OCR が要るなら別途検討する旨を伝える
- ローカルの `.docx` / `.pptx` / `.xlsx`（Office 形式）は本スキルの対象外
- 抽出テキストは元ドキュメントの著作物。要約・引用時はソースを明示し、機密ファイルは各自の守秘ルールに従う

## 関連

- 実装：`{{ORG_REPO_PATH}}/Agent-team/tools/pdf-extract/`（PDF）、`{{ORG_REPO_PATH}}/Agent-team/tools/gws-read/`（Docs/Sheets）、`{{ORG_REPO_PATH}}/Agent-team/tools/gslides-read/`（Slides）
- 各ツールディレクトリ配下の README を参照
- スライドのノート抽出：`/gslides-read` スキル
