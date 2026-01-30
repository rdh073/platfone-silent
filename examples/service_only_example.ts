import * as dotenv from 'dotenv';
import { PlatfoneClient } from '../src/api/platfone_client';

// Load environment variables
dotenv.config();

async function main() {
    const apiKey = process.env.PLATFONE_API_KEY || 'YOUR_API_KEY';
    const baseUrl = process.env.PLATFONE_API_BASE_URL || 'https://api.platfone.com';

    const client = new PlatfoneClient(apiKey, baseUrl);

    console.log('🚀 Requesting Service-Only Activation (Any Country)...');

    // Example: Requesting generic 'wa' (WhatsApp) service, letting API pick the country
    // Note: country_id is OMITTED
    try {
        /* 
        // UNCOMMENT TO RUN REAL REQUEST
        const activation = await client.requestActivation({
            service_id: 'wa',
            // country_id is omitted!
            max_price: 2.0,
            order_id: `any-country-demo-${Date.now()}`
        });

        console.log(`✅ Activation Created!`);
        console.log(`   ID: ${activation.id}`);
        console.log(`   Country: ${activation.countryId} (Selected by API)`);
        */
        console.log('   (Skipped actual execution to save funds/prevent side-effects)');
        console.log('   Code demonstrates valid signature for omitting country_id.');

    } catch (error: any) {
        console.error('❌ Error:', error.message);
    }
}

main().catch(console.error);
