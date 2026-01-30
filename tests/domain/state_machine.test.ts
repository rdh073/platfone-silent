import {
    InvariantCheckingStateMachine,
    LifecycleState,
    SmsStatus,
    EventSource,
    ActivationState
} from '../../src/domain/state_machine';

describe('InvariantCheckingStateMachine', () => {
    const baseActivation: ActivationState = {
        id: 'test-123',
        state: LifecycleState.PENDING,
        smsStatus: SmsStatus.NONE,
        createdAt: 1000,
        expiresAt: 2000,
    };

    test('Happy Path: PENDING -> ACTIVE -> SMS_RECEIVED -> FINALIZED', () => {
        let state = { ...baseActivation };

        state = InvariantCheckingStateMachine.transition(state, LifecycleState.ACTIVE, SmsStatus.SMS_REQUESTED, EventSource.POLL, 1500);
        expect(state.state).toBe(LifecycleState.ACTIVE);

        state = InvariantCheckingStateMachine.transition(state, LifecycleState.SMS_RECEIVED, SmsStatus.SMS_RECEIVED, EventSource.WEBHOOK, 1600);
        expect(state.state).toBe(LifecycleState.SMS_RECEIVED);

        state = InvariantCheckingStateMachine.transition(state, LifecycleState.FINALIZED, SmsStatus.SMS_RECEIVED, EventSource.MANUAL, 1700);
        expect(state.state).toBe(LifecycleState.FINALIZED);
    });

    test('INV-02: Rejects illegal state transition (monotony)', () => {
        const state = { ...baseActivation, state: LifecycleState.ACTIVE };

        expect(() => {
            InvariantCheckingStateMachine.transition(state, LifecycleState.PENDING, SmsStatus.NONE, EventSource.POLL, 1500);
        }).toThrow('Illegal state transition');
    });

    test('INV-03: Cancel and Finalize are mutually exclusive', () => {
        const state = { ...baseActivation, state: LifecycleState.CANCELED };

        expect(() => {
            InvariantCheckingStateMachine.transition(state, LifecycleState.FINALIZED, SmsStatus.NONE, EventSource.POLL, 1500);
        }).toThrow('Mutually exclusive');
    });

    test('INV-06: Absolute TTL - Rejects progress after expiration', () => {
        const state = { ...baseActivation, state: LifecycleState.ACTIVE, expiresAt: 2000 };

        // Attempting to move to SMS_RECEIVED after 2000 should fail
        expect(() => {
            InvariantCheckingStateMachine.transition(state, LifecycleState.SMS_RECEIVED, SmsStatus.SMS_RECEIVED, EventSource.WEBHOOK, 2001);
        }).toThrow('TTL Expired');
    });

    test('INV-06: Absolute TTL - Allows CANCELED after expiration', () => {
        const state = { ...baseActivation, state: LifecycleState.ACTIVE, expiresAt: 2000 };

        const next = InvariantCheckingStateMachine.transition(state, LifecycleState.CANCELED, SmsStatus.NONE, EventSource.POLL, 2001);
        expect(next.state).toBe(LifecycleState.CANCELED);
    });

    test('INV-07: Rejects mutation after FINALIZED', () => {
        const state = { ...baseActivation, state: LifecycleState.FINALIZED };

        expect(() => {
            InvariantCheckingStateMachine.transition(state, LifecycleState.CANCELED, SmsStatus.NONE, EventSource.POLL, 1500);
        }).toThrow('Attempted to mutate a finalized activation');
    });

    test('deriveFromPayload: Correctly maps remote statuses', () => {
        const state = { ...baseActivation };
        const payload = { activation_status: 'active', sms_status: 'smsRequested' };

        const next = InvariantCheckingStateMachine.deriveFromPayload(state, payload, EventSource.WEBHOOK, 1500);
        expect(next.state).toBe(LifecycleState.ACTIVE);
        expect(next.smsStatus).toBe(SmsStatus.SMS_REQUESTED);
    });
});
