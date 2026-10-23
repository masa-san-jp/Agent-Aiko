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
  acceptUserProposal,
  parseUserMarkdown,
  proposeUserMarkdown,
  readUserMarkdown,
  renderUserMarkdown,
  userMarkdownCandidates,
  userProposalPath,
  writeUserMarkdown,
  UserMarkdownError,
  type UserMarkdown,
} from "./user-markdown.js";
