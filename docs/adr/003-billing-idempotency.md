# ADR-003: Billing Idempotency & Financial Safety

## Status
Accepted

## Context
The Platfone API charges our account balance immediately upon successful activation creation. Network unreliability dictates that we must retry failed requests, but "blind" retries (without uniqueness keys) can lead to:
- **Double Billing**: Creating two activations for the same user intent.
- **Lost State**: Paying for an activation but failing to record its ID locally, rendering it unusable (orphan).
- **Infinite Loops**: Automated retry logic spinning on a non-idempotent endpoint, draining the wallet.

## Decision
We enforce **Strict Client-Side Idempotency** for all billing-impacting operations.

### 1. Mandatory `order_id`
- The `PlatfoneClient` MUST inject an `order_id` into every `requestActivation` call.
- This `order_id` acts as the idempotency key. The provider guarantees that multiple requests with the same `order_id` will return the **same resource** without duplicate charges.

### 2. Orphan Handling (Get-Before-Create-Retry)
If a creation request times out (network error) but we don't know if it reached the server:
1.  We **MUST NOT** blindly retry with a new `order_id`.
2.  We **MUST** retry with the **SAME** `order_id`.
3.  If the provider does not support idempotent creation retries (implementation detail dependent), we must first attempt to `GET /activation` by our external reference to check for existence.

### 3. Price Conflict Handling
- We acknowledge that `409 Conflict` (Price Change) is a non-retriable error for the *same* bid.
- The system must halt and require a higher-level decision (e.g., user increasing max price) rather than auto-incrementing the bid, which could lead to runaway costs.

## Consequences

### Positive
- **Guaranteed Once-Only Billing**: It becomes mathematically impossible to pay twice for a single `order_id`.
- **Resilience**: We can aggressively retry network errors without fear of side effects.

### Negative
- **Client Burden**: The client (us) is responsible for generating and persisting unique IDs *before* calling the API.
- **Traceability**: Debugging requires correlating our `order_id` with their `id`.

## Enforcement
- **Code**: `PlatfoneClient.requestActivation` implementation enforces `order_id` presence.
- **Tests**: `PlatfoneClient` unit tests verify that `order_id` is passed correctly in the payload.

---

**Signed**: Antigravity (Agent) & User
**Date**: 2026-01-30
