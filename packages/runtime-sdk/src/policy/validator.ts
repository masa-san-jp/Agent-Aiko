// Deterministic Response Validator。R7 仕様書 R7-3 / §6 / §8。
//
// 照合元は Runtime Profile だけ（§6）。呼出側から呼び名や人格ルールを受け取らない。
// **宣言が無い項目は「合格」にしない。** 検査していないことを checked に残す——
// 走らせていない検査を通ったことにすると、validateResponse を通した応答が
// 何を保証しているのか誰にも言えなくなる。

import type { EvaluationMode, Severity } from "./common.js";
import type {
  ResponseCheckId,
  ResponseCheckResult,
  ResponseIssue,
  ResponseValidation,
  SuggestedRevision,
  ValidateResponseRequest,
} from "./response.js";
import {
  DEFAULT_SECRET_PATTERNS,
  responseContractOf,
  termReplacement,
  termText,
  type ProhibitedTerm,
  type ResponseContract,
} from "./response-contract.js";

/** 仮名と漢字。日本語かどうかの粗い判定にだけ使う。 */
const JAPANESE = /[぀-ヿ㐀-鿿]/;

export interface DeterministicResponseValidatorOptions {
  /** profileId から Runtime Profile を引く。SDK 側の置き場をそのまま渡す。 */
  resolveProfile: (profileId: string) => unknown;
  policyBundleHash?: string | undefined;
  clock?: (() => Date) | undefined;
}

interface CheckOutcome {
  check: ResponseCheckId;
  issues: ResponseIssue[];
  /** 宣言が無くて走らせなかった場合の理由。 */
  skippedReason?: string;
}

export class DeterministicResponseValidator {
  readonly #resolveProfile: (profileId: string) => unknown;
  readonly #policyBundleHash: string;
  readonly #clock: () => Date;

  constructor(options: DeterministicResponseValidatorOptions) {
    this.#resolveProfile = options.resolveProfile;
    this.#policyBundleHash = options.policyBundleHash ?? "response-contract:1.0.0";
    this.#clock = options.clock ?? (() => new Date());
  }

  validate(request: ValidateResponseRequest): ResponseValidation {
    const profile = this.#resolveProfile(request.profileRef.profileId);
    const contract = responseContractOf(profile);
    const content = request.response.content;
    const only = request.checks;

    const outcomes: CheckOutcome[] = [
      this.#privacy(content, contract),
      this.#preferredName(content, contract),
      this.#firstPerson(content, contract),
      this.#prohibited(content, contract),
      this.#required(content, contract),
      this.#assertions(content, contract),
      this.#language(content, contract),
    ].filter((outcome) => only === undefined || only.includes(outcome.check));

    const issues = outcomes.flatMap((o) => o.issues);
    const checked: ResponseCheckResult[] = outcomes.map((o) => ({
      check: o.check,
      evaluated: o.skippedReason === undefined,
      passed: o.skippedReason === undefined && o.issues.length === 0,
      method: "deterministic",
      ...(o.skippedReason !== undefined ? { skippedReason: o.skippedReason } : {}),
    }));

    const blocking = issues.filter((i) => i.blocking);
    const status: ResponseValidation["status"] =
      blocking.length > 0
        ? "blocked"
        : issues.some((i) => i.severity !== "info" && i.severity !== "low")
          ? "revision_required"
          : issues.length > 0
            ? "valid_with_warnings"
            : "valid";

    const revision = this.#revision(status, issues, content, contract);

    return {
      status,
      severity: highestSeverity(issues),
      confidence: 1,
      issues,
      checked,
      ...(revision ? { suggestedRevision: revision } : {}),
      validation: { deterministic: true, semantic: false },
      profileId: request.profileRef.profileId,
      policyBundleHash: this.#policyBundleHash,
      validatedAt: this.#clock().toISOString(),
    };
  }

  // --- 個々の検査 ---

  #privacy(content: string, contract: ResponseContract | undefined): CheckOutcome {
    const patterns = [...DEFAULT_SECRET_PATTERNS, ...(contract?.secretPatterns ?? [])];
    const issues: ResponseIssue[] = [];
    for (const pattern of patterns) {
      const match = new RegExp(pattern).exec(content);
      if (match === null) continue;
      issues.push({
        code: "SECRET_IN_RESPONSE",
        check: "privacy",
        message: "秘密情報らしき文字列が含まれています",
        severity: "critical",
        location: { start: match.index, end: match.index + match[0].length },
        // §14 は秘密情報を記録禁止にしている。位置だけ返し、中身は載せない。
        blocking: true,
      });
      break;
    }
    return { check: "privacy", issues };
  }

  #preferredName(content: string, contract: ResponseContract | undefined): CheckOutcome {
    const wrong = contract?.prohibitedNames;
    if (wrong === undefined || wrong.length === 0) {
      return {
        check: "preferred-name",
        issues: [],
        skippedReason: "使ってはいけない呼び方が宣言されていない（意味判断は R7-4）",
      };
    }
    return { check: "preferred-name", issues: literalIssues(content, wrong, {
      code: "WRONG_PREFERRED_NAME",
      check: "preferred-name",
      message: contract?.preferredName
        ? `呼び名は「${contract.preferredName}」です`
        : "宣言と違う呼び方が使われています",
      severity: "medium",
    }) };
  }

  #firstPerson(content: string, contract: ResponseContract | undefined): CheckOutcome {
    const wrong = contract?.prohibitedFirstPersons;
    if (wrong === undefined || wrong.length === 0) {
      return {
        check: "first-person",
        issues: [],
        skippedReason: "使ってはいけない一人称が宣言されていない",
      };
    }
    return { check: "first-person", issues: literalIssues(content, wrong, {
      code: "WRONG_FIRST_PERSON",
      check: "first-person",
      message: contract?.firstPerson
        ? `一人称は「${contract.firstPerson}」です`
        : "宣言と違う一人称が使われています",
      severity: "medium",
    }) };
  }

  #prohibited(content: string, contract: ResponseContract | undefined): CheckOutcome {
    const words = contract?.prohibitedExpressions;
    if (words === undefined || words.length === 0) {
      return { check: "prohibited-expression", issues: [], skippedReason: "禁止表現の宣言が無い" };
    }
    // §8 が blocked を許す条件に「明示的禁止表現」が入っている。
    return { check: "prohibited-expression", issues: literalIssues(content, words, {
      code: "PROHIBITED_EXPRESSION",
      check: "prohibited-expression",
      message: "使わないと決めた言い回しが含まれています",
      severity: "high",
      blocking: true,
    }) };
  }

  #required(content: string, contract: ResponseContract | undefined): CheckOutcome {
    const required = contract?.requiredExpressions;
    if (required === undefined || required.length === 0) {
      return { check: "required-expression", issues: [], skippedReason: "必須表現の宣言が無い" };
    }
    const missing = required.filter((word) => !content.includes(word));
    return {
      check: "required-expression",
      issues: missing.map((word) => ({
        code: "MISSING_REQUIRED_EXPRESSION",
        check: "required-expression" as const,
        message: `必ず書くと決めた内容がありません: ${word}`,
        severity: "medium" as const,
        blocking: false,
      })),
    };
  }

  #assertions(content: string, contract: ResponseContract | undefined): CheckOutcome {
    const words = contract?.prohibitedAssertions;
    if (words === undefined || words.length === 0) {
      return { check: "uncertainty", issues: [], skippedReason: "禁止する断定表現の宣言が無い" };
    }
    return { check: "uncertainty", issues: literalIssues(content, words, {
      code: "PROHIBITED_ASSERTION",
      check: "uncertainty",
      message: "断定しないと決めた言い回しが含まれています",
      severity: "medium",
    }) };
  }

  #language(content: string, contract: ResponseContract | undefined): CheckOutcome {
    const language = contract?.language;
    if (language === undefined || content.trim().length === 0) {
      return { check: "language", issues: [], skippedReason: "出力言語の宣言が無い" };
    }
    const base = language.split("-")[0]?.toLowerCase();
    // 粗い判定しかしない。日本語指定なら仮名・漢字が1つも無いのはおかしい、
    // 程度のことしか構造では言えない。言語判定そのものは意味判断（R7-4）。
    if (base !== "ja") {
      return { check: "language", issues: [], skippedReason: `${language} の構造的な判定手段が無い` };
    }
    if (JAPANESE.test(content)) return { check: "language", issues: [] };
    return {
      check: "language",
      issues: [
        {
          code: "LANGUAGE_MISMATCH",
          check: "language",
          message: "日本語で返す設定ですが、日本語の文字が含まれていません",
          severity: "low",
          blocking: false,
        },
      ],
    };
  }

  #revision(
    status: ResponseValidation["status"],
    issues: ResponseIssue[],
    content: string,
    contract: ResponseContract | undefined,
  ): SuggestedRevision | undefined {
    if (status === "valid") return undefined;

    if (issues.some((i) => i.check === "privacy")) {
      // 秘密情報は消す判断が要る。**書き換えた本文は返さない**——
      // Validator が中身を作り直すのは §8 が禁じている。
      return {
        strategy: "remove-content",
        instructions: ["秘密情報にあたる箇所を取り除いてから送ってください"],
      };
    }

    const formal = issues.filter(
      (i) => i.check === "preferred-name" || i.check === "first-person",
    );
    if (formal.length > 0 && formal.length === issues.length) {
      // 呼び名と一人称の置き換えは形式的違反。意味は変わらないので patch できる（§8）。
      // 置換先が宣言されているものだけ直す。宣言が無ければ直さず、書き直しを求める。
      let patched = content;
      for (const term of [
        ...(contract?.prohibitedNames ?? []),
        ...(contract?.prohibitedFirstPersons ?? []),
      ]) {
        const to = termReplacement(term);
        if (to === undefined) continue;
        patched = patched.split(termText(term)).join(to);
      }
      if (patched !== content) {
        return {
          strategy: "patch",
          instructions: ["呼び名と一人称を人格の宣言に合わせました"],
          patchedContent: patched,
        };
      }
      return {
        strategy: "regenerate",
        instructions: [
          ...issues.map((i) => i.message),
          "置換先が宣言されていないため、こちらでは直していません",
        ],
      };
    }

    if (issues.every((i) => i.check === "required-expression")) {
      return {
        strategy: "add-disclosure",
        instructions: issues.map((i) => i.message),
      };
    }

    return {
      strategy: "regenerate",
      instructions: issues.map((i) => i.message),
    };
  }
}

const SEVERITY_ORDER: Severity[] = ["info", "low", "medium", "high", "critical"];

function highestSeverity(issues: ResponseIssue[]): Severity {
  return issues.reduce<Severity>(
    (worst, issue) =>
      SEVERITY_ORDER.indexOf(issue.severity) > SEVERITY_ORDER.indexOf(worst) ? issue.severity : worst,
    "info",
  );
}

function literalIssues(
  content: string,
  words: ProhibitedTerm[],
  template: {
    code: string;
    check: ResponseCheckId;
    message: string;
    severity: Severity;
    blocking?: boolean;
  },
): ResponseIssue[] {
  const issues: ResponseIssue[] = [];
  for (const term of words) {
    const word = termText(term);
    const index = content.indexOf(word);
    if (index < 0) continue;
    issues.push({
      code: template.code,
      check: template.check,
      message: template.message,
      severity: template.severity,
      location: { start: index, end: index + word.length },
      evidence: word,
      blocking: template.blocking ?? false,
    });
  }
  return issues;
}

/** enforce 指定で機能が使えないときに続行してよいか（§9）。 */
export function mustStopWithoutValidator(mode: EvaluationMode | undefined): boolean {
  return mode === "enforce";
}
