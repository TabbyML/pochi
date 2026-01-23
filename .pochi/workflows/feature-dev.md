# Feature Development Workflow

A structured approach to building features with comprehensive codebase understanding and architecture focus.

## Core Principles

- **Ask clarifying questions** before implementation to resolve ambiguities, edge cases, and underspecified behaviors
- **Understand before building** - explore the codebase thoroughly before writing code
- **Quality over speed** - validate implementation through tests and code review

---

## Phase 1: Discovery

**Goal:** Understand what needs to be built

1. Parse the feature request to identify:
   - Core functionality required
   - User-facing behavior expectations
   - Integration points with existing systems
   - Potential edge cases

2. Create a todo list with initial high-level tasks using `todoWrite`:
   - Discovery phase items
   - Exploration tasks
   - Design milestones
   - Implementation steps (to be refined later)

---

## Phase 2: Codebase Exploration

**Goal:** Understand the codebase context for the feature

1. Launch 2-3 `explore` agents using `newTask` to investigate:
   - **Architecture exploration**: Find existing patterns, conventions, and architectural decisions
   - **Feature location**: Identify where similar features are implemented
   - **Integration points**: Locate files that will need modification

2. Based on exploration results, identify 5-10 key files to read in depth:
   - Entry points and main modules
   - Related feature implementations
   - Configuration and types
   - Test files for patterns

3. Read and analyze these key files to understand:
   - Coding conventions and patterns
   - Error handling approaches
   - Testing strategies
   - API design patterns

---

## Phase 3: Clarifying Questions

**CRITICAL:** Before designing, resolve all ambiguities

1. Identify underspecified aspects:
   - Edge cases not covered in requirements
   - Error handling expectations
   - Performance requirements
   - UI/UX specifics (if applicable)
   - Backwards compatibility concerns

2. Use `askFollowupQuestion` to get user input on:
   - Ambiguous requirements
   - Design trade-offs
   - Priority of features (if multiple approaches)
   - Acceptance criteria

3. Document clarifications for the design phase

---

## Phase 4: Architecture Design

**Goal:** Create a comprehensive implementation plan

1. Invoke the `planner` agent using `newTask` to:
   - Analyze the requirements and codebase context
   - Design the solution architecture
   - Create detailed implementation steps
   - Output plan to `pochi://parent/plan.md`

2. The planner will evaluate approaches:
   - **Minimal changes**: Smallest diff that works
   - **Clean architecture**: Best design regardless of effort
   - **Pragmatic balance**: Right trade-off for the context

3. Review the generated plan and ensure it covers:
   - All affected files with specific changes
   - New files to create with their structure
   - Test strategy (unit, integration)
   - Migration or backwards compatibility steps

4. Present the plan to the user and get **explicit approval** before proceeding

---

## Phase 5: Implementation

**Goal:** Build the feature following the approved plan

1. Work through the plan step by step:
   - Update todo list with implementation progress
   - Follow the established coding patterns
   - Write tests alongside code (TDD when appropriate)

2. Implementation guidelines:
   - Keep commits logical and focused
   - Add comments only where logic isn't self-evident
   - Handle errors consistently with existing patterns
   - Avoid over-engineering - implement what's needed

3. After each major component:
   - Run relevant tests to catch issues early
   - Verify integration with existing code
   - Update todo list progress

---

## Phase 6: Quality Review

**Goal:** Ensure implementation quality and correctness

1. Invoke the `validator` agent using `newTask` to:
   - Write/update integration tests for the new feature
   - Run the test suite
   - Fix any failures (max 3 attempts per failure)

2. Self-review checklist:
   - [ ] All todos completed
   - [ ] Tests passing
   - [ ] No console errors or warnings
   - [ ] Code follows existing patterns
   - [ ] No unnecessary complexity

3. Verify the implementation:
   - Run the full test suite: `bun turbo test:integration`
   - Check for TypeScript errors: `bun turbo typecheck`
   - Run linting: `bun turbo lint`

---

## Phase 7: Summary

**Goal:** Confirm completion and document decisions

1. Verify completion:
   - All todos marked as completed
   - All tests passing
   - Feature working as specified

2. Generate summary report:
   - **What was built**: Brief description of the feature
   - **Key decisions made**: Important architectural choices
   - **Files changed**: List of modified/created files
   - **Testing**: How the feature is tested
   - **Follow-up items**: Any future improvements identified

3. Present summary to user for final confirmation

---

## Agent Reference

| Agent | Purpose | Tools |
|-------|---------|-------|
| `explore` | Codebase exploration, finding patterns and files | readFile, globFiles, listFiles, searchFiles |
| `planner` | Architecture design and implementation planning | readFile, globFiles, listFiles, searchFiles, writeToFile |
| `validator` | Test writing, running, and fixing | readFile, writeFile, applyDiff, searchFiles, globFiles, executeCommand |

## Quick Start

```
/feature-dev Add a new settings panel for configuring model preferences
```

The workflow will guide you through all phases, asking for input when needed and using specialized agents for exploration, planning, and validation.
