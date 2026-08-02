// User Context Provider の公開面。設計書 §5.4 / §6.2。

export {
  UserContextProvider,
  UserProfileError,
  USER_PROFILE_SCHEMA_VERSION,
  type ResolvedUserContext,
  type UserContextProviderOptions,
} from "./user-context-provider.js";

export { defaultUserProfilePath, resolveUserProfilePath } from "./user-profile-path.js";
export {
  parseUserMarkdown,
  readUserMarkdown,
  renderUserMarkdown,
  userMarkdownCandidates,
  writeUserMarkdown,
  type UserMarkdown,
} from "./user-markdown.js";
