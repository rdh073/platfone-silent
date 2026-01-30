# Operational Runbooks

**Status:** Phase 3 (Simulation Mode)
**Last Updated:** 2026-01-30

---

## 🚨 INCIDENT-01: Low Balance Detected

**Trigger:**
- Log monitor detects `[Pre-Flight] Blocked: Balance < $1.00`.
- Dashboard metric `balance_usd` drops below threshold.

**Severity:** CRITICAL
**Impact:** New activations are hard-blocked.

**Procedure:**
1. **Verify Balance:**
   - Run `npx ts-node test_api.ts` (or check dashboard) to confirm current balance.
2. **Fund Account:**
   - Log into Platfone Portal.
   - Top up minimum $10.00.
3. **Verify Recovery:**
   - Re-run `npx ts-node test_api.ts` to confirm balance > $1.00.
   - Check logs for "Activation PROCEEDING".

---

## ⚠️ INCIDENT-02: High Webhook Error Rate

**Trigger:**
- Webhook endpoint returns 5xx > 1% of requests.
- Log signature `[Webhook] INVARIANT VIOLATION` spikes.

**Severity:** HIGH
**Impact:** State desynchronization (activations stuck in PENDING/ACTIVE).

**Procedure:**
1. **Check Logs:**
   - Search for `[Webhook Server] Error`.
   - Identify if error is parsing (400) or processing (500).
2. **Validate Payload:**
   - If `INVARIANT VIOLATION`, check `docs/CI_GATES.md` for rule definition.
   - If remote sends illegal transitions (e.g. Active -> Pending), contact Support.
3. **Restart Service:**
   - If `webhook_server.ts` is hung: `pkill -f webhook_server && ./scripts/start_webhook_tunnel.sh`.

---

## ℹ️ INCIDENT-03: Stale Activations

**Trigger:**
- Metric `activation_age > 20m` count > 0.
- Activations stuck in `PENDING` or `SMS_RECEIVED` past TTL.

**Severity:** MEDIUM
**Impact:** Wasted potential (if finalized) or stuck UI.

**Procedure:**
1. **Run Reconciliation:**
   - Execute `npx ts-node scripts/reconcile_stale.ts` (Proposed).
2. **Force Cancel (If safe):**
   - If > 20 mins, system should have auto-expired.
   - Manually verify state via API.

---

## 🔍 Metrics Reference

| Metric | Threshold | logic |
|--------|-----------|-------|
| `balance_usd` | `< 1.00` | Alert Immediate |
| `webhook_errors` | `> 5 / min` | Alert Warning |
| `active_count` | `> 10` | Info (Capacity check) |
