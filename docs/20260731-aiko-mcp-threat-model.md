# Aiko-MCP Threat Model

対象: [`20260730-aiko-mcp-usage-distribution-maintenance-design.md`](20260730-aiko-mcp-usage-distribution-maintenance-design.md)（以下「設計書」）の実装。
位置づけ: 設計書 §15 Phase 0 が「Threat Model 未着手 — Phase 5（配布・署名）までに用意する」と定めたもの。**Phase 5 の実装はこの文書の対策項目を満たすこととする。**

作成 2026-07-31。設計書が上位の正本であり、本文書が設計書と矛盾する場合は設計書を優先する。

---

## 1. なぜ配布経路から書くか

Aiko-MCP は**人格を実行環境へ注入する**。注入される指示文が偽物であれば、利用者は偽の Aiko と会話し、その Aiko は利用者の環境で動くツールの許可を持つ。したがって「合成した Profile が正しいか」より前に、**「合成の材料が本物か」**が壊れると全部が壊れる。

材料は3つ。**コード**（installer / MCP サーバー / Adapter）、**人格**（Persona Package）、**利用者情報**（User Profile・Permission Manifest）。本文書はこの3つが偽装・改竄・漏洩する経路を並べる。

## 2. 現状の配布経路（実測 2026-07-31）

`README.md` が案内する導入は次の形になっている（`INSTALL.md` は `git clone` 経由を案内しており、経路が2本ある）。

```
curl -fsSL https://raw.githubusercontent.com/masa-san-jp/Agent-Aiko/main/scripts/install.sh | bash
```

`scripts/install.sh`（38行）は互換ラッパーで、自身が実ファイルでない場合＝`curl | bash` の場合は、**もう一度 raw URL を叩いて `claude-code/scripts/install.sh` を取得し、それを実行する**。

この経路について、いま存在しないものを事実として並べる。

| 期待されるもの | 現状 |
|---|---|
| 取得したスクリプトの checksum 照合 | **無い** |
| 署名（signed tag / artifact attestation）の検証 | **無い** |
| バージョンの固定（既定で `main` の先端を取る） | **無い**（`REF` の既定が `main`） |
| 取得元の切替を防ぐ仕組み | **無い**（`AGENT_AIKO_REF` 環境変数で任意の ref に切替可能） |
| SBOM | **無い** |
| SECURITY.md / 脆弱性報告窓口 | **無い** |

設計書 §11.4 は checksum・signed tag・attestation・SBOM・lockfile・SECURITY.md・報告窓口を「提供する」と書いている。**現状はそのいずれも実装されていない。** Phase 5 が埋めるべき差分はここ。

---

## 3. 資産と信頼境界

### 3.1 守る対象

| 資産 | 壊れたときに起きること | 設計書 |
|---|---|---|
| Persona Package（人格本文・Invariants） | 偽の人格が起動する。Invariants を抜けば「守るはずのこと」を守らない Aiko が動く | §5.1・§6.5 |
| コード（installer / MCP Server / Adapter） | 利用者の端末で任意コードが動く | §10.1 |
| User Profile / Relationship Profile | 呼び名・関係性・記憶参照の漏洩。0600 指定あり | §11.1・§11.3 |
| Permission Manifest | 権限の拡大。使えないはずのツールが使える | §5.5・§6.3 |
| Runtime Profile | 注入内容の改竄。profile hash の追跡が無意味になる | §5.3・§6.5 |

### 3.2 信頼境界

```
[GitHub Releases / raw]  ──①──>  [利用者端末のファイル]  ──②──>  [MCP Server プロセス]
                                        │                              │
                                        ③                              ④
                                        v                              v
                            [他プロセス・他ユーザー]        [Runtime（Claude Code / Codex）]
```

- ① 取得（ネットワーク・供給元）— **本文書の主眼**
- ② 読み出し（ローカルファイル権限）
- ③ 同一端末の他プロセスからの読み書き
- ④ Runtime への注入（stdio 越し）

### 3.3 対象外（明示）

- リモート版（設計書 §15 Phase 6）の OAuth / OIDC / organization policy。本文書は**ローカル stdio 構成のみ**を対象とする
- 利用者端末が既に侵害されている場合。root を取られた端末を守る手段は本設計の範囲外（設計書 §16 が「root 権限を要求しない」と定めており、逆に root を前提とした防御も置かない）
- LLM そのものへのプロンプトインジェクション。人格注入の正しさは §12.1 Persona Golden Test が扱う

---

## 4. 脅威

深刻度は「利用者にとって取り返しがつくか」で付ける。**High = 気付かずに侵害が成立し、後から検知もできない。**

### T1. 導入時の取得物のすり替え（High）

`curl | bash` で取得するスクリプトに checksum も署名も無いため、以下のいずれかが成立すれば利用者の端末で任意コードが動く。

- GitHub アカウント／リポジトリの侵害（`main` に1コミット入れば全新規導入者に届く）
- ラッパーが2回目に叩く raw URL への介入
- `AGENT_AIKO_REF` を設定させる社会工学（「このブランチで試して」と書かれた記事1本で成立する）

**検知可能性: 無い。** 利用者側に照合する材料が存在しない。

**対策（Phase 5）**
- 成果物を GitHub Releases に置き、`SHA256SUMS` を併記する。installer は取得したファイルの checksum を照合してから実行する
- signed tag と artifact attestation を付ける（設計書 §11.4）
- **既定の取得先をタグに固定する。** `main` の先端を既定にしない。`AGENT_AIKO_REF` は「開発時に明示的に外す」ものとして残し、既定経路では使わせない
- `INSTALL.md` の案内を「ダウンロード → checksum 照合 → 実行」の3手順に変える。1行の `curl | bash` を残す場合でも、照合を含む形にする

### T2. Persona Package のすり替え（High）

人格本文と Invariants は installer が `~/.aiko/` へ配置する。**現状、配置後のファイルが本物かを確かめる手段が無い。**

Invariants を空にした Persona Package を置ければ、設計書 §6.5 の fail-closed は素通りする（Binder は「Invariants が**無い**」ときに止まるが、「Invariants が**書き換えられている**」ことは判定できない）。

**対策（Phase 5）**
- Persona Package に対する checksum を Release に含め、`aiko persona update` が適用前に照合する
- 設計書 §11.3 が Persona Package に `0444` を指定している。installer が実際にそのモードを設定しているかを Fresh Install テスト（§12.1）で検証する
- Runtime Profile に含める provenance に、**適用した Persona Package の checksum** を入れる。profile hash だけでは「何から作られたか」が追えない

### T3. 更新経路の悪用（High）

`aiko update` は未実装。実装時に T1 と同じ穴を再現しやすい。とくに `--channel nightly`（`main` 自動ビルド）は、レビューを経ていない成果物を配る経路になる。

**対策（Phase 5）**
- update も checksum + 署名検証を必須にする。検証に失敗したら**適用せず現行を維持する**（fail closed）
- 設計書 §10.4 の「patch のみ自動更新可・minor / major は承認要求」を実装で強制する。channel の既定は `stable`
- nightly は明示的な opt-in に限り、検証を緩めない

### T4. ロールバックによるダウングレード（Medium）

`aiko rollback` で任意の旧版へ戻せると、既知の脆弱性のある版へ誘導できる。

**対策（Phase 5）**
- ロールバック先も署名検証の対象にする
- 「安全でない版として撤回された版」への rollback は拒否する（Release 側に撤回情報を持たせる）
- 設計書 §10.5 の「ユーザーデータはロールバック対象に含めない」を守る。データを巻き戻せると、削除したはずの情報が復活する

### T5. ローカルファイルからの情報漏洩（Medium・実測で不適合を確認）

設計書 §11.3 は `~/.config/aiko/` を `0700`、User Profile / Relationship Profile / Runtime Profile を `0600` と定めている。**実測したところ、この指定は適用されていない。**

```
$ ls -ld ~/.aiko
drwxrwxr-x 33 masa masa 4096  7月 30 19:54 /home/masa/.aiko
```

`0775` であり `0700` ではない。`claude-code/scripts/install.sh` は状態ファイルを `cp -R` で置くだけで、`chmod 600` / `chmod 700` を一度も発行していない（明示的な `chmod` は `644` と `u+w` のみ）。つまり権限は umask 任せで、同一端末の他ユーザーから読める状態になりうる。

あわせて**置き場そのものが設計書とずれている**。§11.3 は `~/.config/aiko/`、実装は `~/.aiko/`。どちらを正とするかを決めないと、権限の話が宙に浮く。

**対策**
- 置き場を決める（§11.3 を実装に合わせるか、実装を §11.3 に寄せるか）
- installer が状態ファイル生成後に明示的にモードを設定する
- Fresh Install テストで、生成された各ファイルの**実モードを assert** する（§12.1 の Security Test）。仕様に書いてあるだけでは今回のようにずれる
- 既存インストールに対しては、`aiko doctor` 相当で緩い権限を検出して直す

### T6. 認証情報の混入（Medium）

設計書 §3.3 は「認証情報を扱わない」と定め、Capability Manifest に認証情報が含まれる場合は拒否する実装が既にある（`packages/mcp-server` のテスト「認証情報を含む Manifest は拒否する（§3.3）」）。

残るリスクは**ログ**。設計書 §16 の受入基準に「認証情報をログへ記録しない」がある。

**対策**
- ログ出力に対する Security Test を追加する（トークン形式の文字列がログに出ないこと）
- Runtime Profile を含むデバッグ出力を既定で無効にする

### T7. 依存の汚染（Medium）

`packages/*` は npm 依存を持つ（`@modelcontextprotocol/sdk`・`zod`・`ajv`・`tsx`・`typescript`）。lockfile はルートに1本ある（#55）。

**対策**
- `npm audit` を CI に入れる（設計書 §12.2 が `dependency audit` を挙げている・**現状の CI には無い**）
- SBOM を Release に添付する
- 依存追加時は lockfile 差分をレビュー対象にする

### T8. MCP stdio 越しの入力（Low）

MCP Server は stdio で Runtime と話す。Runtime 側は利用者が起動したプロセスであり、境界としては信頼側に近い。ただし Tool 引数は外から来る値として扱う。

**対策**
- Tool 入力は zod で検証済み（実装あり）。Resource URI のパス解決に `..` を通さないことをテストで固定する

---

## 5. Phase 5 の受入条件（この文書の要求）

設計書 §16 の受入基準に、本文書から次を足す。

1. 導入・更新・ロールバックのすべてで、**適用前に checksum を照合し、失敗したら適用しない**
2. 既定の取得先は**タグ**であり、`main` の先端ではない
3. Release に `SHA256SUMS`・署名・SBOM が付く
4. `SECURITY.md` と報告窓口がある
5. Fresh Install テストが、生成ファイルの**実際の権限**を assert する
6. CI に `dependency audit` がある
7. Runtime Profile の provenance から、**適用された Persona Package の checksum が辿れる**

## 6. 未確定（マサさん判断が要るもの）

- **署名方式**: signed tag（GPG）と GitHub artifact attestation（Sigstore）のどちらを主にするか。attestation は鍵の管理が要らない代わりに GitHub への依存が増える。両方やる案もある
- **`curl | bash` を残すか**: 設計書 §16 は「1コマンドで導入できる」を受入基準にしている。checksum 照合を挟むと最短でも2手順になる。**受入基準と T1 の対策は正面から衝突する**ので、どちらを取るかは判断が要る（案: 1行を維持しつつ、その1行の中で照合まで行う installer を配る＝利用者から見て1コマンド、実体は照合あり）
- **撤回情報の持ち方**: T4 の「撤回された版への rollback を拒否する」をどこに置くか（Release の metadata か、別の manifest か）
