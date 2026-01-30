import * as dotenv from 'dotenv';
import { PlatfoneClient } from '../src/api/platfone_client';
import { PriceSelector, PricePolicy, Offer } from '../src/domain/price_selector';
import { Availability } from '../src/domain/models';

dotenv.config();

// =================================================================
// 1. DEFINITIONS (The Contract)
// =================================================================

/**
 * Result Pattern: Explicit success/failure/halt.
 * Halt means "Stop gracefully, but not an error".
 */
type Result<T> =
    | { status: 'success'; data: T }
    | { status: 'failure'; error: Error }
    | { status: 'halt'; reason: string };

function ok<T>(data: T): Result<T> { return { status: 'success', data }; }
function fail<T>(msg: string): Result<T> { return { status: 'failure', error: new Error(msg) }; }
function halt<T>(reason: string): Result<T> { return { status: 'halt', reason }; }

/**
 * Workflow Context: The "State" passed between steps.
 */
interface Context {
    readonly serviceId: string;

    config?: {
        apiKey: string;
        baseUrl: string;
        policy: PricePolicy;
        maxBudget: number;
        mode: 'DRY_RUN' | 'LIVE';
    };

    client?: PlatfoneClient;
    marketData?: Availability[];
    selectedOffer?: Offer & { countryId: string };

    activationId?: string;
}

// =================================================================
// 2. STEPS (Single Responsibility, Pure-ish)
// =================================================================

async function loadConfiguration(ctx: Context): Promise<Result<Context>> {
    const apiKey = process.env.PLATFONE_API_KEY;
    const baseUrl = process.env.PLATFONE_API_BASE_URL;

    if (!apiKey || !baseUrl) return fail("Missing API Credentials in .env");

    return ok({
        ...ctx,
        config: {
            apiKey,
            baseUrl,
            policy: (process.env.PLATFONE_PRICE_POLICY as PricePolicy) || PricePolicy.BALANCED,
            maxBudget: parseFloat(process.env.PLATFONE_MAX_PRICE || '1.00'),
            mode: (process.env.PLATFONE_EXECUTION_MODE === 'LIVE') ? 'LIVE' : 'DRY_RUN'
        },
        client: new PlatfoneClient(apiKey, baseUrl)
    });
}

async function fetchMarketData(ctx: Context): Promise<Result<Context>> {
    if (!ctx.client) return fail("Client not initialized");

    // Mock data for DRY_RUN to allow pipeline testing without live API
    if (ctx.config?.mode === 'DRY_RUN') {
        console.log(`📡 [DRY_RUN] Using Mock Market Data...`);
        return ok({
            ...ctx,
            marketData: [
                { country: 'US', price: { min: 5.0, max: 5.0, suggested: 5.0 }, count: 10, quality: { avg: 0.9 } },
                { country: 'ID', price: { min: 0.1, max: 0.2, suggested: 0.15 }, count: 500, quality: { avg: 0.6 } },
                { country: 'RU', price: { min: 2.0, max: 2.5, suggested: 2.0 }, count: 20, quality: { avg: 0.5 } }
            ]
        });
    }

    try {
        console.log(`📡 Fetching prices for ${ctx.serviceId}...`);
        const data = await ctx.client.getPrices(ctx.serviceId);
        if (!data || data.length === 0) return fail(`No availability for ${ctx.serviceId}`);
        return ok({ ...ctx, marketData: data });
    } catch (e: any) {
        return fail(`API Error: ${e.message}`);
    }
}

async function selectStrategy(ctx: Context): Promise<Result<Context>> {
    if (!ctx.marketData || !ctx.config) return fail("Missing data for selection");

    const offers: Offer[] = ctx.marketData.map(a => ({
        id: a.country,
        price: a.price.min,
        quality: a.quality?.avg || 0.5
    }));

    try {
        console.log(`🧠 Ranking ${offers.length} options via ${ctx.config.policy}...`);
        const ranked = PriceSelector.rank(offers, {
            policy: ctx.config.policy,
            maxPrice: ctx.config.maxBudget
        });

        const winner = ranked[0];
        if (!winner) throw new Error("Unexpected empty ranking result");

        console.log(`   🏆 Selected: ${winner.id} ($${winner.price})`);

        return ok({
            ...ctx,
            selectedOffer: {
                id: winner.id,
                price: winner.price,
                quality: winner.quality,
                provider_name: winner.provider_name,
                countryId: winner.id
            }
        } as Context);
    } catch (e: any) {
        return fail(`Selection Failed: ${e.message}`);
    }
}

/** 
 * Step 4: SAFETY GATE (The Firewall) 
 * responsibility: ENFORCE SAFETY and STOP DRY_RUN
 */
async function safetyGate(ctx: Context): Promise<Result<Context>> {
    const { config, selectedOffer } = ctx;
    if (!config || !selectedOffer) return fail("Invalid state at Safety Gate");

    console.log(`🛡️  SAFETY CHECK: Mode=[${config.mode}] Budget=[$${config.maxBudget}] Price=[$${selectedOffer.price}]`);

    // 1. Budget Hard Check
    if (selectedOffer.price > config.maxBudget) {
        return fail(`Safety Halt: Price $${selectedOffer.price} exceeds budget $${config.maxBudget}`);
    }

    // 2. DRY_RUN Bypass (THE ONLY PLACE THIS CHECK EXISTS)
    if (config.mode !== 'LIVE') {
        return halt(`DRY_RUN Active. Execution stopped safely by SafetyGate.`);
    }

    return ok(ctx);
}

/** 
 * Step 5: Execute (Side Effects)
 * responsibility: RUN THE ORDER. 
 * ASSUMES LIVE MODE. NO CHECKS ALLOWED.
 */
async function executeActivation(ctx: Context): Promise<Result<Context>> {
    // Fail execution if data missing logic (Architectural requirement)
    const { config, client, selectedOffer, serviceId } = ctx;
    if (!config || !client || !selectedOffer) return fail("Invalid context. Missing config/client/offer.");

    // NOTICE: NO DRY_RUN CHECK HERE.
    // Logic guarantees we only reach here if LIVE.

    try {
        console.log(`🚀 EXECUTING LIVE ORDER: ${serviceId} -> ${selectedOffer.countryId}`);
        const result = await client.requestActivation({
            service_id: serviceId,
            country_id: selectedOffer.countryId,
            max_price: config.maxBudget,
            order_id: `pipeline-${Date.now()}`
        });

        console.log(`   ✅ SUCCESS. Activation ID: ${result.id}`);
        return ok({ ...ctx, activationId: result.id });
    } catch (e: any) {
        return fail(`Execution Failed: ${e.message}`);
    }
}

// =================================================================
// 3. EXTENSIBILITY
// =================================================================

function withLogging(stepName: string, stepFn: (ctx: Context) => Promise<Result<Context>>) {
    return async (ctx: Context) => {
        const start = Date.now();
        const result = await stepFn(ctx);
        const duration = Date.now() - start;

        // Log status icon
        let icon = '❓';
        if (result.status === 'success') icon = '✅';
        if (result.status === 'failure') icon = '❌';
        if (result.status === 'halt') icon = '🛑';

        console.log(`${icon} [Step: ${stepName}] took ${duration}ms`);
        return result;
    };
}

// =================================================================
// 4. THE PIPELINE ORCHESTRATOR
// =================================================================

async function runWorkflow() {
    let ctx: Context = { serviceId: 'wa' };
    let result: Result<Context> = ok(ctx);

    const pipeline = [
        withLogging('LoadConfig', loadConfiguration),
        withLogging('FetchData', fetchMarketData),
        withLogging('SelectStrategy', selectStrategy),
        withLogging('SafetyGate', safetyGate),
        withLogging('Execute', executeActivation)
    ];

    for (const step of pipeline) {
        // Stop if not successful (Halt or Failure)
        if (result.status !== 'success') break;
        result = await step(result.status === 'success' ? result.data : ctx);
    }

    // Final Reporting
    if (result.status === 'halt') {
        console.log(`\n✨ WORKFLOW HALTED GRACEFULLY: ${result.reason}`);
        process.exit(0);
    } else if (result.status === 'failure') {
        console.error(`\n💀 WORKFLOW FAILED: ${result.error.message}`);
        process.exit(1);
    } else {
        console.log(`\n✨ WORKFLOW COMPLETED SUCCESSFULLY`);
    }
}

runWorkflow();
