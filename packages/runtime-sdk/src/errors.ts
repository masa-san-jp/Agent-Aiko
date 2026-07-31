// Runtime SDK の共通エラーモデル。SDK 設計書 §10。
//
// 各コンポーネントが自前の例外を投げていると、呼び出し側は「何が起きたか」を
// メッセージ文字列から推測することになる。機械可読な code を必ず持たせる。
//
// §10.2: 秘密情報・Persona 全文・User Profile 全文・Tool 引数全文を含めない。
// details に何を載せるかはここで絞る。

/** §9.1 の拒否条件に対応するコード。 */
export const RUNTIME_ERROR_CODES = [
  "AIKO_RUNTIME_PERSONA_NOT_FOUND",
  "AIKO_RUNTIME_PERSONA_INVALID",
  "AIKO_RUNTIME_INVARIANTS_MISSING",
  "AIKO_RUNTIME_USER_NOT_FOUND",
  "AIKO_RUNTIME_USER_INVALID",
  "AIKO_RUNTIME_SCHEMA_UNSUPPORTED",
  "AIKO_RUNTIME_BIND_FAILED",
  "AIKO_RUNTIME_PROFILE_HASH_MISMATCH",
  "AIKO_RUNTIME_INJECTION_UNSUPPORTED",
  "AIKO_RUNTIME_INCOMPATIBLE_RUNTIME",
  "AIKO_RUNTIME_PERMISSION_UNRESOLVED",
  "AIKO_RUNTIME_POLICY_CONFLICT",
  /** R1 の範囲外。仕様にはあるが未実装であることを、黙らずに返すためのコード。 */
  "AIKO_RUNTIME_NOT_IMPLEMENTED",
] as const;

export type RuntimeErrorCode = (typeof RUNTIME_ERROR_CODES)[number];

export interface RuntimeSdkErrorInit {
  code: RuntimeErrorCode;
  severity?: "warning" | "error" | "fatal";
  retryable?: boolean;
  /** 利用者に見せる説明。原因ではなく「何が起きたか」。 */
  userMessage: string;
  /** どうすれば直るか。§10.2 が必須にしている。 */
  remediation?: string;
  /** どの部品で失敗したか。 */
  component?: string;
  requestId?: string;
  details?: Record<string, unknown>;
  cause?: unknown;
}

export class RuntimeSdkError extends Error {
  override readonly name = "RuntimeSdkError";
  readonly code: RuntimeErrorCode;
  readonly severity: "warning" | "error" | "fatal";
  readonly retryable: boolean;
  readonly userMessage: string;
  readonly remediation?: string;
  readonly component?: string;
  readonly requestId?: string;
  readonly details?: Record<string, unknown>;
  override readonly cause?: unknown;

  constructor(init: RuntimeSdkErrorInit) {
    super(init.userMessage);
    this.code = init.code;
    this.severity = init.severity ?? "error";
    this.retryable = init.retryable ?? false;
    this.userMessage = init.userMessage;
    if (init.remediation !== undefined) this.remediation = init.remediation;
    if (init.component !== undefined) this.component = init.component;
    if (init.requestId !== undefined) this.requestId = init.requestId;
    if (init.details !== undefined) this.details = init.details;
    if (init.cause !== undefined) this.cause = init.cause;
  }

  /** ログや診断へ出す形。**本文の類は載せない**（§10.2）。 */
  toJSON(): Record<string, unknown> {
    return {
      code: this.code,
      severity: this.severity,
      retryable: this.retryable,
      userMessage: this.userMessage,
      ...(this.remediation ? { remediation: this.remediation } : {}),
      ...(this.component ? { component: this.component } : {}),
      ...(this.requestId ? { requestId: this.requestId } : {}),
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

/** 既存の例外を SDK のコードへ写す。
 *  R1 では挙動を変えないので、下位が投げたものを握り潰さず cause に残す。 */
export function classify(err: unknown, requestId: string): RuntimeSdkError {
  if (err instanceof RuntimeSdkError) return err;

  const name = err instanceof Error ? err.name : "";

  // 下位の例外は名前で区別できる（PersonaResolutionError / UserProfileError /
  // BindingError）。メッセージ本文で分岐すると、文言を変えた瞬間に壊れる。
  if (name === "PersonaResolutionError") {
    return new RuntimeSdkError({
      code: "AIKO_RUNTIME_PERSONA_NOT_FOUND",
      userMessage: "人格を読み出せませんでした",
      remediation: "aiko doctor で人格の置き場を確認してください",
      component: "persona-repository",
      requestId,
      cause: err,
    });
  }
  if (name === "UserProfileError") {
    return new RuntimeSdkError({
      code: "AIKO_RUNTIME_USER_INVALID",
      userMessage: "User Profile を解決できませんでした",
      remediation: "aiko configure で作り直すか、AIKO_USER_PROFILE の指す先を確認してください",
      component: "user-context-provider",
      requestId,
      cause: err,
    });
  }
  if (name === "BindingError") {
    // BindingError は1種類だが、意味は stage で分かれている。§9.1 が別コードを
    // 与えているので、**メッセージ文ではなく stage で分ける**。文言に依存すると、
    // 表現を変えた瞬間に分類が壊れる（同じ間違いを watchdog でやった 2026-07-30）。
    const stage =
      typeof err === "object" && err !== null && "detail" in err
        ? String((err as { detail?: { stage?: unknown } }).detail?.stage ?? "")
        : "";
    const byStage: Record<string, RuntimeSdkErrorInit> = {
      "persona-resolution": {
        code: "AIKO_RUNTIME_PERSONA_NOT_FOUND",
        userMessage: "人格を読み出せませんでした",
        remediation: "aiko doctor で人格の置き場を確認してください",
      },
      "persona-validation": {
        code: "AIKO_RUNTIME_INVARIANTS_MISSING",
        userMessage: "不変条項が無いか空です。この状態では Aiko として起動しません",
        remediation: "人格パッケージの INVARIANTS を確認してください",
        severity: "fatal",
      },
      "injection-method": {
        code: "AIKO_RUNTIME_INJECTION_UNSUPPORTED",
        userMessage: "要求された一貫性レベルに必要な注入手段がありません",
        remediation:
          "Adapter が使える注入手段を injectionCapability に列挙するか、要求レベルを下げてください",
      },
      "schema-version": {
        code: "AIKO_RUNTIME_SCHEMA_UNSUPPORTED",
        userMessage: "受理できる範囲外の schema version です",
        remediation: "aiko update で更新するか、古い形式を移行してください",
      },
    };
    const mapped = byStage[stage];
    if (mapped) {
      return new RuntimeSdkError({ ...mapped, component: "binder", requestId, cause: err });
    }
    return new RuntimeSdkError({
      code: "AIKO_RUNTIME_BIND_FAILED",
      userMessage: "Runtime Profile を合成できませんでした",
      component: "binder",
      requestId,
      ...(stage ? { details: { stage } } : {}),
      cause: err,
    });
  }

  return new RuntimeSdkError({
    code: "AIKO_RUNTIME_BIND_FAILED",
    userMessage: "Runtime Profile を合成できませんでした",
    component: "runtime-sdk",
    requestId,
    cause: err,
  });
}

/** 仕様にあるが R1 では作らないもの。存在しないことを黙らない（§9.3 の精神）。 */
export function notImplemented(method: string, requestId = ""): RuntimeSdkError {
  return new RuntimeSdkError({
    code: "AIKO_RUNTIME_NOT_IMPLEMENTED",
    userMessage: `${method} は Phase R1 では実装していません`,
    remediation: "SDK 設計書 §23 の移行計画を参照してください",
    component: "runtime-sdk",
    severity: "error",
    requestId,
  });
}
