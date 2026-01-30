import * as dotenv from 'dotenv';
import { PlatfoneClient } from '../src/api/platfone_client';
import { PriceSelector, PricePolicy } from '../src/domain/price_selector';
import { Availability } from '../src/domain/models';

dotenv.config();

/**
 * Example: Smart Policy-Based Activation
 * 
 * 1. Fetch available prices for a service (e.g. WhatsApp)
 * 2. Apply a strategy (CHEAPEST, BALANCED, or BEST_QUALITY)
 * 3. Select the winning country
 * 4. Request activation
 */
async function main() {
    const apiKey = process.env.PLATFONE_API_KEY || 'YOUR_KEY';
    const baseUrl = process.env.PLATFONE_API_BASE_URL || 'https://api.platfone.com';

    const client = new PlatfoneClient(apiKey, baseUrl);

    // CONFIGURATION
    const serviceId = 'wa';
    const myPolicy = (process.env.PLATFONE_PRICE_POLICY as PricePolicy) || PricePolicy.BALANCED;
    const maxBudget = parseFloat(process.env.PLATFONE_MAX_PRICE || '1.00');

    console.log(`🤖 Starting Smart Activation Flow`);
    console.log(`   Service: ${serviceId}`);
    console.log(`   Policy:  ${myPolicy}`);
    console.log(`   Budget:  $${maxBudget.toFixed(2)}`);

    try {
        // Step 1: Get market data
        console.log(`\n📡 Fetching market prices...`);
        const availabilities: Availability[] = await client.getPrices(serviceId);

        if (!availabilities || availabilities.length === 0) {
            console.error('❌ No availability found for service.');
            return;
        }
        console.log(`   Found ${availabilities.length} options.`);

        // Step 2: Map to PriceSelector format
        // We map 'min' price to the selector's 'price' field.
        const offers = availabilities.map(a => ({
            id: a.country,
            price: a.price.min,
            quality: a.quality?.avg || 0.5
        }));

        // Step 3: Run Selector
        console.log(`\n🧠 Ranking offers...`);
        const ranked = PriceSelector.rank(offers, {
            policy: myPolicy,
            maxPrice: maxBudget
        });

        const winner = ranked[0];
        console.log(`   🏆 Winner: ${winner.id} ($${winner.price})`);

        // Step 4: Execute
        if (process.env.PLATFONE_EXECUTION_MODE === 'LIVE') {
            console.log(`\n🚀 Requesting Activation...`);
            const activation = await client.requestActivation({
                service_id: serviceId,
                country_id: winner.id,
                max_price: maxBudget,
                order_id: `smart-order-${Date.now()}`
            });
            console.log(`   ✅ Activation Created! ID: ${activation.id}`);
        } else {
            console.log(`\n🛑 DRY_RUN: Skipping actual API call.`);
            console.log(`   (Would have called requestActivation for ${winner.id})`);
        }

    } catch (error: any) {
        console.error(`❌ Error: ${error.message}`);
    }
}

main().catch(console.error);
