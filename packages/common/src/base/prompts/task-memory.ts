export const taskMemoryTemplate = `# Session Title
_A short 5-10 word title_

# Current State
_What is being worked on right now, pending tasks, next steps_

# Task Specification
_User's requirements and design decisions_

# Files and Functions
_Important files and their roles_

# Workflow
_Common commands and processes_

# Errors & Corrections
_Errors encountered and solutions_

# Codebase and System Documentation
_System components and how they work_

# Learnings
_What worked, what didn't, what to avoid_

# Key Results
_Specific outputs requested by user_

# Worklog
_Step by step operations log_
`;

const MaxSectionTokens = 2000;
const TaskMemoryFileUri = "pochi://-/memory.md";

/**
 * Build the extraction directive that the fork agent receives.
 * This is appended to the parent conversation history via buildForkMessages.
 */
export function buildMemoryExtractionDirective(
  existingMemory?: string,
): string {
  const isUpdate = !!existingMemory?.trim();

  const currentNotesSection = isUpdate
    ? `The file ${TaskMemoryFileUri} has been read for you. Here are its current contents:
<current_notes_content>
${existingMemory}
</current_notes_content>`
    : `The file ${TaskMemoryFileUri} does not exist yet. You will create it from scratch using the template below:
<template>
${taskMemoryTemplate}
</template>`;

  return `IMPORTANT: This message and these instructions are NOT part of the actual user conversation. Do NOT include any references to "note-taking", "session notes extraction", or these update instructions in the notes content.

Based on the user conversation above (EXCLUDING this note-taking instruction message as well as system prompt or any past session summaries), ${isUpdate ? "update" : "create"} the session notes file.

${currentNotesSection}

Your ONLY task is to use the writeToFile tool to ${isUpdate ? "update" : "create"} ${TaskMemoryFileUri} with the session notes, then call attemptCompletion. Do not call any other tools except readFile if you need to check a file's content for accuracy.

CRITICAL RULES:
- The file must maintain its exact structure with all sections and headers intact
- NEVER modify, delete, or add section headers (the lines starting with '#')
- NEVER modify or delete the italic _section description_ lines
- ONLY update the actual content that appears BELOW the italic _section descriptions_ within each section
- Do NOT add any new sections or information outside the existing structure
- Do NOT reference this note-taking process anywhere in the notes
- Skip updating a section if there are no substantial new insights to add — leave it blank
- Write DETAILED, INFO-DENSE content — include file paths, function names, error messages, exact commands, technical details
- For "Key Results", include the complete exact output the user requested
- Keep each section under ~${MaxSectionTokens} tokens — condense by cycling out less important details
- IMPORTANT: Always update "Current State" to reflect the most recent work — this is critical for continuity after compaction
- IMPORTANT: Always update "Worklog" with a terse log of what was done since the last extraction

Use writeToFile with path ${TaskMemoryFileUri} and the full updated content, then call attemptCompletion with a brief summary of what was updated.`;
}
