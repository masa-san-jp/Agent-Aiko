// Persona Golden Test の公開面。設計書 §12.1。

export { DIMENSIONS, probeCount, type Dimension, type DimensionId, type Probe } from "./dimensions.js";
export {
  runGolden,
  renderReport,
  type GoldenReport,
  type Judge,
  type ProbeResult,
  type Respond,
  type RunOptions,
  type Verdict,
} from "./runner.js";
export { ollamaRespond, ollamaJudge } from "./ollama.js";
