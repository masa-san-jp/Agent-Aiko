// 合成した Runtime Profile の置き場。設計書 §7.2 の
// runtime-profile://{profile_id}/summary は、直前に bind した結果を引ける前提の
// URI なので、サーバー側で保持する必要がある。
//
// プロセス内のみ。ディスクへ書くと §11.3 の権限（0600）とライフサイクルの話が
// 増えるうえ、stdio サーバーはクライアントと同じ寿命なので持ち越す意味が薄い。
//
// 無制限に貯めない。bind を繰り返すセッションで際限なく増えると、長時間動く
// ホストで効いてくる。

import type { RuntimeProfile } from "@agent-aiko/core";

const DEFAULT_LIMIT = 32;

export class ProfileStore {
  readonly #profiles = new Map<string, RuntimeProfile>();
  readonly #limit: number;

  constructor(limit: number = DEFAULT_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError(`limit は 1 以上の整数である必要があります: ${limit}`);
    }
    this.#limit = limit;
  }

  put(profile: RuntimeProfile): void {
    // 同じ id を入れ直したときも「最近使った」順の末尾へ動かす
    this.#profiles.delete(profile.profile_id);
    this.#profiles.set(profile.profile_id, profile);
    while (this.#profiles.size > this.#limit) {
      const oldest = this.#profiles.keys().next();
      if (oldest.done === true) break;
      this.#profiles.delete(oldest.value);
    }
  }

  get(profileId: string): RuntimeProfile | undefined {
    return this.#profiles.get(profileId);
  }

  /** 直近に bind したもの。bind 直後の参照を id 無しで済ませるため。 */
  latest(): RuntimeProfile | undefined {
    let last: RuntimeProfile | undefined;
    for (const profile of this.#profiles.values()) last = profile;
    return last;
  }

  get size(): number {
    return this.#profiles.size;
  }
}
