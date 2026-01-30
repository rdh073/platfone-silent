# ADR-004: Unified Activation Flow (Workflow vs Webhook Authority)

* **Status:** ACCEPTED
* **Date:** 2026-01-30
* **Decision Makers:** Architecture Team
* **Consulted:** Security, Distributed Systems Engineering

## 1. Context

Our reusable package manages phone number activations across multiple consumer applications. A critical challenge is coordinating the **Creation Intent** (what the user wants) with the **Remote State** (what the API provides), especially when network latency and webhook delays occur.

Previously, there was ambiguity around:
1.  Is the consumer app or the webhook responsible for "starting" an activation?
2.  How do we handle "early" webhooks that arrive before the database transaction commits?
3.  How do we enforce `DRY_RUN` safety when external systems (webhooks) interact with the app?

Alternative designs considered:
*   **Webhook-Driven Creation**: Allowing webhooks to create new records. *Risk:* Opens a massive billing attack vector and makes duplicate handling complex.
*   **Polling-Only**: Ignoring webhooks and polling for state. *Risk:* High latency and API rate limits.

## 2. Decision

We accept the [Unified Activation Flow Specification](../ACTIVATION_FLOW_SPEC.md) as the canonical contract.

We strictly separate authority as follows:
1.  **Workflow = Intent & Creation**: The synchronous `runActivationWorkflow` is the **only** authority allowed to initiate an activation and incur cost.
2.  **Webhook = Outcome & Reconciliation**: The asynchronous `handleActivationWebhook` is responsible **only** for updating the state of *existing* activations.

### Absolute Rules
*   **No Creation on Webhook**: The package MUST NOT create new `Activation` records from incoming webhooks. If the record key is missing, the request MUST be rejected (Consumer sends 404/Retry).
*   **Stateless Package**: The package logic remains pure and IO-free. Persistence is the sole responsibility of the Consumer Application.

## 3. Invariants (LOCKED)

The following invariants are **NON-NEGOTIABLE**:

| Invariant | Enforcement Component | Description |
| :--- | :--- | :--- |
| **Creation Authority** | `runActivationWorkflow` | Cost-incurring calls can ONLY originate here. |
| **Safety Gate** | `safetyGate` (Workflow) | `DRY_RUN` cannot leak into LIVE execution. |
| **Eventual Consistency** | Consumer App | Webhook races are handled via `404 Not Found` + Provider Retry. |
| **State Monotonicity** | `State Machine` | Transitions must follow the defined lifecycle (e.g. `PENDING` -> `READY`). |

## 4. Consequences

### Positive
*   **Safety**: Impossible for a malicious or buggy webhook to generate massive bills by creating thousands of "fake" orders.
*   **Resilience**: Handles "Webhook-First" race conditions gracefully via standard HTTP retry semantics.
*   **Testability**: The pure logic of both Workflow and Webhook handlers can be unit tested without extensive mocking.

### Negative / Trade-offs
*   **Consumer Burden**: Consumers must implement the persistence layer and HTTP ingress logic themselves; the package is not a "plug-and-play" server.
*   **Latency**: In rare race conditions (Webhook < Insert), there is a delay until the provider retries.

## 5. Evolution Policy

*   **IMMUTABLE**: The "Separation of Authority" (Workflow vs Webhook) and the "No Creation on Webhook" rule.
*   **EVOLVING**: 
    *   Supported `PricePolicy` strategies.
    *   Fields within `StateUpdate` (e.g., adding `smsSender` or `expirationReason`).
*   **PROCESS**: Changes to Immutable rules require a new ADR superseding this one.

## 6. References
*   [Unified Activation Flow Specification](../ACTIVATION_FLOW_SPEC.md)
*   [ADR-001: Activation Lifecycle State Machine](./001-activation-lifecycle-state-machine.md)
