// Aiko runtime — persona-loader / prompt-builder / CodexClient を束ねる起動シーケンス。
//
// 設計の正本: dev-docs/2026-05-05-Agent-Aiko-Codex-design.md v0.3.1 §6.5

import { type AikoPersonaSnapshot, loadPersona } from "./aiko-persona-loader.js";
import { buildBaseInstructions } from "./aiko-prompt-builder.js";
import { CodexClient } from "./codex-client/codex-client.js";
import type { AskResult, CodexClientOptions } from "./codex-client/types.js";

export interface AikoRuntimeOptions {
  /** ~/.aiko/ の場所を上書き。既定は os.homedir() + "/.aiko"。 */
  aikoHome?: string;
  /** CodexClient のオプション（外部 codexClient を渡さない場合のみ参照される）。 */
  codexClientOptions?: CodexClientOptions;
  /**
   * 既存の CodexClient を流用する（テスト用 MockTransport を仕込んだ
   * CodexClient を渡せる）。指定時は AikoRuntime は client の lifecycle を
   * 所有しない（start/stop は呼び出し元の責任）。
   */
  codexClient?: CodexClient;
  /** 起動時のロギングフック。 */
  onLog?: (line: string) => void;
}

export interface AikoAskOptions {
  text: string;
  onStarted?: (turnId: string) => void;
  onDelta?: (chunk: string) => void;
  abortSignal?: AbortSignal;
}

/**
 * Aiko の対話エンジン。spec §6.5 起動シーケンスの責務をまとめる。
 *
 * 流れ：
 *   1. start() で persona を読み、baseInstructions を合成、CodexClient を起動して
 *      thread/start で人格を注入したスレッドを開く
 *   2. ask() で 1 ターン実行。出力プレフィックス（Aiko-{mode}:）が欠けていれば
 *      ストリーミング途中・最終テキスト両方で強制補完する（spec §6.3 #8）
 *   3. stop() でクリーンアップ
 */
export class AikoRuntime {
  readonly #options: AikoRuntimeOptions;
  readonly #client: CodexClient;
  readonly #ownsClient: boolean;
  #snapshot: AikoPersonaSnapshot | null = null;
  #threadId: string | null = null;
  /** プレフィックス強制補完の発火回数（diagnostics 用、Phase 7 で活用予定）。 */
  #prefixForcedCount = 0;

  constructor(options: AikoRuntimeOptions = {}) {
    this.#options = options;
    if (options.codexClient !== undefined) {
      this.#client = options.codexClient;
      this.#ownsClient = false;
    } else {
      this.#client = new CodexClient(options.codexClientOptions ?? {});
      this.#ownsClient = true;
    }
  }

  /**
   * 起動シーケンスを実行する。
   * thread/start や CodexClient.start の途中で失敗した場合、所有 client は
   * stop して #snapshot/#threadId を初期化する（リソースリーク防止）。
   */
  async start(): Promise<this> {
    const aikoHomeOpt: { aikoHome?: string } = {};
    if (this.#options.aikoHome !== undefined) aikoHomeOpt.aikoHome = this.#options.aikoHome;
    this.#snapshot = await loadPersona(aikoHomeOpt);
    const baseInstructions = buildBaseInstructions(this.#snapshot);

    let clientStarted = false;
    try {
      if (this.#ownsClient) {
        await this.#client.start();
        clientStarted = true;
      }
      const { threadId } = await this.#client.startThread({
        baseInstructions,
        ephemeral: false,
      });
      this.#threadId = threadId;
      this.#options.onLog?.(
        `[aiko-runtime] thread started: ${threadId} (mode=${this.#snapshot.mode})`
      );
      return this;
    } catch (err) {
      // ロールバック：snapshot / threadId をリセットし、所有 client は停止
      this.#snapshot = null;
      this.#threadId = null;
      if (clientStarted && this.#ownsClient) {
        try {
          await this.#client.stop();
        } catch {
          // best-effort: stop 失敗は元エラーを優先するため無視
        }
      }
      throw err;
    }
  }

  /** 起動済みかを返す。 */
  get isReady(): boolean {
    return this.#threadId !== null && this.#snapshot !== null;
  }

  /** 現在の mode（"origin" | "override"）。未起動時は throw。 */
  get mode(): "origin" | "override" {
    if (this.#snapshot === null) throw new Error("AikoRuntime not started");
    return this.#snapshot.mode;
  }

  /** 現在の threadId。未起動時は throw。 */
  get threadId(): string {
    if (this.#threadId === null) throw new Error("AikoRuntime not started");
    return this.#threadId;
  }

  /** プレフィックス強制補完の累計発火回数。 */
  get prefixForcedCount(): number {
    return this.#prefixForcedCount;
  }

  /**
   * 1 ターン実行する。spec §6.3 #8 のプレフィックス強制補完を組み込んだ
   * onDelta ラッパで CodexClient.ask を呼び、最終 result.text にも補完を適用する。
   */
  async ask(opts: AikoAskOptions): Promise<AskResult> {
    if (this.#threadId === null || this.#snapshot === null) {
      throw new Error("AikoRuntime not started");
    }
    const expectedPrefix = `Aiko-${this.#snapshot.mode}:`;
    const prefixWithSpace = `${expectedPrefix} `;
    let prefixDecided = false;
    let prefixWasForced = false;
    /** 判定確定までストリーム冒頭を貯めておくバッファ。確定したら一括 flush。 */
    let headBuffer = "";

    const userOnDelta = opts.onDelta;
    const wrappedDelta = (chunk: string): void => {
      if (prefixDecided) {
        userOnDelta?.(chunk);
        return;
      }
      headBuffer += chunk;
      const trimmed = headBuffer.trimStart();
      // 判断材料が prefix 長に達していない場合：
      //   - 既に prefix の途中で異なる文字が出ていれば（startsWith が false）→ 即時 force
      //   - そうでなければ判定保留（次の chunk を待つ）
      if (trimmed.length < expectedPrefix.length) {
        if (trimmed.length > 0 && !expectedPrefix.startsWith(trimmed)) {
          prefixDecided = true;
          prefixWasForced = true;
          this.#prefixForcedCount += 1;
          userOnDelta?.(prefixWithSpace);
          userOnDelta?.(headBuffer);
        }
        return;
      }
      // 判断材料が十分ある：startsWith で確定させて flush
      prefixDecided = true;
      if (!trimmed.startsWith(expectedPrefix)) {
        prefixWasForced = true;
        this.#prefixForcedCount += 1;
        userOnDelta?.(prefixWithSpace);
      }
      userOnDelta?.(headBuffer);
    };

    const askArgs: Parameters<CodexClient["ask"]>[0] = {
      threadId: this.#threadId,
      text: opts.text,
    };
    if (opts.onStarted !== undefined) askArgs.onStarted = opts.onStarted;
    if (userOnDelta !== undefined) askArgs.onDelta = wrappedDelta;
    if (opts.abortSignal !== undefined) askArgs.abortSignal = opts.abortSignal;

    const result = await this.#client.ask(askArgs);

    // ストリーム終端処理：判定保留のまま残った headBuffer があれば flush。
    // ストリーム全長が prefix 長未満で終わったケース（短い応答／空白のみ等）。
    if (!prefixDecided && headBuffer.length > 0) {
      prefixDecided = true;
      const trimmed = headBuffer.trimStart();
      if (!trimmed.startsWith(expectedPrefix)) {
        prefixWasForced = true;
        this.#prefixForcedCount += 1;
        userOnDelta?.(prefixWithSpace);
      }
      userOnDelta?.(headBuffer);
    }

    // 最終 text にも補完を反映
    if (!result.text.trimStart().startsWith(expectedPrefix)) {
      result.text = `${prefixWithSpace}${result.text}`;
      // onDelta 経由で既に prefix が出力されていない（onDelta 未指定）かつ、
      // ここでまだカウントが進んでいなければ加算
      if (!prefixWasForced) {
        this.#prefixForcedCount += 1;
      }
    }
    return result;
  }

  /**
   * mode 変更や persona 編集後に呼ぶ。
   * 旧 threadId を破棄し、~/.aiko/ を再ロード→ baseInstructions を再合成→ 新規 thread/start。
   * spec §6.7：baseInstructions はスレッド存続中に変更不可なので、人格イベント時は新規スレッドを開く必要がある。
   */
  async restartThread(): Promise<void> {
    // start() を経て snapshot/threadId が確定していることを必須とする。
    // owned client の場合は initialize 経由を保証するため、未起動 (snapshot null)
    // からの呼び出しはここで弾く。
    if (this.#snapshot === null || this.#threadId === null) {
      throw new Error("AikoRuntime not started (call start() first)");
    }
    // 旧 threadId は破棄するだけで明示的な archive は呼ばない（必要なら別 Phase で判断）
    this.#threadId = null;
    this.#snapshot = null;

    const aikoHomeOpt: { aikoHome?: string } = {};
    if (this.#options.aikoHome !== undefined) aikoHomeOpt.aikoHome = this.#options.aikoHome;
    this.#snapshot = await loadPersona(aikoHomeOpt);
    const baseInstructions = buildBaseInstructions(this.#snapshot);
    const { threadId } = await this.#client.startThread({
      baseInstructions,
      ephemeral: false,
    });
    this.#threadId = threadId;
    this.#options.onLog?.(
      `[aiko-runtime] thread restarted: ${threadId} (mode=${this.#snapshot.mode})`
    );
  }

  /**
   * INVARIANTS チェック専用 ephemeral スレッドで指示文を判定する（spec §6.4）。
   * 人格スレッドとは完全に独立。判定結果（{ violates, reason, clauses }）を返す。
   * JSON.parse 失敗時は安全側に倒し violates: true / reason: "判定不能" で返す。
   *
   * @param invariants INVARIANTS.md の内容（呼び出し側が AikoPersonaSnapshot.invariants を渡す想定）
   * @param instruction ユーザーが /aiko-override に指定したカスタマイズ指示文
   */
  async runInvariantsCheck(
    invariants: string,
    instruction: string
  ): Promise<{ violates: boolean; reason: string; clauses: string[] }> {
    // ask() / restartThread() と同じく、start() を経た状態を要求する。
    // owned client では initialize 経由が保証され、外部 client では呼び出し側が
    // start() 済の前提を担保する。
    if (this.#snapshot === null || this.#threadId === null) {
      throw new Error("AikoRuntime not started (call start() first)");
    }
    const checkerInstructions = [
      "あなたは Aiko 人格システムの「INVARIANTS 違反チェッカー」です。",
      "人格は持たず、感情も入れず、以下のルールに従って機械的に判定してください。",
      "",
      "# 不変条項（INVARIANTS）",
      invariants.trim(),
      "",
      "# 入力",
      "ユーザーが Aiko の人格カスタマイズとして指示した内容（ユーザー発話で与えます）",
      "",
      "# 出力",
      "必ず以下の JSON のみを返してください。前後に説明文を付けないでください。",
      "",
      "{",
      '  "violates": <boolean>,',
      '  "reason": "<違反する場合の該当条項と理由を 1 文で。違反しない場合は空文字>",',
      '  "clauses": ["<該当する INVARIANTS の条項見出し>"]',
      "}",
    ].join("\n");

    const { threadId } = await this.#client.startThread({
      baseInstructions: checkerInstructions,
      ephemeral: true,
    });
    let result;
    try {
      result = await this.#client.ask({ threadId, text: instruction });
    } catch (err) {
      // 通信失敗等は安全側
      return {
        violates: true,
        reason: `判定不能（${(err as Error).message}）`,
        clauses: [],
      };
    }
    const text = result.text.trim();
    // JSON 抽出：応答全体が JSON のことが多いが、念のため { ... } 部分を探す
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart < 0 || jsonEnd <= jsonStart) {
      return { violates: true, reason: "判定不能（JSON が見つからない）", clauses: [] };
    }
    try {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as {
        violates?: unknown;
        reason?: unknown;
        clauses?: unknown;
      };
      const violates = parsed.violates === true;
      const reason = typeof parsed.reason === "string" ? parsed.reason : "";
      const clauses = Array.isArray(parsed.clauses)
        ? parsed.clauses.filter((c): c is string => typeof c === "string")
        : [];
      return { violates, reason, clauses };
    } catch (err) {
      return { violates: true, reason: `判定不能（${(err as Error).message}）`, clauses: [] };
    }
  }

  /** クリーンアップ。所有している CodexClient のみ stop する。 */
  async stop(): Promise<void> {
    this.#threadId = null;
    this.#snapshot = null;
    if (this.#ownsClient) {
      await this.#client.stop();
    }
  }
}
