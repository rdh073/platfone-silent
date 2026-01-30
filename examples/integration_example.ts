import { PlatfoneClient } from '../src/api/platfone_client';
import { IActivationRepository } from '../src/domain/repository';
import { InMemoryActivationRepository } from '../src/infrastructure/in_memory_repository';
import { ReconciliationWorker } from '../src/application/reconciliation_worker';
import { Activation } from '../src/domain/models';
import { LifecycleState, SmsStatus } from '../src/domain/state_machine';

/**
 * =========================================================
 * CONSUMER-OWNED INFRASTRUCTURE
 * =========================================================
 * The app is responsible for providing the Gateway and Repository implementations.
 */

// 1. Fake ActivationGateway (In-Memory Implementation)
// Minimizes external dependencies and allows safe local testing.
class FakeActivationGateway extends PlatfoneClient {
    private db: Map<string, Activation> = new Map();

    constructor() {
        super('fake-key', 'http://fake-api');
    }

    // Override to return a completed activation immediately for testing
    async getActivation(id: string): Promise<Activation> {
        const stored = this.db.get(id);
        if (!stored) throw new Error('Not found');
        return stored;
    }

    // Helper to seed the fake remote state
    seedRemoteState(activation: Activation) {
        this.db.set(activation.id, activation);
    }
}

/**
 * =========================================================
 * COMPOSITION ROOT
 * =========================================================
 * Wiring the service using the package's components.
 * In a real package, this factory might be exported, but here we compose it.
 */
function createActivationService(gateway: PlatfoneClient, repo: IActivationRepository) {
    return new ReconciliationWorker(repo, gateway);
}

/**
 * =========================================================
 * EXECUTION ENTRY POINT
 * =========================================================
 */
async function main() {
    console.log('--- Starting Integration Example ---');

    // 1. Infrastructure Setup
    const gateway = new FakeActivationGateway();
    const repository = new InMemoryActivationRepository();

    // 2. Wire the Service
    const service = createActivationService(gateway, repository);
    console.log('✅ Service Wired');

    // 3. Setup Scenario: "Synced State"
    // Create an activation that exists locally in PENDING state
    const localActivation: Activation = {
        id: 'act-demo-1',
        externalId: 'ord-100',
        phone: '123456789',
        serviceId: 'wa',
        countryId: 'us',
        state: LifecycleState.PENDING,
        smsStatus: SmsStatus.NONE,
        price: 1.0,
        maxPrice: 2.0,
        smsCode: null,
        smsText: null,
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        isRetriable: true
    };
    await repository.save(localActivation);
    console.log('📝 Local State: PENDING');

    // Seed the "Remote" state as ACTIVE (simulating that the API processed it)
    gateway.seedRemoteState({
        ...localActivation,
        state: LifecycleState.ACTIVE,
        smsStatus: SmsStatus.SMS_REQUESTED
    });
    console.log('☁️  Remote State: ACTIVE');

    // 4. Execute One Safe Call (Reconciliation)
    console.log('🔄 Running Reconciliation...');
    await service.syncOne(localActivation.id);

    // 5. Verify Result
    const synced = await repository.findById(localActivation.id);
    if (synced?.state === LifecycleState.ACTIVE) {
        console.log('✅ SUCCESS: Local state reconciled to ACTIVE');
    } else {
        console.error('❌ FAILED: State mismatch', synced?.state);
        process.exit(1);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
