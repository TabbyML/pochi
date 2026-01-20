import { prompts } from "@getpochi/common";
import type {
  CustomAgentFile,
  SkillFile,
} from "@getpochi/common/vscode-webui-bridge";
import type { CustomAgent } from "@getpochi/tools";
import type { Parent, Text } from "mdast";
import { gfmToMarkdown } from "mdast-util-gfm";
import { toMarkdown } from "mdast-util-to-markdown";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import { SKIP, visit } from "unist-util-visit";
import { getModelFromCustomAgent } from "./load-agents";
import { type Workflow, getModelFromWorkflow } from "./workflow-loader";

const IGNORED_NODE_TYPES = [
  "code",
  "inlineCode",
  "link",
  "image",
  "html",
  "linkReference",
  "imageReference",
];

/**
 * Extract slash command names from text, matching pattern /command-name
 */
function extractSlashCommandsFromText(text: string): string[] {
  const slashCommandRegex = /\/\w+[\w-]*/g;
  const matches = [...text.matchAll(slashCommandRegex)];
  return matches.map((match) => match[0].substring(1)); // Remove the leading "/"
}

export function containsSlashCommandReference(prompt: string): boolean {
  // Quick check before parsing - if no slash at all, return false
  if (!/\//.test(prompt)) {
    return false;
  }

  // Use the extraction function to properly detect slash commands
  return extractSlashCommandNames(prompt).length > 0;
}

export function extractSlashCommandNames(prompt: string): string[] {
  // Parse markdown to AST
  const tree = remark().use(remarkGfm).parse(prompt);

  const textNodes: string[] = [];

  // Single pass: collect text nodes and skip unwanted node types
  visit(tree, (node) => {
    // Skip these node types and their children
    if (IGNORED_NODE_TYPES.includes(node.type)) {
      return SKIP; // Skip this node and all its children
    }

    if (node.type === "text") {
      textNodes.push(String(node.value));
    }
  });

  const allCommands: string[] = [];
  for (const text of textNodes) {
    const commands = extractSlashCommandsFromText(text);
    allCommands.push(...commands);
  }

  return [...new Set(allCommands)];
}

export async function getModelFromSlashCommand(
  prompt: string | undefined,
  options: {
    workflows: Workflow[];
    customAgents: CustomAgent[];
  },
): Promise<string | undefined> {
  if (prompt && containsSlashCommandReference(prompt)) {
    const commandNames = extractSlashCommandNames(prompt);

    if (!commandNames.length) {
      return undefined;
    }

    for (const commandName of commandNames) {
      // 1. try to get model from workflow
      const targetWorkflow = options.workflows.find(
        (w) => w.id === commandName,
      );

      const workflowModel = getModelFromWorkflow(targetWorkflow);
      if (workflowModel) {
        return workflowModel;
      }

      // 2. try to get model from agent
      const targetAgent = options.customAgents.find(
        (x) => x.name === commandName,
      );
      const agentModel = getModelFromCustomAgent(targetAgent);
      if (agentModel) {
        return agentModel;
      }
    }
  }
  return undefined;
}

export async function replaceSlashCommandReferences(
  prompt: string,
  slashCommandContext: {
    workflows: Workflow[];
    customAgents: CustomAgentFile[];
    skills: SkillFile[];
  },
): Promise<{ prompt: string }> {
  // Quick check - if no slash at all, return early
  if (!/\//.test(prompt)) {
    return { prompt };
  }

  // Parse markdown to AST
  const tree = remark().use(remarkGfm).parse(prompt);

  // Visit and process nodes: replace slash commands
  visit(tree, (node, index, parent) => {
    // Skip these node types and their children
    if (IGNORED_NODE_TYPES.includes(node.type)) {
      return SKIP;
    }

    // Replace slash commands in text nodes
    if (node.type === "text" && parent) {
      const textNode = node as Text;
      const value = String(textNode.value);
      const regex = /(\/\w+[\w-]*)/g;

      const parts = value.split(regex);
      if (parts.length > 1) {
        const newNodes: (Text | { type: "html"; value: string })[] = [];

        for (const part of parts) {
          if (!part) continue;

          if (part.startsWith("/")) {
            const commandName = part.substring(1);
            const workflow = slashCommandContext.workflows.find(
              (x) => x.id === commandName,
            );
            const agent = slashCommandContext.customAgents.find(
              (x) => x.name === commandName,
            );
            const skill = slashCommandContext.skills.find(
              (x) => x.name === commandName,
            );

            if (workflow?.content) {
              newNodes.push({
                type: "html",
                value: prompts.workflow(
                  commandName,
                  workflow.pathName,
                  workflow.content,
                ),
              });
              continue;
            }
            if (agent?.name) {
              newNodes.push({
                type: "html",
                value: prompts.customAgent(commandName, agent.filePath),
              });
              continue;
            }
            if (skill?.name) {
              newNodes.push({
                type: "html",
                value: prompts.skill(commandName, skill.filePath),
              });
              continue;
            }
          }

          newNodes.push({ type: "text", value: part });
        }

        // Replace the current node with the new nodes in parent
        if (typeof index === "number" && parent) {
          // biome-ignore lint/suspicious/noExplicitAny: need to splice multiple nodes of different types into mdast
          (parent as Parent).children.splice(index, 1, ...(newNodes as any));
        }
      }
    }
  });

  // Convert AST back to string
  const result = toMarkdown(tree, {
    extensions: [gfmToMarkdown()],
    handlers: {
      link(node) {
        return node.url;
      },
    },
  });

  return { prompt: result.trimEnd() };
}
