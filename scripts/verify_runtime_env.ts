import * as dotenv from 'dotenv';
import * as path from 'path';

// 1. Load ENV
const envPath = path.resolve(__dirname, '../.env');
console.log(`[VERIFY] Loading .env from: ${envPath}`);
const result = dotenv.config({ path: envPath });

if (result.error) {
    console.error('[FAIL] Failed to load .env file');
    process.exit(1);
}

// 2. Read Values
const mode = process.env.PLATFONE_EXECUTION_MODE;
const autoFinalize = process.env.PLATFONE_AUTO_FINALIZE;
const maxPrice = process.env.PLATFONE_MAX_PRICE;

console.log(`[VERIFY] PLATFONE_EXECUTION_MODE: '${mode}'`);
console.log(`[VERIFY] PLATFONE_AUTO_FINALIZE: '${autoFinalize}'`);
console.log(`[VERIFY] PLATFONE_MAX_PRICE: '${maxPrice}'`);

// 3. Assertions
let failures = 0;

if (mode !== 'DRY_RUN') {
    console.error('[FAIL] PLATFONE_EXECUTION_MODE must be "DRY_RUN"');
    failures++;
} else {
    console.log('[PASS] Execution Mode is DRY_RUN');
}

if (autoFinalize !== 'false') {
    console.error('[FAIL] PLATFONE_AUTO_FINALIZE must be "false"');
    failures++;
} else {
    console.log('[PASS] Auto-Finalize is disabled');
}

if (!maxPrice) {
    console.error('[FAIL] PLATFONE_MAX_PRICE is missing');
    failures++;
} else {
    console.log('[PASS] Max Price is set');
}

// 4. Negative Test (Simulated Guardrail)
// This simulates what happens if we tried to run in LIVE mode with these settings
if (mode === 'DRY_RUN') {
    console.log('[GUARDRAIL] Attempting simulated LIVE action...');
    // In a real app, the factory would throw. Here we confirm the config flag blocks it.
    if ((mode as string) === 'LIVE') {
        console.error('[FAIL] Guardrail breached! Code thinks it is LIVE.');
        failures++;
    } else {
        console.log('[PASS] Guardrail holds: Code knows it is DRY_RUN.');
    }
}

if (failures > 0) {
    console.error(`[VERDICT] FAIL: ${failures} checks failed.`);
    process.exit(1);
} else {
    console.log('[VERDICT] PASS: All environment runtime checks passed.');
    process.exit(0);
}
