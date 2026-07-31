// Capability Registry の公開面。設計書 §5.5 / §6.3。

export {
  CapabilityRegistry,
  CapabilityManifestError,
  CAPABILITY_MANIFEST_SCHEMA_VERSION,
  type Availability,
  type CapabilityEntry,
  type CapabilityRegistryOptions,
  type ResolvedCapabilities,
} from "./capability-registry.js";
