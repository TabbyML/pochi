/**
 * Keywords that are not supported by some providers' structured output schemas.
 * For example, OpenAI's structured outputs and a few others reject
 * validation keywords such as `minItems`, `maxItems`, `minLength`,
 * `maxLength`, `pattern`, `format`, etc.
 *
 * Stripping these keywords from the JSON schema lets us safely use the schema
 * as a `responseFormat.schema` (e.g. in `Output.object({ schema })`) without
 * triggering provider-side validation errors like:
 *
 *   output_config.format.schema: For 'array' type, property 'maxItems' is not supported
 */
const UnsupportedKeywords = new Set<string>([
  // array
  "minItems",
  "maxItems",
  "uniqueItems",
  // string
  "minLength",
  "maxLength",
  "pattern",
  "format",
  // number
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "multipleOf",
]);

/**
 * Recursively removes keywords that are not supported by some providers'
 * structured output schemas.
 */
export function sanitizeSchemaForStructuredOutput<T>(schema: T): T {
  if (Array.isArray(schema)) {
    return schema.map((item) => sanitizeSchemaForStructuredOutput(item)) as T;
  }

  if (schema && typeof schema === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(
      schema as Record<string, unknown>,
    )) {
      if (UnsupportedKeywords.has(key)) {
        continue;
      }
      result[key] = sanitizeSchemaForStructuredOutput(value);
    }
    return result as T;
  }

  return schema;
}
