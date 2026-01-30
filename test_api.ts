import axios from 'axios';
import * as dotenv from 'dotenv';

dotenv.config();

const sandboxUrl = process.env.PLATFONE_SANDBOX_URL;
const sandboxKey = process.env.PLATFONE_SANDBOX_KEY;
const productionUrl = process.env.PLATFONE_PRODUCTION_URL;
const productionKey = process.env.PLATFONE_PRODUCTION_KEY;

async function testEndpoint(name: string, url: string, key: string, endpoint: string) {
    console.log(`--- Testing ${name}: ${endpoint} ---`);
    try {
        const response = await axios.get(`${url}${endpoint}`, {
            headers: {
                'X-Api-Key': key
            }
        });
        console.log(`Status: ${response.status}`);
        console.log(`Data:`, JSON.stringify(response.data, null, 2));
        return response.data;
    } catch (error: any) {
        console.error(`Error ${name}: ${error.message}`);
        if (error.response) {
            console.error(`Response Data:`, JSON.stringify(error.response.data, null, 2));
        }
        return null;
    }
}

async function runTests() {
    if (!sandboxKey || !productionKey) {
        console.error("Missing API keys in .env");
        process.exit(1);
    }

    console.log("🚀 Starting Platfone API Tests...\n");

    // 1. Sandbox Balance
    await testEndpoint("Sandbox", sandboxUrl!, sandboxKey, "/user/balance");

    // 2. Production Balance
    await testEndpoint("Production", productionUrl!, productionKey, "/user/balance");

    // 3. Catalog (Services)
    await testEndpoint("Sandbox", sandboxUrl!, sandboxKey, "/activation/services");

    // 4. Catalog (Countries)
    await testEndpoint("Sandbox", sandboxUrl!, sandboxKey, "/activation/countries");

    // 5. Prices (WhatsApp)
    await testEndpoint("Sandbox", sandboxUrl!, sandboxKey, "/activation/prices/services?service_id=whatsapp");

    console.log("\n✅ Tests completed.");
}

runTests();
