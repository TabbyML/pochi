# Verify prompts, agents, and Skills

Treat the agent's observable response and tool behavior as the runtime surface.

1. Define a realistic task that should trigger the changed instruction.
2. Launch an isolated subtask with `newTask` when available. Give it only the task and required artifact paths; do not leak the intended answer.
3. Capture the returned result and relevant tool behavior.
4. Run one contrasting prompt that should not trigger the behavior, or one edge case that tests the changed boundary.
5. Compare observations with the claim.

Do not validate prompt changes solely by rereading the prompt. If an isolated execution is unavailable, report `BLOCKED` and state what execution surface is missing.
