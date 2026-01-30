import * as dotenv from 'dotenv';
import { PlatfoneClient, RateLimitError, PriceConflictError } from '../src/api/platfone_client';

// Load environment variables (API Key, Base URL)
dotenv.config();

async function main() {
    // 1. Configuration
    const apiKey = process.env.PLATFONE_API_KEY || 'YOUR_API_KEY';
    const baseUrl = process.env.PLATFONE_API_BASE_URL || 'https://api.platfone.com';

    console.log(`🔌 Connecting to ${baseUrl}...`);

    // 2. Instantiate Client
    const client = new PlatfoneClient(apiKey, baseUrl);

    try {
        // 3. Basic Usage: Get User Balance
        console.log('\n💰 Checking Balance...');
        const balance = await client.getBalance();
        console.log(`   Balance: $${balance.total.toFixed(2)} (Reserved: $${balance.reserved.toFixed(2)})`);

        // 4. Catalog Usage: List Services (optional, if you want to see what's available)
        // console.log('\n📋 Fetching Services...');
        // const services = await client.getServices();
        // console.log(`   Found ${services.length} services.`);

        // 5. Activation Lifecycle Example
        // Note: We use a try-catch block specifically for business logic errors
        console.log('\n🚀 Requesting Activation (Simulation)...');

        // UNCOMMENT TO RUN ACTUAL REQUEST
        /*
        const activation = await client.requestActivation({
            service_id: 'wa',      // WhatsApp
            country_id: 'uk',      // United Kingdom
            max_price: 1.00,       // Max $1.00
            order_id: `demo-${Date.now()}` // Unique correlation ID
        });
        
        console.log(`   ✅ Activation Created: ${activation.id} (${activation.phone})`);
        console.log(`   Status: ${activation.state}`);
        */
        console.log('   (Skipped actual creation to prevent unintended billing)');

    } catch (error: any) {
        // 6. Error Handling
        if (error instanceof RateLimitError) {
            console.error(`⚠️  Rate Limited! Retry after ${error.retryAfter} seconds.`);
        } else if (error instanceof PriceConflictError) {
            console.error(`tao  Price Too High! Market: ${error.suggestedPrice}`);
        } else {
            console.error(`❌ API Error: ${error.message}`);
            if (error.response) {
                console.error('   Data:', error.response.data);
            }
        }
    }
}

main().catch(console.error);
