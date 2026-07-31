// `aiko configure`。設計書 §4.4 / §6.2。
//
// Aiko-MCP は人格を実行環境へ届ける。届け先が誰かを受け取る手段が無いまま
// だったので、呼び名すら設定できなかった。ここで User Profile を作る。
//
// 書くのは1ファイルだけ。既定は AIKO_HOME/user-profile.json（置き場の決め方は
// core の resolveUserProfilePath に集約してある）。

import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { USER_PROFILE_SCHEMA_VERSION } from "@agent-aiko/user-context";

export type Ask = (question: string, options?: { default?: string }) => Promise<string>;

export interface UserProfile {
  schema_version: number;
  user_id: string;
  identity?: { preferred_name?: string };
  communication?: { language?: string; verbosity?: string; directness?: string };
  relationship?: { familiarity?: string };
  privacy?: { allow_remote_persona_service: boolean; allow_usage_telemetry: boolean };
}

const USER_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
const VERBOSITY = ["concise", "normal", "detailed"];
const DIRECTNESS = ["low", "medium", "high"];
const FAMILIARITY = ["new", "developing", "established"];

/** 既存があれば読む。壊れていても configure は続けられるようにする（作り直せる）。 */
async function readExisting(path: string): Promise<UserProfile | undefined> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as UserProfile;
  } catch {
    return undefined;
  }
}

async function askFromList(
  ask: Ask,
  question: string,
  allowed: string[],
  current: string | undefined,
): Promise<string | undefined> {
  const fallback = current ?? "";
  for (;;) {
    const answer = (await ask(`${question}（${allowed.join(" / ")}）`, { default: fallback })).trim();
    if (answer === "") return current;
    if (allowed.includes(answer)) return answer;
    // 黙って既定に落とさない。範囲外だと分かるように聞き直す。
  }
}

export async function configure(
  path: string,
  ask: Ask,
): Promise<{ profile: UserProfile; path: string }> {
  const existing = await readExisting(path);

  let userId = existing?.user_id ?? "default";
  for (;;) {
    const answer = (await ask("この端末での識別名（英小文字・数字・- _）", { default: userId })).trim();
    const candidate = answer === "" ? userId : answer;
    if (USER_ID.test(candidate)) {
      userId = candidate;
      break;
    }
  }

  // 空欄は「今の値のまま」。既定を [] で見せている以上、Enter は「据え置き」と
  // 読まれる。消したいときはファイルを直接編集する（privacy と同じ扱い）。
  const keep = async (question: string, current: string): Promise<string> => {
    const answer = (await ask(question, { default: current })).trim();
    return answer === "" ? current : answer;
  };

  const preferred = await keep(
    "アイコに何と呼ばれたいか（Enter で今のまま）",
    existing?.identity?.preferred_name ?? "",
  );

  const language = await keep(
    "応答の言語（例: ja / en）",
    existing?.communication?.language ?? "ja",
  );

  const verbosity = await askFromList(ask, "返答の量", VERBOSITY, existing?.communication?.verbosity);
  const directness = await askFromList(
    ask,
    "率直さ",
    DIRECTNESS,
    existing?.communication?.directness,
  );
  const familiarity = await askFromList(
    ask,
    "関係の深さ",
    FAMILIARITY,
    existing?.relationship?.familiarity,
  );

  const communication: Record<string, string> = {};
  if (language) communication["language"] = language;
  if (verbosity) communication["verbosity"] = verbosity;
  if (directness) communication["directness"] = directness;

  const profile: UserProfile = {
    schema_version: USER_PROFILE_SCHEMA_VERSION,
    user_id: userId,
    ...(preferred ? { identity: { preferred_name: preferred } } : {}),
    ...(Object.keys(communication).length > 0 ? { communication } : {}),
    ...(familiarity ? { relationship: { familiarity } } : {}),
    // §3.4 Fail Closed / §11.2。外部送信は既定で全て false のまま置く。
    // ここを対話で聞くと、勢いで true にされる。変えたい人はファイルを直接編集する。
    privacy: { allow_remote_persona_service: false, allow_usage_telemetry: false },
  };

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(profile, null, 2) + "\n", "utf8");
  // §11.3。呼び名と関係性が他のユーザーから読めないようにする。
  await chmod(path, 0o600);

  return { profile, path };
}

export function renderConfigured(profile: UserProfile, path: string): string {
  const lines = [
    `保存した: ${path}`,
    "",
    `識別名: ${profile.user_id}`,
    `呼び名: ${profile.identity?.preferred_name ?? "（指定なし）"}`,
  ];
  if (profile.communication?.language) lines.push(`言語: ${profile.communication.language}`);
  if (profile.communication?.verbosity) lines.push(`返答の量: ${profile.communication.verbosity}`);
  if (profile.communication?.directness) lines.push(`率直さ: ${profile.communication.directness}`);
  if (profile.relationship?.familiarity) lines.push(`関係の深さ: ${profile.relationship.familiarity}`);
  lines.push("", "外部送信は全て無効のままにしてある（変えるにはファイルを直接編集）。");
  return lines.join("\n") + "\n";
}
