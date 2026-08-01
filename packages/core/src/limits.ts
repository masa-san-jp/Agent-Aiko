// 入力の上限。SDK 設計書 §21「超過時は明示的に拒否する」。
//
// 上限が無いと、大きいだけの入力が hash・compile・注入をすべて通り、
// どこで詰まったのか分からないまま遅くなるか落ちる。**入口で断る。**
// 断る理由が「大きすぎる」だと分かることが、この上限の値そのものより大事。

/** §21 の最大入力。単位はバイト。 */
export const INPUT_LIMITS = {
  personaPackage: 1024 * 1024,
  userProfile: 256 * 1024,
  capabilityManifest: 1024 * 1024,
  permissionManifest: 512 * 1024,
  compiledInstructions: 512 * 1024,
} as const;

export type InputKind = keyof typeof INPUT_LIMITS;

export class InputTooLargeError extends Error {
  override readonly name = "InputTooLargeError";
  constructor(
    readonly kind: InputKind,
    readonly bytes: number,
  ) {
    super(`${kind} が上限を超えています（${bytes} bytes / 上限 ${INPUT_LIMITS[kind]} bytes）`);
  }
}

export function byteLength(value: string): number {
  return Buffer.byteLength(value, "utf8");
}

/** 超えていれば投げる。超えていなければ何もしない。 */
export function assertWithinLimit(kind: InputKind, value: string): void {
  const bytes = byteLength(value);
  if (bytes > INPUT_LIMITS[kind]) throw new InputTooLargeError(kind, bytes);
}
