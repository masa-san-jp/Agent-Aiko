// Aiko Core の公開面。設計書 §5.1 / §5.2。

export {
  PersonaResolutionError,
  type PersonaRef,
  type PersonaRepository,
  type PersonaSnapshot,
  type PersonaSource,
} from "./persona-repository.js";

export {
  FileSystemPersonaRepository,
  type FileSystemPersonaRepositoryOptions,
} from "./filesystem-persona-repository.js";

export { compile, type CompileInput, type CompiledInstructions, type UserContext } from "./compiler.js";

export { sha256, hashObject } from "./hash.js";

export {
  checkSchemaVersion,
  acceptableVersions,
  type CompatibilityVerdict,
} from "./schema-compatibility.js";

export {
  UserContextProvider,
  UserProfileError,
  USER_PROFILE_SCHEMA_VERSION,
  type ResolvedUserContext,
  type UserContextProviderOptions,
} from "./user-context-provider.js";

export {
  CapabilityRegistry,
  CapabilityManifestError,
  CAPABILITY_MANIFEST_SCHEMA_VERSION,
  type Availability,
  type CapabilityEntry,
  type CapabilityRegistryOptions,
  type ResolvedCapabilities,
} from "./capability-registry.js";

export {
  RuntimeProfileBinder,
  BindingError,
  RUNTIME_PROFILE_SCHEMA_VERSION,
  type BinderOptions,
  type BindingRequest,
  type InjectionMethod,
  type RuntimeId,
  type RuntimeProfile,
} from "./binder.js";
