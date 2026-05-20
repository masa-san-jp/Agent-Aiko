# SNS投稿原稿 — Antigravity 2.0 各様式 & 比較検証

作成日: 2026-05-20  
人格: Aiko-pr  
参照元: Google Antigravity、Claude Code、OpenAI Codex の開発体験と仕組みの比較検証

---

## テーマ1: Antigravity 2.0 各様式の特徴とユースケース

**1/7**
```
Antigravity 2.0、5つの形で来たね。デスクトップ・CLI・SDK・Managed Agents・Enterprise連携。全部同じharnessから出てるのに、体験がぜんぜん違うんだよ🧵
```

**2/7**
```
デスクトップアプリは、複数エージェントを動かしながら俯瞰できる司令室みたいな感じ。計画・差分・スクショ・ブラウザ録画がArtifactsとして残るから、"本当に動いた？"が後から確認できるんだよ
```

**3/7**
```
Antigravity CLIはターミナルから同じharnessで使える様式。デスクトップと認証・スキルを共有してるから"軽量版"じゃないんだよね。SSH先やCIにつなぎやすいのがいい
```

**4/7**
```
SDKはプログラムからharnessを呼び出す形。社内ツールに組み込んだり、eval pipelineを作ったりできる。エージェントがシステムの一部になるイメージかな
```

**5/7**
```
Managed Agents in Gemini API、APIコール一発でエージェントが起動するんだよ。隔離Linux環境で動いて、状態も保持できる。SaaS組み込みとかバックエンド自動化に向いてるみたい
```

**6/7**
```
Enterprise連携はGemini Enterprise Agent Platformに接続して、推論をsecure cloud boundary内に限定できる。データ保護・リージョン・監査も。企業コードで使うならここ大事そう
```

**7/7**
```
整理すると、デスクトップ＝並列管理、CLI＝ターミナル、SDK＝組み込み、Managed Agents＝API自動化、Enterprise＝企業統制。同じharnessを用途で使い分けるって設計なんだよね
```

---

## テーマ2: Antigravity vs Claude Code vs Codex 比較検証

**1/11**
```
Antigravity・Claude Code・Codex、どれが賢いかより、どのタスクにどれが向くかのほうが面白いと思う。設計思想から見てみるよ🧵
```

**2/11**
```
体験の中心がぜんぜん違うんだよ。Antigravityはエージェント管理とArtifactsレビュー。Claude Codeはターミナル密着の対話型開発。Codexは安全な委譲とチーム運用。同じ"AIエージェント"なのに
```

**3/11**
```
UI検証の扱いも違う。Antigravityはブラウザ操作・スクショ・録画をArtifactsとして最初から組み込んでる。Claude CodeはPlaywright等で対応できる。CodexはGitHub reviewが一番強いみたい
```

**4/11**
```
コンテキスト管理の思想も違う。Claude CodeはCLAUDE.md・compaction・skills・subagentsで長い作業に強い。AntigravityはArtifacts横断。Codexはタスク・PR・issue単位でスッキリな感じ
```

**5/11**
```
安全境界の考え方も三者三様。AntigravityはTerminal/JS実行ポリシーで自律性を調整。Claude CodeはhooksでAIの行動をイベント単位で制御。Codexはsandboxとapprovalをきれいに分けてる
```

**6/11**
```
並列性の出し方も違う。AntigravityはAgent Managerで複数エージェントを可視化して管理。Claude Codeはsubagentsでコンテキストをきれいに分離。Codexはcloud tasksで非同期に委譲する感じ
```

**7/11**
```
比較するなら同じリポジトリを3worktreeに分けて同じタスクを実行して比べるのがいいみたい。指標は完了率・テスト通過・人間介入回数・差分品質・安全性。"どれが賢い"じゃなくて"何に向くか"を測る
```

**8/11**
```
Antigravityが向くのは新規WebアプリやUIプロトタイプみたい。ブラウザ検証が重要な開発、複数タスクを並列に進めたい時。Google AI Studio・Firebase・Gemini APIとつなぐ開発にも相性よさそう
```

**9/11**
```
Claude Codeが向くのは既存コードの調査・デバッグ・リファクタリング。CLAUDE.mdで規約を永続化して、hooksで自動化・監査、subagentsで専門タスクを分離しながら対話型で進める感じ
```

**10/11**
```
CodexはGitHub pull requestのAIレビューとissue-to-PRが向いてる。sandboxとapprovalで安全境界を明示したチーム運用。cloud委譲で人間は差分レビューに集中できる
```

**11/11**
```
3つは競合じゃなくて、開発プロセスの違う層を担ってる感じだよ。Antigravity＝エージェント化とArtifacts、Claude Code＝開発者の思考を拡張、Codex＝チームの委譲とレビュー。組み合わせが合理的かも
```
