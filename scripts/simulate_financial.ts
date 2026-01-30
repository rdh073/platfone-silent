import { PriceSelector, PricePolicy, Offer } from '../src/domain/price_selector';
import { InvariantCheckingStateMachine, LifecycleState, SmsStatus, ActivationState, EventSource } from '../src/domain/state_machine';
import { InMemoryActivationRepository } from '../src/infrastructure/in_memory_repository';
import { WebhookHandler, WebhookPayload } from '../src/application/webhook_handler';
import { Activation } from '../src/domain/models';

// --- VIRTUAL WALLET ---
class VirtualWallet {
    private balance: number = 10.00; // SIMULATED START
    private reserved: number = 0.00;

    getBalance() { return this.balance; }

    reserve(amount: number): boolean {
        if (this.balance < amount) return false;
        this.balance -= amount;
        this.reserved += amount;
        return true;
    }

    refund(amount: number) {
        this.reserved -= amount;
        this.balance += amount;
    }

    // "Spent" means permanently gone (finalized) - though we block finalize in this sim
    spend(amount: number) {
        this.reserved -= amount;
    }
}

// --- MOCK CLIENT ---
class MockFinancialClient {
    constructor(private wallet: VirtualWallet) { }

    async getBalance() {
        return { balance: this.wallet.getBalance(), currency: 'USD' };
    }

    async getPrices(country: string, service: string) {
        return {
            status: 'ok',
            services: [
                { service: 'whatsapp', price: 0.50, country: 'uk', quality: 80 },
                { service: 'whatsapp', price: 1.01, country: 'uk', quality: 90 }, // EC-08: > Max
            ]
        };
    }

    async requestActivation(service: string, country: string, price: number) {
        // SIMULATE BILLING CHECK
        if (!this.wallet.reserve(price)) {
            throw new Error(`Insufficient Balance: $${this.wallet.getBalance()} < $${price}`);
        }
        return {
            status: 'ok',
            id: `sim_act_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            phoneNumber: '+447000000000',
            activationTime: new Date().toISOString()
        };
    }
}

// --- LOGGER ---
const LOG: string[] = [];
function log(step: string, msg: string, data?: any) {
    // Safe date handling
    const now = new Date().toISOString();
    const time = now.split('T')[1] ? now.split('T')[1].replace('Z', '') : "TIME";
    const entry = `[${time}] [${step}] ${msg} ${data ? JSON.stringify(data) : ''}`;
    console.log(entry);
    LOG.push(entry);
}

// --- RUNNER ---
async function runFinancialSim() {
    log('INIT', 'Starting Financial Behaviour Verification (Mock Balance $10.00)');

    const wallet = new VirtualWallet();
    const client = new MockFinancialClient(wallet);
    const repo = new InMemoryActivationRepository();
    const webhookHandler = new WebhookHandler(repo);

    // --- Scenario A: Single Activation (Reserve -> Cancel -> Refund) ---
    log('SCENARIO A', 'Single Activation: Reserve -> Cancel -> Refund');
    const balStartA = wallet.getBalance();
    log('INFO', `Start Balance: $${balStartA.toFixed(2)}`);

    // 1. Discovery
    const pricesA = await client.getPrices('uk', 'whatsapp');
    const offersA = pricesA.services.map((s: any, i: number) => ({ id: `off_A_${i}`, price: s.price, quality: s.quality || 50 }));
    // Filter/Rank
    const rankedA = PriceSelector.rank(offersA, { policy: PricePolicy.BALANCED, maxPrice: 1.00 });
    const selectedA = rankedA[0];

    if (!selectedA) throw new Error("No valid offers found (A)");
    if (selectedA.price > 1.00) throw new Error("Invariant Fail: Max Price > 1.00 selected");

    // 2. Activation
    let actIdA = '';
    try {
        const res = await client.requestActivation('whatsapp', 'uk', selectedA.price);
        actIdA = res.id;
        log('ACTION', `Activated ${actIdA} for $${selectedA.price}`);

        // Save to repo
        const actObj: Activation = {
            id: actIdA,
            service: 'whatsapp', country: 'uk', price: selectedA.price, currency: 'USD',
            state: LifecycleState.PENDING, smsStatus: SmsStatus.NONE,
            createdAt: Math.floor(Date.now() / 1000), expiresAt: Math.floor(Date.now() / 1000) + 600, attempts: 0
        };
        await repo.save(actObj);

    } catch (e: any) {
        log('FAIL', `Activation A failed: ${e.message}`);
    }

    log('CHECK', `Balance after Reserve: $${wallet.getBalance().toFixed(2)} (Expected $9.50)`);
    if (wallet.getBalance() !== 9.50) log('FAIL', 'Balance mismatch!');

    // 3. Cancel (Refund)
    log('ACTION', 'Canceling Activation A (Simulating Refund Logic)');
    // In real app, `cancelActivation` calls API which refunds. Here we simulate client logic manually or mock it.
    // Let's assume the "System" calls cancel.
    wallet.refund(selectedA.price); // Simulating the API effect of cancel
    const actA = await repo.findById(actIdA);
    if (actA) {
        actA.state = LifecycleState.CANCELED;
        await repo.save(actA);
    }

    log('CHECK', `Balance after Refund: $${wallet.getBalance().toFixed(2)} (Expected $10.00)`);
    if (wallet.getBalance() !== 10.00) log('FAIL', 'Refund mismatch!');


    // --- Scenario B: Multiple Activations (Load Test) ---
    log('SCENARIO B', 'Multiple Activations (5x)');
    const actsB: string[] = [];
    const priceB = 0.50;

    for (let i = 0; i < 5; i++) {
        try {
            const res = await client.requestActivation('whatsapp', 'uk', priceB);
            actsB.push(res.id);
            // Don't save to repo to keep it simple, just checking wallet constraints
            log('BS-ACTION', `Activations ${i + 1}/5 OK. Bal: $${wallet.getBalance().toFixed(2)}`);
        } catch (e) {
            log('FAIL', `Multi-activation ${i} failed`);
        }
    }

    const balExpB = 10.00 - (5 * 0.50); // 7.50
    log('CHECK', `Balance after 5x: $${wallet.getBalance().toFixed(2)} (Expected $${balExpB.toFixed(2)})`);
    if (Math.abs(wallet.getBalance() - balExpB) > 0.01) log('FAIL', 'Multi-balance mismatch');

    // Refund them all to reset for C
    log('cleanup', 'Refunding Scenario B...');
    wallet.refund(5 * 0.50);


    // --- Scenario C: Exhaustion ---
    log('SCENARIO C', 'Wallet Exhaustion');
    // Balance is 10.00. Price is 0.50. Can do 20.
    // Let's do 21 loop.
    let countC = 0;
    for (let i = 0; i < 25; i++) {
        try {
            await client.requestActivation('whatsapp', 'uk', 0.50);
            countC++;
        } catch (e: any) {
            log('INFO', `Activation ${i + 1} Failed as expected: ${e.message}`);
            break; // Stop on first fail
        }
    }
    log('CHECK', `Activations successful: ${countC} (Expected 20)`);
    if (countC !== 20) log('FAIL', `Exhaustion count mismatch: ${countC}`);
    log('CHECK', `Final Balance: $${wallet.getBalance().toFixed(2)} (Expected $0.00)`);


    // --- Edge Cases ---
    log('SCENARIO D', 'Edge Cases');

    // EC-07: Exact Balance
    wallet.refund(0.50); // Bal 0.50
    log('EC-07', 'Exact Balance check ($0.50 wallet, $0.50 item)');
    try {
        await client.requestActivation('whatsapp', 'uk', 0.50);
        log('PASS', 'Simultaneous reserve/drain OK');
    } catch (e) {
        log('FAIL', 'Exact balance failed');
    }

    // EC-08: Price > Max
    log('EC-08', 'Price > Max ($1.01)');
    const pricesD = await client.getPrices('uk', 'whatsapp');
    const expensive = pricesD.services.find((s: any) => s.price > 1.00);
    // The PriceSelector should rely on policy, but if we feed it raw:
    if (expensive && expensive.price > 1.00) {
        log('PASS', 'Mock returned expensive item (ready for filtering)');
        // Actually run selector
        const rankedD = PriceSelector.rank(
            [{ id: 'exp', price: expensive.price, quality: 90 }],
            { policy: PricePolicy.BALANCED, maxPrice: 1.00 }
        );
        if (rankedD.length === 0) log('PASS', 'PriceSelector correctly filtered > $1.00');
        else log('FAIL', 'PriceSelector allowed expensive item');
    }

}

runFinancialSim().catch(console.error);
