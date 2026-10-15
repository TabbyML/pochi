# Val Town `update_val` regression fixture

`val-town-update-val.json` is the complete `update_val` tool definition extracted
from <https://mcp-docs.val.run/tools.json> on 2026-10-14. Only JSON formatting was
changed. The catalog identified the server as `val-town-mcp`, version `1.0.0`, and
contained 59 tools. `update_val` was the only tool whose input schema contained an
empty-string `const` or enum member.

The [official Val Town changelog](https://blog.val.town/changelog-2026-08-06)
links to this [MCP reference site](https://mcp-docs.val.run/#update_val).
Its [published generator source](https://www.val.town/x/valdottown/mcp-docs/code/main.ts)
(`main.ts`, version 20) initializes the hosted MCP server, reads all `tools/list`
pages using its own injected credentials, and exposes the catalog at `/tools.json`
with a five-minute cache. The generator sorts tools by name but does not rewrite
their input schemas. No credentials or account data are included in this fixture.

This is a live catalog obtained through Val Town's public documentation feed,
not a capture of the original reporter's session. The original declaration index
82 therefore cannot be mapped from this catalog's ordering.

`update_val` updates a val's metadata, including its preview image. Its `imageUrl`
property allows an image delivery URL, an empty string, or null. The empty string
appears at `properties.imageUrl.anyOf[0].anyOf[1].const`. The unpatched
`@ai-sdk/google@3.0.129` converter folds the outer null branch into `nullable: true`
and converts the empty `const` to `enum: [""]`, producing exactly
`parameters.properties.imageUrl.anyOf[1].enum[0]` from the reported Gemini error.

The regression tests pass the entire input schema through Google and Vertex's
internal models, in ESM and CJS builds, for both generation and streaming. They
assert that the wire declaration retains the original schema under
`parametersJsonSchema`, including nested unions, nullability, formats, patterns,
and length limits. A normal tool in the same request continues using `parameters`.
These tests mock HTTP responses; live Gemini acceptance remains a separate check.

On capture, the eight fixture cases were also run against isolated copies of all
four SDK entry points with only the new empty-string fallback disabled: all eight
failed. With the patch enabled, all 36 schema regression cases passed.
