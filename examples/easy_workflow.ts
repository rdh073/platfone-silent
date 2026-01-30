import * as dotenv from 'dotenv';
import {
    runActivationWorkflow,
    PlatfoneClient,
    PricePolicy
} from '../src'; // Importing from package root

dotenv.config();

/**
 * CONSUMER APP EXAMPLE
 * 
 * Shows how easy it is to run the standardized workflow.
 * The consumer only provides Config + Gateway.
 */
async function main() {
    console.log("🚀 Starting Easy Workflow...");

    // 2. Gateway Selection (Consumer owns infrastructure)
    let gateway;
    const mode = (process.env.PLATFONE_EXECUTION_MODE === 'LIVE') ? 'LIVE' : 'DRY_RUN';

    if (mode === 'DRY_RUN') {
        // Simple Inline Mock Gateway for Simulation
        console.log("🛠️  Using Mock Gateway for DRY_RUN...");
        gateway = {
            getPrices: async () => [
                { country: 'ID', price: { min: 0.15, max: 0.20, suggested: 0.15 }, count: 100 },
                { country: 'US', price: { min: 2.00, max: 2.50, suggested: 2.10 }, count: 10 }
            ],
            requestActivation: async () => { throw new Error("Should not be called in DRY_RUN"); }
        } as any;
    } else {
        gateway = new PlatfoneClient(
            process.env.PLATFONE_API_KEY!,
            process.env.PLATFONE_API_BASE_URL!
        );
    }

    // 3. Configuration & Execution
    const result = await runActivationWorkflow({
        serviceId: 'wa',
        pricePolicy: (process.env.PLATFONE_PRICE_POLICY as PricePolicy) || PricePolicy.BALANCED,
        maxBudget: parseFloat(process.env.PLATFONE_MAX_PRICE || '1.00'),
        executionMode: mode
    }, {
        gateway
    });

    // 3. Result Handling
    switch (result.status) {
        case 'success':
            console.log(`✅ SUCCESS: Activated ${result.countryId} ($${result.price})`);
            console.log(`ID: ${result.activationId}`);
            break;
        case 'halt':
            console.log(`🛑 HALTED: ${result.reason}`);
            break;
        case 'failure':
            console.error(`💀 FAILED: ${result.error.message}`);
            process.exit(1);
    }
}

main().catch(err => console.error("Fatal:", err));
