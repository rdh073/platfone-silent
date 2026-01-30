# CI Invariant Gates

This project enforces the [ARCHITECTURE_DOCTRINE.md] via a mandatory **Invariant Gate**.

## Failure Semantics

If the CI build fails at the `Invariant Gate` step, it means your changes have violated one or more non-negotiable architectural rules.

### Common Failure Codes

| Code | Invariant | Meaning | Remediation |
| :--- | :--- | :--- | :--- |
| `INV-02_VIOLATION` | Monotony | Attempted to move the state machine backward (e.g. `Active` -> `Pending`). | Check your transition logic; states must move forward only. |
| `INV-03_VIOLATION` | Exclusivity | Attempted to `Finalize` a canceled activation or vice versa. | Verify terminal state logic; one path excludes the other. |
| `INV-06_VIOLATION` | TTL | Attempted to progress an activation after its expiration. | Ensure your worker/handler checks TTL before proposing a transition. |
| `INV-07_VIOLATION` | Finality | Attempted to mutate an activation after it was finalized. | Finalization is terminal. No further calls are permitted. |

## Remediation Workflow

1. **Locate the Failure**: Identifying the failing test case in `src/domain/invariants.test.ts`.
2. **Consult the Doctrine**: Read the corresponding `INV-XX` section in [ARCHITECTURE_DOCTRINE.md].
3. **Draft a Fix**: Adjust your code to comply with the invariant.
4. **Local Verification**: Run `sh scripts/ci_gate.sh` before pushing.

> [!WARNING]
> DO NOT attempt to disable or bypass invariant tests. Any such attempt will follow a specialized ADR process and requires security review.
