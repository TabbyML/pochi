import {
  type SkillFile,
  type ValidSkillFile,
  isValidSkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import { threadSignal } from "@quilted/threads/signals";
import { useQuery } from "@tanstack/react-query";
import { vscodeHost } from "../vscode";

/**
 * Hook to get skills
 * Uses ThreadSignal for real-time updates
 */

// Function overloads for different return types based on filterValidFiles
export function useSkills(filterValidFiles: true): {
  skills: ValidSkillFile[];
  isLoading: boolean;
};

export function useSkills(filterValidFiles?: false): {
  skills: SkillFile[];
  isLoading: boolean;
};

/** @useSignals */
export function useSkills(filterValidFiles = false) {
  const { data: skillsSignal } = useQuery({
    queryKey: ["skills"],
    queryFn: async () => {
      return threadSignal(await vscodeHost.readSkills());
    },
    staleTime: Number.POSITIVE_INFINITY,
  });

  if (skillsSignal === undefined) {
    return { skills: [], isLoading: true };
  }

  return {
    skills: filterValidFiles
      ? skillsSignal.value.filter(isValidSkillFile)
      : skillsSignal.value,
    isLoading: false,
  };
}

export const useSkill = (name?: string) => {
  const { skills } = useSkills(true);

  if (!name) {
    return {
      skill: undefined,
    };
  }

  const skill = skills?.find((skill) => skill.name === name);
  return {
    skill,
  };
};
