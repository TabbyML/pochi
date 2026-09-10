import * as assert from "assert";
import { describe, it } from "mocha";
import proxyquire from "proxyquire";
import type { useSkill as UseSkillType } from "../use-skill";

describe("useSkill Tool", () => {
  it("rejects skills with model invocation disabled", async () => {
    const useSkill = proxyquire("../use-skill", {
      tsyringe: {
        container: {
          resolve: () => ({
            validSkills: {
              value: [
                {
                  name: "manual-skill",
                  description: "Only users can invoke this skill",
                  filePath: "/skills/manual-skill/SKILL.md",
                  instructions: "Manual instructions",
                  disableModelInvocation: true,
                },
              ],
            },
          }),
        },
      },
    }).useSkill as typeof UseSkillType;

    await assert.rejects(
      () =>
        Promise.resolve(
          useSkill(
            { skill: "manual-skill" },
            {} as Parameters<typeof useSkill>[1],
          ),
        ),
      /model invocation is disabled/,
    );
  });
});
