import { Activation } from '../domain/models';
import { LifecycleState, SmsStatus } from '../domain/state_machine';

/* =========================
 * Result helper (local only)
 * ========================= */
export type WebhookResult =
    | { status: 'success'; instruction: StateUpdate }
    | { status: 'halt'; reason: string }
    | { status: 'failure'; error: Error };

const ok = (instruction: StateUpdate): WebhookResult => ({ status: 'success', instruction });
const halt = (reason: string): WebhookResult => ({ status: 'halt', reason });
const fail = (msg: string): WebhookResult => ({
    status: 'failure',
    error: new Error(msg),
});

/* =========================
 * Public contracts
 * ========================= */
export interface WebhookEvent {
    activationId: string;
    status: string; // provider status (raw)
    smsCode?: string;
    smsText?: string;
}

export interface StateUpdate {
    newState: LifecycleState;
    newSmsStatus: SmsStatus;
    smsCode?: string | undefined;
    smsText?: string | undefined;
    shouldFinalize: boolean;
}

/* =========================
 * Lifecycle ordering
 * Monotonic: cannot go backward
 * ========================= */
const LIFECYCLE_ORDER: LifecycleState[] = [
    LifecycleState.PENDING,
    LifecycleState.ACTIVE,
    LifecycleState.SMS_RECEIVED,
    LifecycleState.FINALIZED,
    LifecycleState.EXPIRED,
    LifecycleState.CANCELED,
];

function isForwardOrSame(
    current: LifecycleState,
    next: LifecycleState
): boolean {
    const currentIndex = LIFECYCLE_ORDER.indexOf(current);
    const nextIndex = LIFECYCLE_ORDER.indexOf(next);

    // Safety: If current is terminal (FINALIZED/EXPIRED/CANCELED), cannot move forward anymore
    // Terminal states index: 3, 4, 5
    if (currentIndex >= 3 && nextIndex !== currentIndex) return false;

    return nextIndex >= currentIndex;
}

/* =========================
 * Provider → Internal mapping
 * NO SIDE EFFECTS
 * ========================= */
function mapRemoteStatus(
    status: string
): LifecycleState | null {
    const s = status.toLowerCase();
    switch (s) {
        case 'active':
            return LifecycleState.ACTIVE;
        case 'smsreceived':
        case 'sms_received':
            return LifecycleState.SMS_RECEIVED;
        case 'finalized':
            return LifecycleState.FINALIZED;
        case 'expired':
            return LifecycleState.EXPIRED;
        case 'canceled':
            return LifecycleState.CANCELED;
        default:
            return null; // internal events or unknown
    }
}

/* ============================================================
 * PURE WEBHOOK HANDLER (ADR-004 LAW)
 * ============================================================ */
export function handleActivationWebhook(
    event: WebhookEvent,
    current: Activation
): WebhookResult {
    /* ---------------------------------
     * Invariant 1: Activation MUST exist
     * --------------------------------- */
    if (!current || !current.id) {
        return fail('Activation not found');
    }

    /* ---------------------------------
     * Invariant 2: ID must match
     * --------------------------------- */
    if (event.activationId !== current.id) {
        return fail('Activation ID mismatch');
    }

    /* ---------------------------------
     * Invariant 3: Status mapping & State Correction
     * If provider says 'active' but has an SMS code, we are locally 'SMS_RECEIVED'
     * --------------------------------- */
    let nextState = mapRemoteStatus(event.status);
    if (!nextState) {
        return halt(`Unknown status: ${event.status}`);
    }

    if (nextState === LifecycleState.ACTIVE && event.smsCode) {
        nextState = LifecycleState.SMS_RECEIVED;
    }

    /* ---------------------------------
     * Invariant 4: Monotonic transition
     * --------------------------------- */
    if (!isForwardOrSame(current.state, nextState)) {
        return halt(`Out-of-order or rollback ignored: ${current.state} -> ${nextState}`);
    }

    /* ---------------------------------
     * Invariant 5: Idempotency
     * --------------------------------- */
    const currentCode = current.smsCode || undefined;
    const eventCode = event.smsCode || undefined;
    if (current.state === nextState && currentCode === eventCode) {
        return halt('Idempotent Event: No state change required.');
    }

    /* ---------------------------------
     * Result Calculation (NO SIDE EFFECTS)
     * --------------------------------- */
    return ok({
        newState: nextState,
        newSmsStatus: eventCode ? SmsStatus.SMS_RECEIVED : current.smsStatus,
        smsCode: eventCode || currentCode,
        smsText: event.smsText || current.smsText || undefined,
        shouldFinalize: nextState === LifecycleState.FINALIZED
    });
}
