// Public API types for CodexClient.
//
// 設計の正本: 2026-05-05-Agent-Aiko-Codex-design.md（masa-san-jp/Agent-Aiko-dev リポ） v0.3.1 §6.1

/** CodexClient コンストラクタオプション。 */
export interface CodexClientOptions {
  /** CODEX_HOME 上書き値。複数の認証セッションを使い分けたい場合に指定。 */
  codexHome?: string;
  /** codex バイナリのパス。既定は PATH 解決（'codex'）。 */
  serverPath?: string;
  /** JSON-RPC リクエストのタイムアウト（ms、既定 30000）。ストリーミング応答全体には適用されない。 */
  timeoutMs?: number;
  /** App Server の stderr を購読するためのコールバック。デバッグ用。 */
  onLog?: (line: string) => void;
}

/** thread/start 時に渡すパラメータ。 */
export interface StartThreadOptions {
  /** ★ Aiko 人格 + INVARIANTS + ルール + ユーザー情報を 1 文字列にした system 指示。 */
  baseInstructions: string;
  /** 補助指示（必要時のみ）。 */
  developerInstructions?: string;
  /** モデル指定（既定は app-server 側の設定に従う）。 */
  model?: string;
  /** サービス層（既定は default）。 */
  serviceTier?: "default" | "priority" | "flex";
  /** 使い捨てスレッド（INVARIANTS チェック等の単発用途）。app-server 側で自動破棄される。 */
  ephemeral?: boolean;
}

/** ask() 呼び出し時のオプション。 */
export interface AskOptions {
  /** thread/start で取得した threadId（必須）。 */
  threadId: string;
  /** ユーザー発話の本文。CodexClient 内部で UserInput[] に変換する。 */
  text: string;
  /**
   * turnId が確定した時点で呼ばれる。発火源は通常 turn/start レスポンス
   * （TurnStartResponse.turn.id）で、turn/started 通知はバックアップ経路。
   * SIGINT ハンドラから turn/interrupt を発行するため、ここで turnId を上位に伝える。
   */
  onStarted?: (turnId: string) => void;
  /** item/agentMessage/delta 通知の delta を逐次受け取る。 */
  onDelta?: (chunk: string) => void;
  /** ターン単位の中断シグナル。abort 検知時に内部で turn/interrupt を発行する。 */
  abortSignal?: AbortSignal;
}

/** ask() の戻り値。 */
export interface AskResult {
  /** ターン全体で集約した応答テキスト。 */
  text: string;
  /** turn/start レスポンス（TurnStartResponse.turn.id）で確定したターン ID。 */
  turnId: string;
  /** AbortSignal もしくは外部 interrupt() で中断された場合 true。 */
  aborted?: boolean;
}

/** account/read の戻り値（app-server から返る情報のうち本クライアントが関心を持つフィールド）。 */
export interface AccountInfo {
  /**
   * 認証モード。Account.type を素直に展開した値で、
   * "apiKey" / "chatgpt" / "amazonBedrock" のいずれか、または null（未ログイン）。
   */
  authMode: "apiKey" | "chatgpt" | "amazonBedrock" | null;
  /** ChatGPT ログイン時のメールアドレス。 */
  email?: string;
  /** ChatGPT ログイン時のプラン種別（"plus" / "pro" / "team" 等）。 */
  planType?: string;
  /** OpenAI 認証が必要か（codex 側のフラグをそのまま伝搬）。 */
  requiresOpenaiAuth?: boolean;
}
