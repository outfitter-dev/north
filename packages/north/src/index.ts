// Main library entry point

export const version = "0.1.0";

// Config exports
export {
  type NorthConfig,
  type DialsConfig,
  type TypographyConfig,
  type PolicyConfig,
  type ColorsConfig,
  type RulesConfig,
  type ThirdPartyConfig,
  type RegistryConfig,
  type LintConfig,
  type IndexConfig,
  type RadiusDial,
  type ShadowsDial,
  type DensityDial,
  type ContrastDial,
  type TypographyScaleDial,
  type ComplexityDial,
  type OKLCHColor,
  NorthConfigSchema,
  validateConfig,
  type ValidationResult,
  ValidationError,
} from "./config/schema.ts";

export {
  DEFAULT_CONFIG,
  DEFAULT_CONFIG_YAML,
  applyDefaults,
} from "./config/defaults.ts";

export {
  loadConfig,
  findConfigFile,
  type LoadConfigResult,
  ConfigLoadError,
  ConfigValidationError,
  ConfigExtendsError,
} from "./config/loader.ts";

// Generation exports
export {
  generateTokensFromConfig,
  type GeneratedTokens,
  type SpacingTokens,
  type RadiusTokens,
  type ShadowTokens,
  type DensityTokens,
  type TypographyTokens,
  type LayoutTokens,
} from "./generation/dials.ts";

export {
  parseOKLCH,
  formatOKLCH,
  isValidOKLCH,
  generateColorTokens,
  generateShadcnAliases,
  generateSurfaceTokens,
  type OKLCHComponents,
  type ColorTokens,
  type ShadcnAliases,
  type SurfaceColorTokens,
  ColorParseError,
} from "./generation/colors.ts";

export {
  generateCSS,
  extractChecksumFromCSS,
  verifyChecksum,
  type GeneratedCSS,
  type ChecksumVerificationResult,
} from "./generation/css-generator.ts";

export {
  writeFileAtomic,
  writeFilesAtomic,
  FileWriteError,
} from "./generation/file-writer.ts";

// Command exports
export {
  init,
  type InitOptions,
  type InitResult,
  InitError,
} from "./commands/init.ts";

export {
  generateTokens,
  type GenerateOptions,
  type GenerateResult,
  GenerateError,
} from "./commands/gen.ts";

export {
  doctor,
  type DoctorOptions,
  type DoctorResult,
} from "./commands/doctor.ts";

export {
  check,
  type CheckOptions,
  type CheckResult,
  CheckError,
} from "./commands/check.ts";

export {
  find,
  type FindOptions,
  type FindResult,
  FindError,
} from "./commands/find.ts";

export {
  runIndex,
  type IndexOptions,
  type IndexResult,
  IndexError,
} from "./commands/index.ts";

// Index exports
export { buildIndex } from "./index/build.ts";
export { checkIndexFresh, getIndexStatus } from "./index/queries.ts";
export type {
  IndexBuildResult,
  IndexFreshness,
  IndexStatus,
  IndexStats,
  TokenRecord,
  UsageRecord,
} from "./index/types.ts";
