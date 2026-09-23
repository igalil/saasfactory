import { zodToJsonSchema } from "zod-to-json-schema";
import { AnalysisSchema } from "./shared.js";

// Agents support different JSON Schema subsets. Ask them for the shared structural
// shape, then enforce lengths, domains, URLs and numeric bounds locally with Zod.
const localConstraints = new Set([
  "$schema",
  "minLength",
  "maxLength",
  "minimum",
  "maximum",
  "minItems",
  "maxItems",
  "pattern",
  "format",
]);
function structuralSchema(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(structuralSchema);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !localConstraints.has(key))
        .map(([key, child]) => [key, structuralSchema(child)]),
    );
  return value;
}

export const reportOutputSchema = structuralSchema(
  zodToJsonSchema(AnalysisSchema, { target: "openAi", $refStrategy: "none" }),
) as Record<string, unknown>;
