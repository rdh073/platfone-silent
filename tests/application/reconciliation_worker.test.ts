import { ReconciliationWorker } from '../../src/application/reconciliation_worker';
import { InMemoryActivationRepository } from '../../src/infrastructure/in_memory_repository';
import { PlatfoneClient, RateLimitError } from '../../src/api/platfone_client';
import { Activation } from '../../src/domain/models';
import { LifecycleState, SmsStatus } from '../../src/domain/state_machine';

describe('ReconciliationWorker', () => {
    let repository: InMemoryActivationRepository;
    let api: jest.Mocked<PlatfoneClient>;
    let worker: ReconciliationWorker;

    beforeEach(() => {
        repository = new InMemoryActivationRepository();
        // Simplified mock
        api = {
            getActivation: jest.fn(),
        } as any;
        worker = new ReconciliationWorker(repository, api);
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

    test('successfully synchronizes state change', async () => {
        await repository.save(mockActivation);

        // Simulate remote state being SMS_RECEIVED
        api.getActivation.mockResolvedValue({
            id: 'act-1',
            state: LifecycleState.ACTIVE,
            smsStatus: SmsStatus.SMS_RECEIVED,
            smsCode: '123456',
            smsText: 'Code is 123456',
        } as any);

        await worker.syncOne('act-1');

        const updated = await repository.findById('act-1');
        expect(updated?.state).toBe(LifecycleState.SMS_RECEIVED);
        expect(updated?.smsCode).toBe('123456');
    });

    test('syncAll handles rate limits by pausing', async () => {
        await repository.save(mockActivation);
        await repository.save({ ...mockActivation, id: 'act-2' });

        api.getActivation.mockRejectedValueOnce(new RateLimitError(60));

        const result = await worker.syncAll();
        expect(result.processed).toBe(0);
        expect(result.failures).toBe(2); // Should stop after first failure
    });

    test('detects ghost activation (404)', async () => {
        await repository.save(mockActivation);
        api.getActivation.mockRejectedValue({ statusCode: 404 });

        const spy = jest.spyOn(console, 'warn').mockImplementation();

        // We expect syncOne to throw the error up to syncAll
        await expect(worker.syncOne('act-1')).rejects.toEqual({ statusCode: 404 });
        expect(spy).toHaveBeenCalledWith(expect.stringContaining('GHOST ACTIVATION'));

        spy.mockRestore();
    });
});
