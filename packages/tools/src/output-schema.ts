import { z } from "zod";

export function parseOutputSchema(outputSchema: string): z.ZodAny {
  const schema = Function(
    "...args",
    `function getZodSchema(z) { return ${outputSchema} }; return getZodSchema(...args);`,
  )(z);
  return schema;
}
