import type {
  LanguageModelV2Middleware,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { type InferToolInput, safeParseJSON } from "@ai-sdk/provider-utils";
import {
  type ClientTools,
  type CustomAgent,
  createClientTools,
} from "@getpochi/tools";
import type { Store } from "@livestore/livestore";
import { InvalidToolInputError } from "ai";
import { events } from "../../livestore/schema";

export function createNewTaskMiddleware(
  store: Store,
  parentTaskId: string,
  customAgents?: CustomAgent[],
): LanguageModelV2Middleware {
  return {
    middlewareVersion: "v2",
    transformParams: async ({ params }) => {
      const tools = params.tools;
      if (!tools) return params;

      for (const x of tools) {
        if (x.name !== "newTask" && x.name !== "newCustomAgent") continue;
        if (x.type === "function") {
          if (x.inputSchema?.properties) {
            // biome-ignore lint/performance/noDelete: type safe
            delete x.inputSchema.properties._meta;
            // biome-ignore lint/performance/noDelete: type safe
            delete x.inputSchema.properties._transient;
          }
        }
      }

      return {
        ...params,
      };
    },
    wrapStream: async ({ doStream }) => {
      const { stream, ...rest } = await doStream();

      let toolCallId = "";
      const transformedStream = stream.pipeThrough(
        new TransformStream<
          LanguageModelV2StreamPart,
          LanguageModelV2StreamPart
        >({
          async transform(chunk, controller) {
            if (
              chunk.type === "tool-input-start" &&
              (chunk.toolName === "newTask" ||
                chunk.toolName === "newCustomAgent")
            ) {
              toolCallId = chunk.id;
              return;
            }

            if (chunk.type === "tool-input-delta" && chunk.id === toolCallId) {
              return;
            }

            if (
              chunk.type === "tool-call" &&
              (chunk.toolName === "newTask" ||
                chunk.toolName === "newCustomAgent") &&
              (chunk.toolCallId === toolCallId || toolCallId === "")
            ) {
              const parsedResult = await safeParseJSON({
                text: chunk.input,
                schema: createClientTools()[chunk.toolName].inputSchema,
              });
              if (!parsedResult.success) {
                throw new InvalidToolInputError({
                  toolName: chunk.toolName,
                  toolInput: chunk.input,
                  cause: parsedResult.error,
                });
              }

              let args = parsedResult.value as InferToolInput<
                ClientTools["newTask"]
              > &
                InferToolInput<ClientTools["newCustomAgent"]>;

              if (chunk.toolName === "newCustomAgent") {
                args = args as InferToolInput<ClientTools["newCustomAgent"]>;
                const agent = customAgents?.find(
                  (a) => a.name === args.agentType,
                );
                if (!agent) {
                  throw new InvalidToolInputError({
                    toolName: "newCustomAgent",
                    toolInput: chunk.input,
                    cause: new Error(
                      `Agent ${args.agentType} not found in available agents: ${customAgents ? customAgents.map((a) => a.name).join(", ") : "none"}`,
                    ),
                  });
                }
              }

              const uid = crypto.randomUUID();
              args._meta = {
                uid,
              };
              store.commit(
                events.taskInited({
                  id: uid,
                  parentId: parentTaskId,
                  createdAt: new Date(),
                  initMessage: {
                    id: crypto.randomUUID(),
                    parts: [
                      {
                        type: "text",
                        text: args.prompt,
                      },
                    ],
                  },
                }),
              );

              controller.enqueue({
                ...chunk,
                input: JSON.stringify(args),
              });
              toolCallId = "";
              return;
            }

            controller.enqueue(chunk);
          },
        }),
      );

      return {
        stream: transformedStream,
        ...rest,
      };
    },
  };
}
