import { WebhookHandler, WebhookPayload } from '../../src/application/webhook_handler';
import { InMemoryActivationRepository } from '../../src/infrastructure/in_memory_repository';
import { Activation } from '../../src/domain/models';
import { LifecycleState, SmsStatus } from '../../src/domain/state_machine';

describe('WebhookHandler', () => {
    let repository: InMemoryActivationRepository;
    let handler: WebhookHandler;

    beforeEach(() => {
        repository = new InMemoryActivationRepository();
        handler = new WebhookHandler(repository);
    });

    const mockActivation: Activation = {
        id: 'act-1',
        externalId: 'ord-1',
        phone: '447975777666',
        serviceId: 'wa',
        countryId: 'uk',
        state: LifecycleState.ACTIVE,
        smsStatus: SmsStatus.SMS_REQUESTED,
        price: 90,
        maxPrice: 100,
        smsCode: null,
        smsText: null,
        createdAt: Math.floor(Date.now() / 1000) - 60,
        updatedAt: Math.floor(Date.now() / 1000) - 60,
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        isRetriable: true,
    };

    test('successfully updates activation on smsReceived', async () => {
        await repository.save(mockActivation);

        const payload: WebhookPayload = {
            event_type: 'activation.updated',
            event_id: 'evt-1',
            payload: {
                activation_id: 'act-1',
                activation_status: 'active',
                sms_status: 'smsReceived',
                sms_code: '123456',
                sms_text: 'Your code is 123456',
            }
        };

        const result = await handler.handle(payload);
        expect(result.result).toBe('success');

        const updated = await repository.findById('act-1');
        expect(updated?.state).toBe(LifecycleState.SMS_RECEIVED);
        expect(updated?.smsCode).toBe('123456');
    });

    test('handles unknown activation gracefully', async () => {
        const payload: WebhookPayload = {
            event_type: 'activation.updated',
            event_id: 'evt-1',
            payload: {
                activation_id: 'unknown',
                activation_status: 'active',
                sms_status: 'smsReceived',
            }
        };

        const spy = jest.spyOn(console, 'warn').mockImplementation();
        const result = await handler.handle(payload);
        expect(result.result).toBe('success');
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('NOT FOUND'));
        spy.mockRestore();
    });

    test('logs invariant violation but returns success', async () => {
        // Save as FINALIZED, then send a webhook to move it to ACTIVE (illegal)
        await repository.save({ ...mockActivation, state: LifecycleState.FINALIZED });

        const payload: WebhookPayload = {
            event_type: 'activation.updated',
            event_id: 'evt-1',
            payload: {
                activation_id: 'act-1',
                activation_status: 'active',
                sms_status: 'smsRequested',
            }
        };

        const spy = jest.spyOn(console, 'error').mockImplementation();
        const result = await handler.handle(payload);
        expect(result.result).toBe('success');
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('INVARIANT VIOLATION'));
        spy.mockRestore();

        // Verify state stayed FINALIZED
        const stored = await repository.findById('act-1');
        expect(stored?.state).toBe(LifecycleState.FINALIZED);
    });
});
