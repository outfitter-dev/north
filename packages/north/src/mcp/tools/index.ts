/**
 * North MCP Tools
 *
 * Exports all North MCP tools for registration with the server.
 */

// Status tool (Tier 1)
export {
  executeStatusTool,
  getGuidance,
  registerStatusTool,
  registerStatusAlias,
  StatusInputSchema,
} from "./status.ts";
export type { StatusInput, StatusResponse } from "./status.ts";

// Check tool (Tier 2)
export {
  type CheckInput,
  CheckInputSchema,
  type CheckOptions,
  type CheckResponse,
  type CheckViolation,
  type FixSuggestion,
  executeCheckTool,
  registerCheckTool,
} from "./check.ts";

// Context tool (Tier 2)
export { registerContextTool, executeContextTool, type ContextPayload } from "./context.ts";

// Suggest tool (Tier 2)
export {
  type SuggestInput,
  SuggestInputSchema,
  type SuggestOptions,
  type SuggestResponse,
  type TokenSuggestion,
  executeSuggestTool,
  registerSuggestTool,
} from "./suggest.ts";

// Discover tool (Tier 3)
export {
  type DiscoverInput,
  DiscoverInputSchema,
  type DiscoverPayload,
  executeDiscoverTool,
  registerDiscoverTool,
  registerDiscoverAlias,
} from "./discover.ts";

// Promote tool (Tier 3)
export {
  type ExistingUsage,
  type PromoteInput,
  PromoteInputSchema,
  type PromoteOptions,
  type PromoteResponse,
  type Recommendation,
  type SimilarToken,
  detectTokenType,
  executePromoteTool,
  generateSuggestedName,
  registerPromoteTool,
} from "./promote.ts";

// Refactor tool (Tier 3)
export {
  type RefactorCandidate,
  type RefactorOptions,
  type RefactorResponse,
  type RefactorSummary,
  executeRefactorTool,
  registerRefactorTool,
} from "./refactor.ts";

// Query tool (Tier 3)
export {
  type NorthQueryParams,
  type PatternRow,
  type QueryInput,
  QueryInputSchema,
  type QueryOptions,
  type QueryResponse,
  type TokenRow,
  type UsageRow,
  executeQueryTool,
  registerQueryTool,
} from "./query.ts";

// Classify tool (Tier 3)
export {
  type ClassifyInput,
  ClassifyInputSchema,
  type ClassifyOptions,
  type ClassifyResponse,
  type ClassifyFileResult,
  executeClassifyTool,
  registerClassifyTool,
} from "./classify-tool.ts";
