import { Activation } from '../domain/models';
import { LifecycleState, SmsStatus, InvariantCheckingStateMachine, EventSource } from '../domain/state_machine';

// ===========================================
// 1. DEFINITIONS: Types & Contracts
// ===========================================

/**
 * Result Pattern (Tri-state)
 * - success: Valid transition computed -> Apply it
 * - halt: Event ignored safely (Idempotency or Out-of-order) -> Do nothing
 * - failure: Illegal transition or invalid payload -> Reject (Consumer sends 400/404)
 */
export type WebhookResult =
    | { status: 'success'; instruction: StateUpdate }
    | { status: 'halt'; reason: string }
    | { status: 'failure'; error: Error };

function ok(instruction: StateUpdate): WebhookResult { return { status: 'success', instruction }; }
function halt(reason: string): WebhookResult { return { status: 'halt', reason }; }
function fail(msg: string): WebhookResult { return { status: 'failure', error: new Error(msg) }; }

/**
 * The raw event payload from the provider (after consumer authentication).
 */
export interface WebhookEvent {
    activationId: string;
    status: string;      // Remote status string
    smsCode?: string;
    smsText?: string;
}

/**
 * Pure instruction for the Consumer to apply.
 */
export interface StateUpdate {
    newState: LifecycleState;
    newSmsStatus: SmsStatus;
    smsCode?: string | undefined;
    smsText?: string | undefined;
    shouldFinalize: boolean;
}

// ===========================================
// 2. PURE LOGIC IMPLEMENTATION
// ===========================================

/**
 * Derives the next state for an activation based on a webhook event.
 * STRICTLY PURE: No IO, No DB, No Side Effects.
 */
export function handleActivationWebhook(
    event: WebhookEvent,
    current: Activation
): WebhookResult {
    // 1. INPUT VALIDATION (ADR-004: No Creation on Webhook)
    if (!current) {
        // Technically this function contract expects 'current' to be defined. 
        // If consumer passes undefined, we fail hard to force 404/Retry.
        return fail("Activation record missing. Webhooks cannot create activations.");
    }

    if (current.id !== event.activationId) {
        return fail(`ID Mismatch: Event=${event.activationId} vs Current=${current.id}`);
    }

    // 2. STATE TRANSITION & IDEMPOTENCY
    try {
        // Derive the next state. This performs ALL validation (Monotonicity, Lifecycle, etc.)
        // If the transition is illegal, this method will throw StateMachineError due to internally calling transition().
        const nextStateObject = InvariantCheckingStateMachine.deriveFromPayload(
            current,
            { activation_status: event.status, sms_status: event.smsCode ? 'smsReceived' : 'none' },
            EventSource.WEBHOOK
        );

        // 3. IDEMPOTENCY CHECK
        // Compare calculated next state with current state.
        // Note: transition() allows self-transition (monotonic check skips if current === next).

        const isSameState = nextStateObject.state === current.state;
        const isSameSmsStatus = nextStateObject.smsStatus === current.smsStatus;

        // Normalize empty values (null/undefined) for comparison
        const currentCode = current.smsCode || undefined;
        const eventCode = event.smsCode || undefined;
        const isSameCode = (eventCode === currentCode);

        // If state and SMS data are identical, we have nothing to do.
        if (isSameState && isSameSmsStatus && isSameCode) {
            return halt("Idempotent Event: State already up to date.");
        }

        // 4. Determine Side Effect Instructions (Purely declarative)
        let shouldFinalize = false;
        if (nextStateObject.state === LifecycleState.FINALIZED) {
            shouldFinalize = true;
        }

        return ok({
            newState: nextStateObject.state,
            newSmsStatus: nextStateObject.smsStatus,
            smsCode: event.smsCode || current.smsCode || undefined,
            smsText: event.smsText || current.smsText || undefined,
            shouldFinalize
        });

    } catch (e: any) {
        // illegal transition attempt (e.g. Canceled -> Active)
        return fail(`Illegal Transition: ${e.message}`);
    }
}
