# ADR-002: Webhook vs Polling Authority Model

## Status
Accepted

## Context
We receive activation state updates from two sources:
1.  **Webhooks** (Push): Real-time, authoritative events triggered by the provider (e.g., `activation.updated`).
2.  **Polling/Reconciliation** (Pull): Periodic API queries to sync state (e.g., `GET /activation/{id}`).

Conflicts arise when these sources disagree. For example, a webhook might report `SMS_RECEIVED` while a subsequent poll (due to eventual consistency lag) reports `ACTIVE`. Naively believing the "latest" timestamp can cause state regression (moving backward from `SMS_RECEIVED` to `ACTIVE`), violating monotonic invariants.

## Decision
We adopt a **Webhook Supremacy** model with **Ratchet-only Polling**.

### 1. Webhook Authority
Webhooks are considered the primary source of truth for positive state progression. If a webhook says an SMS arrived, we accept it immediately (subject to signature validation, if applicable).

### 2. Ratchet-only Polling
The Polling/Reconciliation Worker is permitted to *advance* the state machine but never to *retreat* it.
- **Scenario A (Advance)**: Local=`ACTIVE`, Remote=`SMS_RECEIVED`. Result: **ACCEPT**.
- **Scenario B (Regression)**: Local=`SMS_RECEIVED`, Remote=`ACTIVE`. Result: **REJECT**.
- **Scenario C (No Change)**: Local=`ACTIVE`, Remote=`ACTIVE`. Result: **NO-OP**.

### 3. Ghost Activation Handling
If polling returns `404 Not Found` for an activation we consider `ACTIVE`:
- We do **NOT** automatically delete or cancel the local record, as this could be a temporary API read-replica issue.
- We flag the activation for manual review (or "Ghost" status) and stop auto-polling it to save quota.
- We validly transition to `EXPIRED` only when the local TTL elapses.

## Consequences

### Positive
- **Consistency**: Prevents "flickering" UI states where a user sees a code and then it disappears.
- **Safety**: Ensures that sensitive data (SMS codes) persists even if the remote API is transiently unavailable or inconsistent.

### Negative
- **Staleness Risk**: If we miss a webhook and the polling API is also lagging, we might be stale. (Mitigated by eventual consistency of the API).
- **Complexity**: The `deriveFromPayload` logic in the State Machine must explicitly handle these "local vs remote" comparisons.

## Enforcement
- **Code**: `InvariantCheckingStateMachine.deriveFromPayload` contains the logic to ignore backward remote statuses.
- **Tests**: `ReconciliationWorker` tests verify that stale API responses do not revert local state.

---

**Signed**: Antigravity (Agent) & User
**Date**: 2026-01-30
