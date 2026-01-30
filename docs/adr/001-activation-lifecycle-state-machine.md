# ADR-001: Activation Lifecycle State Machine

## Status
Accepted

## Context
The Platfone Activation API involves irreversible financial transactions (leased phone numbers) and time-sensitive verification flows (SMS). Managing these activations with implicit logic or ad-hoc state checks introduces high risks of:
- **Billing Leakage**: Double-charging or failing to finalize/refund.
- **Race Conditions**: Parallel webhook and polling updates causing illegal state jumps.
- **AI Misuse**: AI agents performing mutations outside of authorized sequences.

A strict, invariant-checking state machine is required to serving as the **single source of truth** for all activation lifecycles.

## Decision
We implement a **Deterministic, Monotonic State Machine** with the following non-negotiable properties:

### 1. Explicit States & Transitions
- **States**: `PENDING`, `ACTIVE`, `SMS_RECEIVED`, `FINALIZED`, `CANCELED`, `EXPIRED`.
- **Monotony**: Transitions must only move forward according to the predefined directed acyclic graph (DAG). Backward transitions (e.g., `Active` -> `Pending`) are forbidden and rejected with a hard error.

### 2. Mutually Exclusive Terminals
- An activation cannot be both `CANCELED` and `FINALIZED`.
- Once a terminal state is reached, the state machine enters an immutable lock mode where no further transitions or attribute mutations are permitted.

### 3. Webhook Supremacy
- Webhooks are treated as the primary authoritative source for state changes.
- Polling (Reconciliation) acts as a recovery mechanism but is forbidden from overwriting or "downgrading" states already verified by webhooks.

### 4. Absolute TTL Enforcement
- Every activation has an `expiresAt` timestamp.
- The state machine must reject any progression (e.g., moving to `SMS_RECEIVED` or `FINALIZED`) after the TTL has passed, even if the remote API claims the activation is still valid. Only `CANCELED` or `EXPIRED` transitions are permitted after TTL.

### 5. Idempotency for Mutation
- All billing-impacting calls (especially `requestActivation`) must include an immutable `order_id` to ensure at-most-once execution on the provider side.

## Consequences

### Positive
- **Auditability**: Every state change is predictable and traceable.
- **CI Gating**: Invariants can be programmatically verified on every commit, preventing regression.
- **Financial Safety**: Prevents illegal billing states by design.

### Negative
- **Reduced Flexibility**: Heuristic retries or "clever" state corrections are forbidden.
- **Rigid Implementation**: Changes to the lifecycle require a formal ADR update and state migration plan.

## Enforcement
- **Mechanical Enforcement**: The `ci_gate.sh` script and the `src/domain/invariants.test.ts` suite.
- **Policy Enforcement**: Any code change violating these rules will fail the CI gate and cannot be merged without a new, approved ADR.

---

**Signed**: Antigravity (Agent) & User
**Date**: 2026-01-30
