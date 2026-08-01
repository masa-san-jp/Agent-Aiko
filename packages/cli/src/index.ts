// CLI の公開面。設計書 §4.4。実バイナリは cli.ts。

export { run, type RunIO } from "./run.js";
export { runChecks, worstLevel, type CheckResult, type Level } from "./checks.js";
export { collectStatus, type Status, type AdapterStatus } from "./status.js";
export { resolveEnvironment, type Environment } from "./environment.js";
export { renderStatus, renderChecks } from "./render.js";
export {
  checkForUpdate,
  renderCheck,
  compareVersions,
  parseVersion,
  fetchReleasesFromGitHub,
  type Channel,
  type UpdateCheckResult,
  type ReleaseInfo,
  type FetchReleases,
} from "./update.js";
export { configure, renderConfigured, type Ask, type UserProfile } from "./configure.js";
export {
  applyUpdate,
  isUserOwned,
  listBackups,
  rollback,
  USER_OWNED_PATHS,
  type ApplyUpdateResult,
  type Backup,
} from "./apply-update.js";
export { downloadVerifiedRelease, DownloadError, type FetchBytes } from "./download.js";
export {
  MANIFEST_NAME,
  planUninstall,
  renderManifestMissing,
  renderUninstall,
  uninstall,
  type UninstallPlan,
  type UninstallResult,
} from "./uninstall.js";
