import { LifecycleState, SmsStatus, ActivationState } from '../src/domain/state_machine';
import { InMemoryActivationRepository } from '../src/infrastructure/in_memory_repository';
import { WebhookHandler, WebhookPayload } from '../src/application/webhook_handler';
import { Activation } from '../src/domain/models';

// --- LOGGER ---
const LOG: string[] = [];
function log(step: string, msg: string, data?: any) {
    const now = new Date().toISOString();
    const timeRec = now.split('T')[1];
    const time = timeRec ? timeRec.split('.')[0] : 'UNKNOWN_TIME';
    const entry = `[${time}] [${step}] ${msg} ${data ? JSON.stringify(data) : ''}`;
    console.log(entry);
    LOG.push(entry);
}

// --- SIMULATION RUNNER ---
async function runWebhookSim() {
    log('INIT', 'Starting Webhook Simulation Engine (Mock Mode)');

    const repo = new InMemoryActivationRepository();
    const handler = new WebhookHandler(repo);

    // Helper to create base activation
    async function createActivation(id: string, initialStatus: LifecycleState = LifecycleState.PENDING) {
        const act: Activation = {
            id,
            service: 'whatsapp', country: 'uk', price: 0.50, currency: 'USD',
            state: initialStatus, smsStatus: SmsStatus.NONE,
            createdAt: Math.floor(Date.now() / 1000), expiresAt: Math.floor(Date.now() / 1000) + 600, attempts: 0
        };
        await repo.save(act);
        return act;
    }

    // --- Scenario A: Normal Flow ---
    log('\nSCENARIO A', 'Normal Flow (activation.updated -> smsRequested -> smsReceived)');
    const actA = await createActivation('act_A');

    // 1. SMS Requested
    await handler.handle({
        event_type: 'activation.updated',
        event_id: 'evt_A_1',
        payload: { activation_id: actA.id, activation_status: 'active', sms_status: 'smsRequested' }
    });
    let checkA = await repo.findById(actA.id);
    log('CHECK', `State after Request: ${checkA?.state} / ${checkA?.smsStatus}`);
    if (checkA?.state !== LifecycleState.ACTIVE) log('FAIL', 'Should be ACTIVE');

    // 2. SMS Received
    await handler.handle({
        event_type: 'activation.updated',
        event_id: 'evt_A_2',
        payload: { activation_id: actA.id, activation_status: 'active', sms_status: 'smsReceived', sms_text: 'Code 123' }
    });
    checkA = await repo.findById(actA.id);
    log('CHECK', `State after Receive: ${checkA?.state} / ${checkA?.smsStatus}`);
    if (checkA?.state !== LifecycleState.SMS_RECEIVED) log('FAIL', 'Should be SMS_RECEIVED');


    // --- Scenario B: Duplicate Delivery ---
    log('\nSCENARIO B', 'Duplicate Delivery (Idempotency)');
    const actB = await createActivation('act_B', LifecycleState.ACTIVE);

    const payloadB: WebhookPayload = {
        event_type: 'activation.updated',
        event_id: 'evt_B_1',
        payload: { activation_id: actB.id, activation_status: 'active', sms_status: 'smsReceived', sms_text: 'Code 999' }
    };

    // First
    await handler.handle(payloadB);
    const stateB1 = (await repo.findById(actB.id))?.state;
    log('Action', 'Delivered Event B1');

    // Second (Duplicate)
    await handler.handle(payloadB);
    const stateB2 = (await repo.findById(actB.id))?.state;
    log('Action', 'Delivered Event B1 (Again)');

    if (stateB1 === stateB2) log('PASS', 'State remained stable');
    else log('FAIL', 'State changed on duplicate!');


    // --- Scenario C: Out-of-Order (Ratchet) ---
    log('\nSCENARIO C', 'Out-of-Order (Received arrives before Requested)');
    const actC = await createActivation('act_C', LifecycleState.PENDING);

    // "Received" arrives first (should jump ahead)
    await handler.handle({
        event_type: 'activation.updated',
        event_id: 'evt_C_late',
        payload: { activation_id: actC.id, activation_status: 'active', sms_status: 'smsReceived', sms_text: 'Jump' }
    });
    const checkC1 = await repo.findById(actC.id);
    log('CHECK', `State after Early Receive: ${checkC1?.state}`);
    if (checkC1?.state !== LifecycleState.SMS_RECEIVED) log('FAIL', 'Did not jump to SMS_RECEIVED');

    // "Requested" arrives later (should be ignored due to monotonicity)
    await handler.handle({
        event_type: 'activation.updated',
        event_id: 'evt_C_early',
        payload: { activation_id: actC.id, activation_status: 'active', sms_status: 'smsRequested' }
    });
    const checkC2 = await repo.findById(actC.id);
    log('CHECK', `State after Late Request: ${checkC2?.state}`);
    if (checkC2?.state === LifecycleState.SMS_RECEIVED) log('PASS', 'Ignored regressive update');
    else log('FAIL', 'State regressed!');


    // --- Scenario D: Late Event (After Cancel) ---
    log('\nSCENARIO D', 'Late Event (Activation Canceled)');
    const actD = await createActivation('act_D', LifecycleState.CANCELED); // Terminated

    await handler.handle({
        event_type: 'activation.updated',
        event_id: 'evt_D_zombie',
        payload: { activation_id: actD.id, activation_status: 'active', sms_status: 'smsReceived' }
    });
    const checkD = await repo.findById(actD.id);
    if (checkD?.state === LifecycleState.CANCELED) log('PASS', 'Zombie event ignored (Terminated state)');
    else log('FAIL', `Resurrected from Cancelled to ${checkD?.state}`);


    // --- Scenario E/F: Filter Strictness (Ignored Events) ---
    log('\nSCENARIO E/F', 'Ignored Events (Filter Strictness)');
    const actE = await createActivation('act_E', LifecycleState.ACTIVE);

    const ignoredEvents = [
        'account.low_balance',
        'customer.activation.updated',
        'customer.low_balance',
        'alternative.activation.updated'
    ];

    for (const evtType of ignoredEvents) {
        // Cast to any to simulate "unknown" union types coming from wire
        await handler.handle({
            event_type: evtType as any,
            event_id: `evt_ignore_${evtType}`,
            payload: { activation_id: actE.id, activation_status: 'canceled', sms_status: 'none' } // Payload tries to cancel!
        });
        log('INFO', `Sent ${evtType}`);
    }

    const checkE = await repo.findById(actE.id);
    log('CHECK', `State after ignored barrage: ${checkE?.state}`);
    if (checkE?.state === LifecycleState.ACTIVE) log('PASS', 'All informational events ignored. State preserved.');
    else log('FAIL', 'State was mutated by informational event!');

}

runWebhookSim().catch(console.error);
