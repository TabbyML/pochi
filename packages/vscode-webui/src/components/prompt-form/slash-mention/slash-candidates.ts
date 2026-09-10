import {
  type CustomAgentFile,
  type SkillFile,
  isValidCustomAgentFile,
  isValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { isUserInvocableSkill } from "@getpochi/tools";
import type { SlashCandidate } from "./mention-list";

export function createSlashCandidates(
  customAgents: CustomAgentFile[],
  skills: SkillFile[],
): SlashCandidate[] {
  return [
    ...customAgents
      .filter((x) => !x.isBuiltIn)
      .filter((x) => isValidCustomAgentFile(x))
      .map((x) => ({
        type: "custom-agent" as const,
        id: x.name,
        label: x.name,
        path: x.filePath,
        rawData: x,
      })),
    ...skills
      .filter((x) => isValidSkillFile(x))
      .filter((x) => isUserInvocableSkill(x))
      .map((x) => ({
        type: "skill" as const,
        id: x.name,
        label: x.name,
        path: x.filePath,
        rawData: x,
      })),
  ];
}
