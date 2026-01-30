import * as dotenv from 'dotenv';
// Mock Client for DRY_RUN safety
class MockPlatfoneClient {
    constructor(private key: string, private url: string) {
        console.log(`[MOCK] Initialized Client (Key: ${key.substring(0, 4)}...)`);
    }

    async getBalance() {
        console.log('[MOCK] getBalance called');
        return { total: 10.00, reserved: 0.00, currency: 'USD' };
    }

    async requestActivation(params: any) {
        console.log('[MOCK] requestActivation called with:', params);
        if (params.max_price && params.max_price < 0.50) throw new Error("Price too low");
        return {
            id: 'mock-act-dry-run',
            phone: '+447000000000',
            service: params.service_id,
            country: params.country_id
        };
    }
}

dotenv.config();

const apiKey = process.env.PLATFONE_API_KEY;
const apiUrl = process.env.PLATFONE_API_BASE_URL;
const mode = process.env.PLATFONE_EXECUTION_MODE;
const autoFinalize = process.env.PLATFONE_AUTO_FINALIZE;
const maxPriceStr = process.env.PLATFONE_MAX_PRICE;

async function dryRun() {
    console.log("✈️ PRE-FLIGHT: Starting Live Dry-Run Sequence (SAFE MODE)");

    // 1. CONFIG & SAFETY CHECKS
    if (!apiKey || !apiUrl) {
        console.error("❌ MISSING KEYS: PLATFONE_API_KEY or PLATFONE_API_BASE_URL missing in .env");
        process.exit(1);
    }

    if (mode !== 'DRY_RUN') {
        console.error(`❌ SAFETY HALT: Execution Mode must be 'DRY_RUN'. Found: '${mode}'`);
        process.exit(1);
    }

    if (autoFinalize !== 'false') {
        console.error(`❌ SAFETY HALT: Auto-Finalize must be 'false'. Found: '${autoFinalize}'`);
        process.exit(1);
    }

    console.log("✅ CONFIG VERIFIED: DRY_RUN | Auto-Finalize: OFF");

    // 2. INITIALIZE MOCK CLIENT
    // WE DO NOT USE THE REAL CLIENT IN DRY_RUN SCRIPT TO GUARANTEE NO SIDE EFFECTS
    const client = new MockPlatfoneClient(apiKey, apiUrl);

    // 3. RUN LOGIC
    const SAFETY_MAX_PRICE = maxPriceStr ? parseFloat(maxPriceStr) : 1.00;
    const TARGET_SERVICE = 'whatsapp';
    const TARGET_COUNTRY = 'uk';
    const DRY_RUN_ORDER_ID = `dry-run-${Date.now()}`;

    console.log(`🔒 GUARDRAILS ACTIVE: Max Price $${SAFETY_MAX_PRICE.toFixed(2)}`);

    try {
        // Step 1: Check Balance
        const balance = await client.getBalance();
        console.log(`💰 Current Balance: $${balance.total} (Reserved: $${balance.reserved})`);

        // Step 2: Request Activation
        console.log(`🚀 Requesting Activation (${DRY_RUN_ORDER_ID})...`);
        const activation = await client.requestActivation({
            service_id: TARGET_SERVICE,
            country_id: TARGET_COUNTRY,
            max_price: SAFETY_MAX_PRICE,
            order_id: DRY_RUN_ORDER_ID
        });

        console.log(`✅ ACTIVATION SECURED: ID ${activation.id} | Phone: ${activation.phone}`);
        console.log(`⚠️ ACTION REQUIRED: This was a simulated run. No real SMS will arrive.`);
        console.log(`🛑 AUTO-FINALIZE DISABLED. Flow Complete.`);

    } catch (error: any) {
        console.error(`💥 DRY RUN FAILED:`, error.message);
    }
}

dryRun();
