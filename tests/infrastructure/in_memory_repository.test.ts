import { InMemoryActivationRepository } from '../../src/infrastructure/in_memory_repository';
import { Activation } from '../../src/domain/models';
import { LifecycleState, SmsStatus } from '../../src/domain/state_machine';

describe('InMemoryActivationRepository', () => {
    let repository: InMemoryActivationRepository;

    beforeEach(() => {
        repository = new InMemoryActivationRepository();
    });

    const mockActivation: Activation = {
        id: 'act-1',
        externalId: 'ord-123',
        phone: '447975777666',
        serviceId: 'whatsapp',
        countryId: 'uk',
        state: LifecycleState.ACTIVE,
        smsStatus: SmsStatus.SMS_REQUESTED,
        price: 90,
        maxPrice: 100,
        smsCode: null,
        smsText: null,
        createdAt: 1000,
        updatedAt: 1000,
        expiresAt: 2000,
        isRetriable: true,
    };

    test('save and findById', async () => {
        await repository.save(mockActivation);
        const found = await repository.findById('act-1');
        expect(found).toEqual(mockActivation);
    });

    test('findByExternalId', async () => {
        await repository.save(mockActivation);
        const found = await repository.findByExternalId('ord-123');
        expect(found).toEqual(mockActivation);
    });

    test('findActive', async () => {
        const inactive = { ...mockActivation, id: 'act-2', state: LifecycleState.FINALIZED };
        await repository.save(mockActivation);
        await repository.save(inactive);

        const active = await repository.findActive();
        expect(active).toHaveLength(1);
        expect(active[0].id).toBe('act-1');
    });

    test('returns null if not found', async () => {
        const found = await repository.findById('non-existent');
        expect(found).toBeNull();
    });
});
