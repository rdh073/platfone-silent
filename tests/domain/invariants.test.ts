import {
    InvariantCheckingStateMachine,
    LifecycleState,
    SmsStatus,
    EventSource,
    ActivationState
} from '../../src/domain/state_machine';

/**
 * CI INVARIANT SUITE
 * This suite is mandatory for every PR. 
 * Failure here constitutes a hard-fail for the build.
 */

describe('CI: ARCHITECTURE_DOCTRINE Invariants', () => {
    const baseActivation: ActivationState = {
        id: 'ci-id',
        state: LifecycleState.PENDING,
        smsStatus: SmsStatus.NONE,
        createdAt: Math.floor(Date.now() / 1000) - 10,
        expiresAt: Math.floor(Date.now() / 1000) + 1000,
    };

    describe('Lifecycle Monotony (INV-02)', () => {
        test('ALLOW: PENDING -> ACTIVE', () => {
            const next = InvariantCheckingStateMachine.transition(baseActivation, LifecycleState.ACTIVE, SmsStatus.SMS_REQUESTED, EventSource.POLL);
            expect(next.state).toBe(LifecycleState.ACTIVE);
        });

        test('REJECT: ACTIVE -> PENDING', () => {
            const state = { ...baseActivation, state: LifecycleState.ACTIVE };
            expect(() => {
                InvariantCheckingStateMachine.transition(state, LifecycleState.PENDING, SmsStatus.NONE, EventSource.POLL);
            }).toThrow(/Illegal state transition/);
        });
    });

    describe('Mutual Exclusivity (INV-03)', () => {
        test('REJECT: CANCELED -> FINALIZED', () => {
            const state = { ...baseActivation, state: LifecycleState.CANCELED };
            expect(() => {
                InvariantCheckingStateMachine.transition(state, LifecycleState.FINALIZED, SmsStatus.SMS_RECEIVED, EventSource.POLL);
            }).toThrow(/Mutually exclusive/);
        });
    });

    describe('Absolute TTL (INV-06)', () => {
        test('REJECT: Progress after expiry', () => {
            const expiredActive = { ...baseActivation, state: LifecycleState.ACTIVE, expiresAt: 1000 };
            expect(() => {
                InvariantCheckingStateMachine.transition(expiredActive, LifecycleState.SMS_RECEIVED, SmsStatus.SMS_RECEIVED, EventSource.WEBHOOK, 1001);
            }).toThrow(/TTL Expired/);
        });

        test('ALLOW: CANCELED after expiry', () => {
            const expired = { ...baseActivation, expiresAt: 1000 };
            const next = InvariantCheckingStateMachine.transition(expired, LifecycleState.CANCELED, SmsStatus.NONE, EventSource.POLL, 1001);
            expect(next.state).toBe(LifecycleState.CANCELED);
        });
    });

    describe('Terminal Finalization (INV-07)', () => {
        test('REJECT: Mutation after FINALIZED', () => {
            const finalized = { ...baseActivation, state: LifecycleState.FINALIZED };
            expect(() => {
                InvariantCheckingStateMachine.transition(finalized, LifecycleState.CANCELED, SmsStatus.NONE, EventSource.POLL);
            }).toThrow(/finalized activation/);
        });
    });

    describe('State Machine Exhaustiveness', () => {
        const allStates = Object.values(LifecycleState);

        test('Every state transition is either explicitly allowed or rejected with INV error', () => {
            allStates.forEach(current => {
                allStates.forEach(next => {
                    if (current === next) return; // Self-transitions are identity in this SM

                    const state: ActivationState = { ...baseActivation, state: current };

                    try {
                        InvariantCheckingStateMachine.transition(state, next, SmsStatus.NONE, EventSource.POLL);
                        // If it allowed it, we don't need to check error
                    } catch (e: any) {
                        // Rejections MUST be related to Invariants
                        expect(e.code).toMatch(/INV-\d{2}_VIOLATION/);
                    }
                });
            });
        });
    });
});
