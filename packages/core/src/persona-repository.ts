// Persona Registry の読み出し口。設計書 §5.1。
//
// 実装を差し替えられるように interface を切る。§14 の移行計画では、まず現行の
// ~/.aiko/ をそのまま読む FileSystemPersonaRepository を置き（Phase 1）、manifest
// を持つ形式は後のフェーズで足す。だからここでは「どう保存されているか」を型に
// 出さない。

/** 人格の指定。version 省略時は実装が現行版を解決する。 */
export interface PersonaRef {
  id: string;
  version?: string;
}

/** 読み出した人格の中身。設計書 §5.1 の保持内容に対応する。 */
export interface PersonaSnapshot {
  /** 人格の識別子。 */
  id: string;
  /** 人格の版（§10.3 で Distribution とは独立に SemVer 管理する）。 */
  version: string;
  /** 自己認識の中核。Identity Consistency（§2）の対象。 */
  identityCore: string;
  /** 不変条項。欠落は fail closed（§6.5）。 */
  invariants: string;
  /** 判断原則。§6.4 の優先順位では invariants より下。 */
  behavioralContract: string;
  /** 由来。どのファイルから読んだかを保持し、profile の provenance に載せる（§5.2）。 */
  sources: PersonaSource[];
  /** 応答の機械判定に使う宣言（R7 仕様書 §6）。人格本文は自然文で、そのままでは
   *  「一人称が違う」を判定できない。判定できる形で書かれたものだけをここに持つ。
   *  持たない人格がある——無い項目は検査せず、検査していないと返す。 */
  responseContract?: Record<string, unknown>;
}

export interface PersonaSource {
  /** 論理名（identity-core / invariants / behavioral-contract など）。 */
  part: string;
  /** 読み出し元。ファイルパスに限らないため文字列で持つ。 */
  location: string;
}

export interface PersonaRepository {
  /** 指定された人格を読み出す。解決できない場合は例外を投げる（§6.5 fail closed）。 */
  load(ref: PersonaRef): Promise<PersonaSnapshot>;
}

/** 人格を解決できなかったときの例外。呼び出し側が fail closed の判断に使う。 */
export class PersonaResolutionError extends Error {
  override readonly name = "PersonaResolutionError";

  constructor(
    message: string,
    readonly detail: { ref: PersonaRef; searched?: string[] },
  ) {
    super(message);
  }
}
