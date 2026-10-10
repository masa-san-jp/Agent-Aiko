// Aiko Core の公開面。設計書 §5.1 / §5.2。

export {
  PersonaResolutionError,
  type PersonaRef,
  type PersonaRepository,
  type PersonaSnapshot,
  type PersonaSource,
  type SpeechStyle,
} from "./persona-repository.js";


export {
  FileSystemPersonaRepository,
  isSafePersonaName,
  ORIGINAL_SPEECH_STYLE,

  type FileSystemPersonaRepositoryOptions,
} from "./filesystem-persona-repository.js";

export { compile, type CompileInput, type CompiledInstructions, type UserContext } from "./compiler.js";

export { sha256, hashObject, HashInputError, MAX_HASH_DEPTH } from "./hash.js";

export {
  assertWithinLimit,
  byteLength,
  INPUT_LIMITS,
  InputTooLargeError,
  type InputKind,
} from "./limits.js";

export {
  checkSchemaVersion,
  acceptableVersions,
  type CompatibilityVerdict,
} from "./schema-compatibility.js";

export {
  deletePersona,
  listPersonas,
  listSpeechStyles,
  PersonaStoreError,
  readActivePersona,
  readMode,
  readSpeechStyle,
  savePersona,
  SPEECH_STYLES,
  switchPersona,
  switchSpeechStyle,
  type PersonaEntry,
  type SpeechStyleEntry,
  type SpeechStyleId,
} from "./persona-store.js";

