import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { constants } from "@getpochi/common";
import { formatFollowupQuestions } from "@getpochi/livekit";
import type {
  ClientTools,
  CustomAgent,
  ToolFunctionType,
} from "@getpochi/tools";
import ReconnectingWebSocket from "reconnecting-websocket";
import { WebSocket } from "ws";
import {
  isMjpegToMp4ConverterAvailable,
  startMjpegToMp4Converter,
} from "../lib/ffmpeg-mjpeg-to-mp4";
import type { ToolCallOptions } from "../types";

// @FIXME(@zhiming): extract to cli options
const SubTaskBrowserAgentMaxSteps = 65535;

/**
 * Creates the newTask tool for CLI runner with custom agent support.
 * Creates and executes sub-tasks autonomously.
 */
export const newTask =
  (options: ToolCallOptions): ToolFunctionType<ClientTools["newTask"]> =>
  async ({ _meta, agentType, runAsync }, { toolCallId }) => {
    const taskId = _meta?.uid || crypto.randomUUID();

    if (!options.createSubTaskRunner) {
      throw new Error(
        "createSubTaskRunner function is required for sub-task execution",
      );
    }

    // Find the custom agent if agentType is specified
    let customAgent: CustomAgent | undefined;
    if (agentType && options.customAgents) {
      customAgent = options.customAgents.find(
        (agent) => agent.name === agentType,
      );
      if (!customAgent) {
        throw new Error(
          `Custom agent type "${agentType}" not found. Available agents: ${options.customAgents.map((a) => a.name).join(", ")}`,
        );
      }
    }

    // for browser agent
    let finalize: (() => Promise<void>) | undefined = undefined;
    if (customAgent?.name === "browser" && options.browserSessionStore) {
      const enableRecording = await isMjpegToMp4ConverterAvailable();

      const { streamUrl } =
        await options.browserSessionStore.registerBrowserSession(
          taskId,
          undefined,
          enableRecording,
        );

      if (enableRecording && streamUrl) {
        const tmpFile = path.join(
          await fs.realpath(os.tmpdir()),
          `pochi-browser-agent-video-${taskId}.mp4`,
        );
        const rec = startMjpegToMp4Converter(tmpFile);

        const rws = new ReconnectingWebSocket(streamUrl, [], {
          WebSocket,
          connectionTimeout: 8000,
          maxRetries: Number.MAX_SAFE_INTEGER,
          minReconnectionDelay: 100,
          maxReconnectionDelay: 5000,
          reconnectionDelayGrowFactor: 1.5,
        });
        rws.binaryType = "arraybuffer";

        rws.addEventListener("message", (e) => {
          if (e.type === "message") {
            try {
              const data = JSON.parse(e.data);
              if (data.type === "frame") {
                rec.handleFrame({
                  data: data.data,
                  ts: data.metadata.timestamp,
                });
              }
            } catch (e) {
              // ignore error
            }
          }
        });

        finalize = async () => {
          rws.close();
          try {
            await rec.stop();
            const buffer = await fs.readFile(tmpFile);
            const url = await options.blobStore.put(buffer, "video/mp4");
            await options.fileSystem.writeFile(
              `pochi:///browser-session/${toolCallId}.mp4`,
              url,
            );
            await fs.unlink(tmpFile);
          } catch (e) {
            // ignore error
          }
        };
      }
    }

    const isAsync = !!runAsync && constants.EnableAsyncNewTask;
    const overrideOptions: { customAgent?: CustomAgent; maxSteps?: number } = {
      customAgent,
    };
    if (customAgent?.name === "browser") {
      overrideOptions.maxSteps = SubTaskBrowserAgentMaxSteps;
    }
    const subTaskRunner = options.createSubTaskRunner(
      taskId,
      isAsync,
      overrideOptions,
    );

    // Check if this is an async task
    if (isAsync) {
      // Start the subtask but don't wait for completion
      void Promise.resolve(subTaskRunner.run())
        .catch(() => {
          // Ignore errors for Async tasks
        })
        .finally(() => {
          return finalize?.();
        });
      return {
        result: taskId,
      };
    }

    // Execute the sub-task (synchronous), rethrow any errors
    try {
      await subTaskRunner.run();
    } finally {
      await finalize?.();
    }

    // Get the final state and extract result
    const finalState = subTaskRunner.state;
    const lastMessage = finalState.messages.at(-1);

    // FIXME(@zhiming): refactor to explicitly check the task state and reuse `extractTaskResult`
    let result: string | object = "Sub-task finished without result.";
    if (lastMessage?.role === "assistant") {
      for (const part of lastMessage.parts || []) {
        if (
          part.type === "tool-attemptCompletion" &&
          (part.state === "input-available" ||
            part.state === "output-available")
        ) {
          result = part.input.result;
          break;
        }

        if (
          part.type === "tool-askFollowupQuestion" &&
          (part.state === "input-available" ||
            part.state === "output-available")
        ) {
          result = formatFollowupQuestions(part.input);
          break;
        }
      }
    }

    return {
      result: typeof result === "string" ? result : JSON.stringify(result),
    };
  };
