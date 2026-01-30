/**
 * ARCHITECTURE_DOCTRINE Compliance:
 * - DOCTRINE-01: Explicit State Over Implicit Behavior
 * - DOCTRINE-02: Webhook Is Authoritative
 * - INV-02: Monotonic State Transitions
 * - INV-03: Cancel and Finalize Are Mutually Exclusive
 * - INV-06: Absolute TTL
 */

export enum LifecycleState {
    PENDING = 'pending',
    ACTIVE = 'active',
    SMS_RECEIVED = 'sms_received',
    FINALIZED = 'finalized',
    CANCELED = 'canceled',
    EXPIRED = 'expired',
}

export enum SmsStatus {
    SMS_REQUESTED = 'smsRequested',
    SMS_RECEIVED = 'smsReceived',
    RETRY_RECEIVED = 'retryReceived',
    NONE = 'none',
}

export enum EventSource {
    WEBHOOK = 'webhook',
    POLL = 'poll',
    MANUAL = 'manual',
}

export interface ActivationState {
    id: string;
    state: LifecycleState;
    smsStatus: SmsStatus;
    createdAt: number; // Unix timestamp
    expiresAt: number; // Unix timestamp
}

export class StateMachineError extends Error {
    constructor(message: string, public readonly code: string) {
        super(message);
        this.name = 'StateMachineError';
    }
}

export class InvariantCheckingStateMachine {
    /**
     * Valid transitions mapping.
     * Format: CURRENT_STATE -> [ALLOWED_NEXT_STATES]
     */
    private static readonly VALID_TRANSITIONS: Record<LifecycleState, LifecycleState[]> = {
        [LifecycleState.PENDING]: [LifecycleState.ACTIVE, LifecycleState.CANCELED],
        [LifecycleState.ACTIVE]: [LifecycleState.SMS_RECEIVED, LifecycleState.CANCELED, LifecycleState.EXPIRED],
        [LifecycleState.SMS_RECEIVED]: [LifecycleState.FINALIZED, LifecycleState.CANCELED], // Can cancel if sms_received but rejected by user
        [LifecycleState.FINALIZED]: [], // Terminal
        [LifecycleState.CANCELED]: [],  // Terminal
        [LifecycleState.EXPIRED]: [],   // Terminal
    };

    /**
     * Performs a transition to a new state and sms status.
     * Enforces all non-negotiable invariants.
     */
    public static transition(
        current: ActivationState,
        nextState: LifecycleState,
        nextSmsStatus: SmsStatus,
        source: EventSource,
        now: number = Math.floor(Date.now() / 1000)
    ): ActivationState {

        // INV-07: No Retry After Finalization
        if (current.state === LifecycleState.FINALIZED) {
            throw new StateMachineError('Attempted to mutate a finalized activation', 'INV-07_VIOLATION');
        }

        // INV-03: Cancel and Finalize Are Mutually Exclusive (Handled by monotonic check but explicit here)
        if (current.state === LifecycleState.CANCELED && nextState === LifecycleState.FINALIZED) {
            throw new StateMachineError('Mutually exclusive: Cannot finalize a canceled activation', 'INV-03_VIOLATION');
        }

        // MONOTONIC CHECK: Ensure transition is valid
        if (current.state !== nextState) {
            const allowed = this.VALID_TRANSITIONS[current.state];
            if (!allowed.includes(nextState)) {
                throw new StateMachineError(
                    `Illegal state transition: ${current.state} -> ${nextState}`,
                    'INV-02_VIOLATION'
                );
            }
        }

        // INV-06: Absolute TTL
        // Only CANCELED and EXPIRED are permitted after TTL
        if (now >= current.expiresAt) {
            if (nextState !== LifecycleState.CANCELED && nextState !== LifecycleState.EXPIRED) {
                throw new StateMachineError(
                    `TTL Expired: Transitions to ${nextState} are forbidden after ${current.expiresAt}`,
                    'INV-06_VIOLATION'
                );
            }
        }

        // SUCCESSFUL TRANSITION
        return {
            ...current,
            state: nextState,
            smsStatus: nextSmsStatus,
        };
    }

    /**
     * Helper to derive state from raw API response or Webhook payload.
     * DOCTRINE-02: Webhook Is Authoritative.
     */
    public static deriveFromPayload(
        current: ActivationState,
        payload: { activation_status: string; sms_status: string },
        source: EventSource,
        now: number = Math.floor(Date.now() / 1000)
    ): ActivationState {
        let nextState = this.mapRemoteState(payload.activation_status);
        const nextSmsStatus = this.mapRemoteSmsStatus(payload.sms_status);

        // DOCTRINE REFINEMENT: If remote is active but SMS is received, move to local SMS_RECEIVED state
        if (nextState === LifecycleState.ACTIVE && nextSmsStatus === SmsStatus.SMS_RECEIVED) {
            nextState = LifecycleState.SMS_RECEIVED;
        }

        return this.transition(current, nextState, nextSmsStatus, source, now);
    }

    private static mapRemoteState(status: string): LifecycleState {
        switch (status) {
            case 'active': return LifecycleState.ACTIVE;
            case 'expired': return LifecycleState.EXPIRED;
            case 'canceled': return LifecycleState.CANCELED;
            case 'finalized': return LifecycleState.FINALIZED;
            default: return LifecycleState.PENDING;
        }
    }

    private static mapRemoteSmsStatus(status: string): SmsStatus {
        switch (status) {
            case 'smsRequested': return SmsStatus.SMS_REQUESTED;
            case 'smsReceived': return SmsStatus.SMS_RECEIVED;
            case 'retryReceived': return SmsStatus.RETRY_RECEIVED;
            default: return SmsStatus.NONE;
        }
    }
}
