import fs from "node:fs";
import readline from "node:readline";
import type { File, Message } from "@getpochi/livekit";
import { TrajectoryLine, getFingerprint } from "./trajectory-types";

type MessageAccumulator = {
  id: string;
  role: Message["role"];
  parts: Message["parts"];
  metadata?: Message["metadata"];
};

export async function parseTrajectoryFile(filePath: string): Promise<{
  fingerprints: string[];
  mainTask: Message[];
  subTasks: Record<string, Message[]>;
  files: File[];
}> {
  if (!fs.existsSync(filePath)) {
    return { fingerprints: [], mainTask: [], subTasks: {}, files: [] };
  }

  const fingerprints: string[] = [];

  // Pending message-metadata for messages not yet seen
  const pendingMetadata = new Map<string, Message["metadata"]>();

  // mainTask messages (no taskId)
  const mainTaskMessageMap = new Map<string, MessageAccumulator>();
  const mainTaskMessageIds: string[] = [];

  // subTask messages keyed by taskId
  const subTasksMessageMaps = new Map<
    string,
    Map<string, MessageAccumulator>
  >();
  const subTasksMessageIds = new Map<string, string[]>();

  // files
  const files: File[] = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let rawData: unknown;
    try {
      rawData = JSON.parse(line);
    } catch {
      continue;
    }

    const parsed = TrajectoryLine.safeParse(rawData);
    if (!parsed.success) continue;

    const data = parsed.data;
    fingerprints.push(getFingerprint(data));

    if (data.type === "message-part") {
      const { taskId, messageId, role, index, part } = data;

      if (!taskId) {
        // main task
        let msg = mainTaskMessageMap.get(messageId);
        if (!msg) {
          const pending = pendingMetadata.get(messageId);
          pendingMetadata.delete(messageId);
          msg = {
            id: messageId,
            role,
            parts: [],
            ...(pending ? { metadata: pending } : {}),
          };
          mainTaskMessageMap.set(messageId, msg);
          mainTaskMessageIds.push(messageId);
        }
        msg.parts[index] = part;
      } else {
        // sub task
        let taskMessageMap = subTasksMessageMaps.get(taskId);
        if (!taskMessageMap) {
          taskMessageMap = new Map();
          subTasksMessageMaps.set(taskId, taskMessageMap);
        }
        let taskMessageIds = subTasksMessageIds.get(taskId);
        if (!taskMessageIds) {
          taskMessageIds = [];
          subTasksMessageIds.set(taskId, taskMessageIds);
        }

        let msg = taskMessageMap.get(messageId);
        if (!msg) {
          const pending = pendingMetadata.get(messageId);
          pendingMetadata.delete(messageId);
          msg = {
            id: messageId,
            role,
            parts: [],
            ...(pending ? { metadata: pending } : {}),
          };
          taskMessageMap.set(messageId, msg);
          taskMessageIds.push(messageId);
        }
        msg.parts[index] = part;
      }
    } else if (data.type === "message-metadata") {
      const { messageId, metadata } = data;

      // Apply metadata to whichever map already holds this messageId,
      // or stash it for when the accumulator is created later.
      let found = false;
      let msg = mainTaskMessageMap.get(messageId);
      if (msg) {
        msg.metadata = metadata;
        found = true;
      } else {
        for (const taskMap of subTasksMessageMaps.values()) {
          msg = taskMap.get(messageId);
          if (msg) {
            msg.metadata = metadata;
            found = true;
            break;
          }
        }
      }
      if (!found) {
        pendingMetadata.set(messageId, metadata);
      }
    } else if (data.type === "files") {
      files.push(...data.files);
    }
  }

  const buildMessages = (
    map: Map<string, MessageAccumulator>,
    ids: string[],
  ): Message[] => {
    const result: Message[] = [];
    for (const id of ids) {
      const msg = map.get(id);
      if (msg) {
        msg.parts = msg.parts.filter((p) => p !== undefined);
        result.push(msg as Message);
      }
    }
    return result;
  };

  const mainTask = buildMessages(mainTaskMessageMap, mainTaskMessageIds);

  const subTasks: Record<string, Message[]> = {};
  for (const [taskId, taskMap] of subTasksMessageMaps.entries()) {
    subTasks[taskId] = buildMessages(
      taskMap,
      subTasksMessageIds.get(taskId) ?? [],
    );
  }

  return { fingerprints, mainTask, subTasks, files };
}
