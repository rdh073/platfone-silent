# Controlled Production Rollout Plan

This document outlines the safe transition of the Platfone Integration from Sandbox to Production.
**Prerequisite**: All CI Invariant Gates must be passing.

## Phase 1: Sandbox Validation (Current)
- [x] Invariants verified via `ci_gate.sh`.
- [x] Webhook receiving locally simulated.
- [x] "Red/Green" proof of failure modes completed.

## Phase 2: Live Dry-Run (Budget-Capped)
**Goal**: Verify connectivity with Production API without heavy traffic.

1.  **Environment Config**:
    - Update `.env` with `PLATFONE_PRODUCTION_KEY`.
    - limit `PLATFONE_PRODUCTION_URL` to real endpoint.
2.  **Safety Check**:
    - Ensure Wallet Balance is low (< $10) to limit blast radius.
    - Set `max_price` in code to a conservative limit (e.g., $1.00).
3.  **Manual Test**:
    - Run `test_api.ts` (modified for single run) to purchase **one** activation.
    - Verify:
        - Activation created & charged.
        - SMS received (requires sending real SMS to the number).
        - State moves to `FINALIZED`.
4.  **Rollback**:
    - If any monitoring alert fires (e.g., Rate Limit, 500s), revert to Sandbox.

## Phase 3: Limited Availability (Beta)
**Goal**: Handle real Low-Volume Traffic with monitoring.

1.  **Deployment**:
    - Deploy `WebhookHandler` to public-facing URL (e.g., via ngrok or cloud load balancer).
    - Register Webhook URL in Platfone Dashboard.
2.  **Traffic Ramp**:
    - Route 5-10% of traffic (or internal users only) to the new integration.
3.  **Audit**:
    - Monitor `ReconciliationWorker` logs for "Ghost Activations".
    - Verify Webhook delivery rates (compare Polling vs Webhook events).

## Phase 4: Full Production
**Goal**: Full automated operation.

1.  **Scale Up**:
    - Remove traffic caps.
    - Increase Wallet Balance.
2.  **Monitoring**:
    - Alert on `INV-XX_VIOLATION` logs (should be zero).
    - Alert on `RateLimitError` spikes.

## Emergency Rollback Procedure
If Invariants are violated (e.g., massive billing leakage):
1.  **Kill Switch**: Stop the Application Server / Worker process immediately.
2.  **Revoke Key**: Rotate the Platfone API Key in the dashboard to hard-stop all requests.
3.  **Analyze**: Check `hardening_report.md` against logs.
