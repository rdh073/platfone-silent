import { handleActivationWebhook, WebhookEvent } from '../../src/workflow/webhook_logic';
import { Activation } from '../../src/domain/models';
import { LifecycleState, SmsStatus } from '../../src/domain/state_machine';

describe('Unified Webhook Logic (ADR-004)', () => {

    // Mock Activation State
    const baseActivation: Activation = {
        id: '123',
        phone: '1234567890',
        serviceId: 'wa',
        countryId: 'US',
        state: LifecycleState.PENDING,
        smsStatus: SmsStatus.NONE,
        price: 1.0,
        maxPrice: 2.0,
        smsCode: null,
        smsText: null,
        createdAt: Date.now() / 1000,
        updatedAt: Date.now() / 1000,
        expiresAt: (Date.now() / 1000) + 600, // 10m future
        isRetriable: true
    };

    test('Should update state when valid event received', () => {
        // Start from ACTIVE to allow SMS_RECEIVED transition (PENDING -> SMS_RECEIVED is illegal)
        // In real world, PENDING -> ACTIVE happens first or via polling/webhook.
        const activeState: Activation = { ...baseActivation, state: LifecycleState.ACTIVE };

        const event: WebhookEvent = {
            activationId: '123',
            status: 'active',
            smsCode: '9999'
        };

        // Current: ACTIVE, Event: ACTIVE + SMS -> SMS_RECEIVED
        const result = handleActivationWebhook(event, activeState);

        expect(result.status).toBe('success');
        if (result.status === 'success') {
            expect(result.instruction.newState).toBe(LifecycleState.SMS_RECEIVED);
            expect(result.instruction.smsCode).toBe('9999');
        }
    });

    test('Should HALT on idempotent/duplicate event', () => {
        const activeState: Activation = {
            ...baseActivation,
            state: LifecycleState.ACTIVE,
            smsStatus: SmsStatus.NONE
        };

        const event: WebhookEvent = {
            activationId: '123',
            status: 'active'
        };

        const result = handleActivationWebhook(event, activeState);
        expect(result.status).toBe('halt'); // Already active
    });

    test('Should HALT on illegal transition (Zombie update)', () => {
        const canceledState: Activation = {
            ...baseActivation,
            state: LifecycleState.CANCELED
        };

        const event: WebhookEvent = {
            activationId: '123',
            status: 'active' // Provider delayed message?
        };

        const result = handleActivationWebhook(event, canceledState);
        expect(result.status).toBe('halt'); // Out-of-order ignored safely
    });

    test('Should FAIL on ID mismatch', () => {
        const event: WebhookEvent = {
            activationId: '999', // Wrong ID
            status: 'active'
        };

        const result = handleActivationWebhook(event, baseActivation);
        expect(result.status).toBe('failure');
    });

    test('Should explicitly handle DRY_RUN activation safely', () => {
        // DRY_RUN activations are just normal objects in memory/DB.
        // Logic treats them identically.
        const dryRunActivation: Activation = { ...baseActivation, state: LifecycleState.ACTIVE };

        const event: WebhookEvent = {
            activationId: '123',
            status: 'active',
            smsCode: '1111'
        };

        const result = handleActivationWebhook(event, dryRunActivation);
        expect(result.status).toBe('success');
        if (result.status === 'success') {
            expect(result.instruction.smsCode).toBe('1111');
        }
    });

});
