// Transport interface separating CodexClient from a specific child process implementation.
//
// 実機では ProcessManager（codex app-server を spawn）が実装する。
// テストでは MockTransport が実装し、stdin への書込と stdout のチャンクを完全に制御する。
//
// 設計の正本: 2026-05-05-Agent-Aiko-Codex-design.md（masa-san-jp/Agent-Aiko-dev リポ） v0.3.1 §6.5

export interface Transport {
  /** トランスポートを開始する（プロセス起動など）。冪等。 */
  start(): void;

  /** トランスポートを停止する。 */
  stop(): Promise<void>;

  /** 行単位の JSON-RPC を流すために stdin 等へ書き込む。 */
  write(data: string): void;

  /** stdout 等のチャンクを購読する。CodexClient が LineBuffer で行に分解する。 */
  onStdout(handler: (chunk: Buffer) => void): void;

  /** プロセスが予期せず終了したときに呼ばれる。 */
  onExit(handler: (code: number | null, signal: NodeJS.Signals | null) => void): void;
}
