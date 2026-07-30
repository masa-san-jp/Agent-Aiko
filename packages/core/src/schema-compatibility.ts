// スキーマの互換性判定。設計書 §10.3.1（マサさん確定 2026-07-30）。
//
// 受理するのは「現行版とその1つ前」まで。無期限に受理すると、古い形式を読む
// コードが恒久的に残り、以後すべての変更がその分岐を抱え続ける。1つ前を受理する
// のは、更新が一段階遅れているだけの利用者を、更新のためだけに止めないため。
//
// 拒否は §6.5 の「必須スキーマ不正」に当たる扱い＝fail closed。ただし読めない
// 事実だけを返さない。何が拒否され、何なら読め、どうすれば直るかまで返す。

/** 受理する版の幅。現行とその1つ前＝2。 */
const ACCEPTED_SPAN = 2;

export interface CompatibilityVerdict {
  accepted: boolean;
  /** 判定に使った現行版。 */
  current: number;
  /** 受理できる版（昇順）。 */
  acceptable: number[];
  /** 拒否したときの説明。受理時は undefined。 */
  reason?: string;
}

/** schema_version が受理範囲かを判定する。
 *  current は判定する側（Binder / Adapter）が対応している最新の版。 */
export function checkSchemaVersion(version: number, current: number): CompatibilityVerdict {
  if (!Number.isInteger(current) || current < 1) {
    throw new RangeError(`current は 1 以上の整数である必要があります: ${current}`);
  }
  const acceptable = acceptableVersions(current);
  if (!Number.isInteger(version) || version < 1) {
    return {
      accepted: false,
      current,
      acceptable,
      reason: `schema_version が整数ではありません（${version}）。受理できるのは ${describe(acceptable)} です。`,
    };
  }
  if (version > current) {
    return {
      accepted: false,
      current,
      acceptable,
      reason:
        `schema_version ${version} は、この版が知っている ${current} より新しいため読めません。` +
        `Aiko-MCP を更新してください（aiko update）。`,
    };
  }
  if (!acceptable.includes(version)) {
    return {
      accepted: false,
      current,
      acceptable,
      reason:
        `schema_version ${version} は古すぎるため読めません。受理できるのは ${describe(acceptable)} です。` +
        `ファイルを新しい形式へ移行してください（aiko migrate plan / aiko migrate apply）。`,
    };
  }
  return { accepted: true, current, acceptable };
}

/** 現行版から受理できる版の一覧（昇順）。current=1 のときは [1] だけ。 */
export function acceptableVersions(current: number): number[] {
  const oldest = Math.max(1, current - (ACCEPTED_SPAN - 1));
  const versions: number[] = [];
  for (let v = oldest; v <= current; v += 1) versions.push(v);
  return versions;
}

function describe(acceptable: number[]): string {
  return acceptable.join(" / ");
}
