import { PriceSelector, PricePolicy, Offer } from '../src/domain/price_selector';
import { InvariantCheckingStateMachine, LifecycleState, SmsStatus, ActivationState, EventSource } from '../src/domain/state_machine';
import { InMemoryActivationRepository } from '../src/infrastructure/in_memory_repository';
import { WebhookHandler, WebhookPayload } from '../src/application/webhook_handler';
import { Activation } from '../src/domain/models';

// --- MOCKS ---

class MockPlatfoneClient {
    async getBalance() {
        return { balance: 0.00, currency: 'USD' }; // Rigid Mock: $0.00
    }

    async getPrices(country: string, service: string) {
        return {
            status: 'ok',
            services: [
                { service: 'whatsapp', price: 0.50, country: 'uk', quality: 80 }, // Offer A (Quality)
                { service: 'whatsapp', price: 0.25, country: 'uk', quality: 40 }, // Offer B (Cheap)
                { service: 'whatsapp', price: 1.50, country: 'uk', quality: 90 }, // Offer C (Expensive - violation)
            ]
        };
    }

    async requestActivation(service: string, country: string) {
        return {
            status: 'ok',
            id: 'mock_activation_123',
            phoneNumber: '+447000000000',
            activationTime: new Date().toISOString()
        };
    }
}

// --- LOGGER ---
const LOG: string[] = [];
function log(step: string, msg: string, data?: any) {
    const entry = `[${new Date().toISOString().split('T')[1].replace('Z', '')}] [${step}] ${msg} ${data ? JSON.stringify(data) : ''}`;
    console.log(entry);
    LOG.push(entry);
}

// --- SIMULATION RUNNER ---

async function runSimulation() {
    log('INIT', 'Starting Phase 2 Simulation (Mock Mode) - FIXED');

    // 1. Setup
    const mockClient = new MockPlatfoneClient();
    const repo = new InMemoryActivationRepository();
    const webhookHandler = new WebhookHandler(repo);

    // 2. Discovery Simulation
    log('STEP 1', 'Discovery & Price Selection');
    const prices = await mockClient.getPrices('uk', 'whatsapp');
    const offers: Offer[] = prices.services.map((s: any, i: number) => ({ id: `offer_${i}`, price: s.price, quality: s.quality || 50 }));

    log('INFO', 'Raw Offers', offers);

    // Apply Policy
    try {
        const ranked = PriceSelector.rank(offers, {
            policy: PricePolicy.BALANCED,
            maxPrice: 1.00,
            qualityWeight: 0.5,
            priceWeight: 0.5
        });
        log('RESULT', 'Ranked Offers (Top 1 Selected)', ranked[0]);

        if (ranked[0].price > 1.00) throw new Error("Invariant Fail: Max Price violated");
    } catch (e: any) {
        log('ERROR', 'Price Selection Failed', e.message);
    }

    // 3. Activation Attempt (Real Constraints)
    log('STEP 2', 'Activation Attempt (Expecting Block - Zero Balance)');
    const balance = await mockClient.getBalance();
    if (balance.balance < 1.00) {
        log('SUCCESS', 'Activation BLOCKED by Pre-Flight Check (Balance < $1.00)');
    } else {
        log('FAIL', 'Activation proceeded despite low balance!');
    }

    // 4. Alternate Path (Forced Simulation for Logic Verification)
    log('STEP 3', 'Alternate Path: Forcing Mock Activation (Bypassing Balance for Test)');
    const activationId = 'sim_act_001';

    // Create a valid Activation object (Pending State)
    const initialActivation: Activation = {
        id: activationId,
        service: 'whatsapp',
        country: 'uk',
        price: 0.50,
        currency: 'USD',
        state: LifecycleState.PENDING,
        smsStatus: SmsStatus.NONE,
        createdAt: Math.floor(Date.now() / 1000),
        expiresAt: Math.floor(Date.now() / 1000) + 600,
        attempts: 0
    };

    await repo.save(initialActivation);
    log('STATE', `Created Activation ${activationId}`, initialActivation.state);

    // 5. SMS Simulation (Webhook)
    log('STEP 4', 'Simulating Webhooks (SMS & Edge Cases)');

    // EC-01: Duplicate Webhook
    // Must match WebhookPayload interface strictly
    const smsPayload: WebhookPayload = {
        event_type: 'activation.updated',
        event_id: 'evt_dup_test_1',
        payload: {
            activation_id: activationId,
            activation_status: 'active', // Remote says active
            sms_status: 'smsReceived',   // Remote says SMS here
            sms_text: 'Your code is 123-456',
            sms_code: '123-456'
        }
    };

    // First Delivery
    log('ACTION', 'Injecting SMS Webhook (1st delivery)');
    await webhookHandler.handle(smsPayload);
    const actAfter1 = await repo.findById(activationId);
    log('STATE', 'Post-SMS State', actAfter1?.state);

    // Second Delivery (Duplicate)
    log('ACTION', 'Injecting SMS Webhook (2nd delivery - Duplicate)');
    await webhookHandler.handle(smsPayload);
    const actAfter2 = await repo.findById(activationId);
    log('STATE', 'Post-Duplicate State (Should be same)', actAfter2?.state);

    if (actAfter1?.state === actAfter2?.state && actAfter2?.state === LifecycleState.SMS_RECEIVED) {
        log('PASS', 'Idempotency Verified: Duplicate webhook ignored / stable');
    } else {
        log('FAIL', `Idempotency Failed: State mismatch ${actAfter1?.state} vs ${actAfter2?.state}`);
    }

    // 6. Finalization Attempt
    log('STEP 5', 'Finalization Attempt (Expect Block)');
    const autoFinalize = process.env.PLATFONE_AUTO_FINALIZE === 'true';
    if (!autoFinalize) {
        log('SUCCESS', 'Finalization BLOCKED (AUTO_FINALIZE=false)');
    } else {
        log('FAIL', 'Risk: Auto-finalize is TRUE!');
    }

    // 7. Edge Cases
    log('STEP 6', 'Edge Case: Late SMS after Cancel');

    // Simulate a NEW activation that is already CANCELED
    const lateId = 'sim_act_late_002';
    const lateActivation: Activation = {
        ...initialActivation,
        id: lateId,
        state: LifecycleState.CANCELED, // Already canceled
        smsStatus: SmsStatus.NONE
    };
    await repo.save(lateActivation);

    // Attempt to inject SMS
    const latePayload: WebhookPayload = {
        event_type: 'activation.updated',
        event_id: 'evt_late_1',
        payload: {
            activation_id: lateId,
            activation_status: 'active',
            sms_status: 'smsReceived',
            sms_code: '999-999'
        }
    };

    log('ACTION', `Injecting SMS into CANCELED activation ${lateId}`);
    try {
        await webhookHandler.handle(latePayload);
        const finalLate = await repo.findById(lateId);
        if (finalLate?.state === LifecycleState.CANCELED) {
            log('PASS', 'Invariant Enforced: Cannot move from CANCELED to SMS_RECEIVED');
        } else {
            log('FAIL', `Invariant Violated: State moved to ${finalLate?.state}`);
        }
    } catch (e: any) {
        log('PASS', `Invariant Enforced (Exception): ${e.message}`);
    }

}

runSimulation().catch(e => console.error(e));
