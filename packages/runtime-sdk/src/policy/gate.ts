// 判定を実際に効かせる層。R7 仕様書 R7-6 / §3.2 / §3.3 / §8。
//
// 判定を返すだけでは何も止まらない。**実行の手前に置いて、止めるものを止める**のが
// ここの仕事。§3.2 が禁じているのは、警告だけ出して続行・別 Tool へ置換・Action を
// 分割して回避・fallback path での実行——どれも「判定はした」まま実行される形。
// だから実行そのものを受け取り、通す場合しか呼ばない。
//
// Adapter が自前で Policy 判定を作らないための層でもある。ここを通せば、判定は
// 必ず Runtime SDK が出したものになる。

import type { ActionDecision, ApprovalGrant, ApprovalRequirement, EvaluateActionRequest } from "./action.js";
import { actionHash } from "./canonical.js";
import type { ResponseValidation, ValidateResponseRequest } from "./response.js";
import type { SemanticBudget } from "./semantic.js";

export interface PolicyGateSdk {
  evaluateAction(
    request: EvaluateActionRequest,
    options?: { budget?: SemanticBudget | undefined },
  ): Promise<ActionDecision>;
  validateResponse(request: ValidateResponseRequest): Promise<ResponseValidation>;
}

export interface PolicyGateOptions {
  sdk: PolicyGateSdk;
  /** 承認を取りに行く。返さなければ承認は得られなかったものとして扱う。
   *  **勝手に承認したことにしない**——ここを省略すると require_approval は止まる。 */
  requestApproval?:
    | ((requirement: ApprovalRequirement, decision: ActionDecision) => Promise<ApprovalGrant | undefined>)
    | undefined;
  budget?: SemanticBudget | undefined;
}

export type GateOutcome<T> =
  | { status: "executed"; value: T; decision: ActionDecision }
  /** 実行していない。deny か、承認が得られなかったか。 */
  | { status: "stopped"; reason: "denied" | "approval-required" | "approval-stale"; decision: ActionDecision };

export type SendOutcome =
  | { status: "sent"; validation: ResponseValidation }
  | { status: "stopped"; reason: "revision_required" | "blocked"; validation: ResponseValidation };

export class PolicyGate {
  readonly #sdk: PolicyGateSdk;
  readonly #requestApproval: PolicyGateOptions["requestApproval"];
  readonly #budget: SemanticBudget | undefined;

  constructor(options: PolicyGateOptions) {
    this.#sdk = options.sdk;
    this.#requestApproval = options.requestApproval;
    this.#budget = options.budget;
  }

  /** 高リスク操作の手前に置く。通ったときだけ execute が呼ばれる。 */
  async run<T>(request: EvaluateActionRequest, execute: () => Promise<T>): Promise<GateOutcome<T>> {
    const decision = await this.#sdk.evaluateAction(request, { budget: this.#budget });

    if (decision.decision === "deny") {
      return { status: "stopped", reason: "denied", decision };
    }

    if (decision.decision === "require_approval") {
      const requirement = decision.approval;
      if (requirement === undefined || this.#requestApproval === undefined) {
        return { status: "stopped", reason: "approval-required", decision };
      }
      const grant = await this.#requestApproval(requirement, decision);
      if (grant === undefined) {
        return { status: "stopped", reason: "approval-required", decision };
      }
      // §3.3 / R7-6: 承認後に Action が変わっていたら、その承認は使えない。
      // 承認を取っている間に内容が差し替わる経路は現実にある。
      if (grant.actionHash !== actionHash(request.action)) {
        return { status: "stopped", reason: "approval-stale", decision };
      }
      if (grant.policyBundleHash !== decision.policyBundleHash) {
        return { status: "stopped", reason: "approval-stale", decision };
      }
      return { status: "executed", value: await execute(), decision };
    }

    // allow / allow_with_warning。警告は握り潰さず decision に残したまま返す。
    return { status: "executed", value: await execute(), decision };
  }

  /** 最終応答・外部送信の手前に置く。通ったときだけ deliver が呼ばれる。 */
  async send(
    request: ValidateResponseRequest,
    deliver: (content: string) => Promise<void>,
  ): Promise<SendOutcome> {
    const validation = await this.#sdk.validateResponse(request);
    if (validation.status === "blocked" || validation.status === "revision_required") {
      return { status: "stopped", reason: validation.status, validation };
    }
    await deliver(request.response.content);
    return { status: "sent", validation };
  }
}
