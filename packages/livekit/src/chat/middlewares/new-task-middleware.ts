import type {
  LanguageModelV2Middleware,
  LanguageModelV2StreamPart,
} from "@ai-sdk/provider";
import { safeParseJSON } from "@ai-sdk/provider-utils";
import { constants } from "@getpochi/common";
import { type CustomAgent, newTaskInputSchema } from "@getpochi/tools";
import { InvalidToolInputError } from "ai";
import { events } from "../../livestore/default-schema";
import type { LiveKitStore } from "../../types";

export function createNewTaskMiddleware(
  store: LiveKitStore,
  cwd: string | undefined,
  parentTaskId: string,
  customAgents?: CustomAgent[],
): LanguageModelV2Middleware {
  return {
    middlewareVersion: "v2",
    transformParams: async ({ params }) => {
      const tools = params.tools;
      if (!tools) return params;

      for (const x of tools) {
        if (x.name !== "newTask") continue;
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
              chunk.toolName === "newTask"
            ) {
              toolCallId = chunk.id;
              return;
            }

            if (chunk.type === "tool-input-delta" && chunk.id === toolCallId) {
              return;
            }

            if (
              chunk.type === "tool-call" &&
              chunk.toolName === "newTask" &&
              (chunk.toolCallId === toolCallId || toolCallId === "")
            ) {
              const parsedResult = await safeParseJSON({
                text: chunk.input,
                schema: newTaskInputSchema,
              });
              if (!parsedResult.success) {
                throw new InvalidToolInputError({
                  toolName: chunk.toolName,
                  toolInput: chunk.input,
                  cause: parsedResult.error,
                });
              }

              const args = parsedResult.value;
              const agent = customAgents?.find(
                (a) => a.name === args.agentType,
              );

              // if agentType is specified but not found, throw error
              if (args.agentType && !agent) {
                throw new InvalidToolInputError({
                  toolName: chunk.toolName,
                  toolInput: chunk.input,
                  cause: new Error(
                    `Agent ${args.agentType} not found in available agents: ${customAgents ? customAgents.map((a) => a.name).join(", ") : "none"}`,
                  ),
                });
              }

              const uid = crypto.randomUUID();
              const runAsync =
                (args.runAsync ?? false) && constants.enableAsyncNewTask;
              args.runAsync = runAsync;
              args._meta = {
                uid,
              };
              store.commit(
                events.taskInited({
                  id: uid,
                  cwd,
                  parentId: parentTaskId,
                  runAsync,
                  createdAt: new Date(),
                  initMessages: [
                    {
                      id: crypto.randomUUID(),
                      role: "user",
                      parts: [
                        {
                          type: "text",
                          text: args.prompt,
                        },
                      ],
                    },
                  ],
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
