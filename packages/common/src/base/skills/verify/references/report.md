# Verification report

Use this structure:

```markdown
## Verification: <behavior checked>

**Verdict:** PASS | FAIL | BLOCKED | SKIP
**Claim:** <expected behavior and any mismatch with the diff>
**Surface:** <CLI, endpoint, browser flow, desktop driver, library API, or agent task>

### Observations

1. ✅/❌/⚠️ <action> → <observed result>
   <concise output, response, or artifact path>
2. 🔍 <adjacent probe> → <observed result>

### Findings

- <runtime friction, regression, surprising behavior, or useful limitation>

### Cleanup

- <jobs, sessions, services, and temporary state stopped or retained>
```

## Verdict rules

- `PASS`: the relevant runtime surface matched the claim and the selected adjacent probe did not reveal a material defect.
- `FAIL`: observed behavior contradicted the claim, produced ambiguous/error output where success was required, or caused a material regression.
- `BLOCKED`: setup or environment prevented reaching the relevant runtime state. This is not a verdict on correctness.
- `SKIP`: no runnable behavior exists for the scoped change.

Keep command output and response bodies inline when short. Include an absolute artifact path only when the user can access that filesystem; otherwise summarize the evidence in the report.
