import { Availability, Activation } from '../domain/models';
import { PriceSelector, PricePolicy, Offer } from '../domain/price_selector';

/**
 * 1. DEFINITIONS: Public and Internal Types
 */

// Public Config (Passed by Consumer)
export interface WorkflowConfig {
    serviceId: string;
    pricePolicy: PricePolicy;
    maxBudget: number;
    executionMode: 'DRY_RUN' | 'LIVE';
}

// Public Dependencies (Gateway Interface)
export interface ActivationGateway {
    getPrices(serviceId: string): Promise<Availability[]>;
    requestActivation(params: {
        service_id: string;
        country_id: string;
        max_price: number;
        order_id: string;
    }): Promise<Activation>;
}

// Workflow Result
export type WorkflowResult =
    | { status: 'success'; activationId: string; countryId: string; price: number }
    | { status: 'halt'; reason: string }
    | { status: 'failure'; error: Error };

/**
 * Internal Pipeline Types
 */
type StepResult<T> =
    | { status: 'success'; data: T }
    | { status: 'halt'; reason: string }
    | { status: 'failure'; error: Error };

interface Context {
    readonly config: WorkflowConfig;
    readonly gateway: ActivationGateway;
    readonly marketData?: readonly Availability[];
    readonly selectedOffer?: Readonly<Offer & { countryId: string }>;
    readonly activationId?: string;
}

function ok<T>(data: T): StepResult<T> { return { status: 'success', data }; }
function fail<T>(msg: string): StepResult<T> { return { status: 'failure', error: new Error(msg) }; }
function halt<T>(reason: string): StepResult<T> { return { status: 'halt', reason }; }

/**
 * 2. STEPS
 */

// Step 1: Fetch Market Data
async function fetchPrices(ctx: Context): Promise<StepResult<Context>> {
    // DRY_RUN Handling for demonstration/safety without spamming API if desired, 
    // BUT rule says "Gateway implementations" are consumer owned. 
    // The consumer might implement a FakeGateway for DRY_RUN or use real API.
    // However, we must not auto-inject behavior. 
    // We strictly call the gateway.

    // PURE GATEWAY CALL: No mock data injection here.
    // Consumer must provide a MockGateway if they want simulated data.
    try {
        const data = await ctx.gateway.getPrices(ctx.config.serviceId);
        if (!data || data.length === 0) return fail(`No availability for ${ctx.config.serviceId}`);
        return ok({ ...ctx, marketData: data });
    } catch (e: any) {
        return fail(`Gateway Error (getPrices): ${e.message}`);
    }
}

// Step 2: Select Strategy
async function selectStrategy(ctx: Context): Promise<StepResult<Context>> {
    if (!ctx.marketData) return fail("Missing market data");

    const offers: Offer[] = ctx.marketData.map(a => ({
        id: a.country,
        price: a.price.min,
        quality: a.quality?.avg || 0.5
        // Availability from domain/models.ts has country, price.min etc.
    }));

    try {
        const ranked = PriceSelector.rank(offers, {
            policy: ctx.config.pricePolicy,
            maxPrice: ctx.config.maxBudget
        });

        const winner = ranked[0];
        if (!winner) return fail("No valid offer found after ranking");

        return ok({
            ...ctx,
            selectedOffer: {
                id: winner.id,
                price: winner.price,
                quality: winner.quality,
                countryId: winner.id
            }
        });
    } catch (e: any) {
        return fail(`Selection Error: ${e.message}`);
    }
}

// Step 3: Safety Gate (Firewall)
async function safetyGate(ctx: Context): Promise<StepResult<Context>> {
    const { config, selectedOffer } = ctx;
    if (!selectedOffer) return fail("Invalid state: No selection made");

    // 1. Budget Hard Check
    if (selectedOffer.price > config.maxBudget) {
        return fail(`Safety Violation: Price $${selectedOffer.price} > Budget $${config.maxBudget}`);
    }

    // 2. DRY_RUN Enforcement (The ONLY place)
    if (config.executionMode !== 'LIVE') {
        return halt(`DRY_RUN Mode Active. Simulation: Would activate ${selectedOffer.countryId} at $${selectedOffer.price}`);
    }

    return ok(ctx);
}

// Step 0: Validation
async function validateConfig(ctx: Context): Promise<StepResult<Context>> {
    if (!ctx.config.serviceId) return fail("Missing serviceId");
    if (ctx.config.maxBudget <= 0) return fail("maxBudget must be positive");
    return ok(ctx);
}

// Step 4: Execute
async function execute(ctx: Context): Promise<StepResult<Context>> {
    const { config, gateway, selectedOffer } = ctx;
    if (!selectedOffer) return fail("Invalid context for execution");

    // NO DRY_RUN CHECKS HERE. Assumes LIVE.

    try {
        // Robust ID generation (or inject via deps if needed)
        const orderId = `ord-${Date.now()}-${Math.floor(Math.random() * 100000)}`;

        const result = await gateway.requestActivation({
            service_id: config.serviceId,
            country_id: selectedOffer.countryId,
            max_price: config.maxBudget,
            order_id: orderId
        });

        return ok({ ...ctx, activationId: result.id });
    } catch (e: any) {
        return fail(`Gateway Error (activate): ${e.message}`);
    }
}

/**
 * 3. ORCHESTRATOR (Public Function)
 */
export async function runActivationWorkflow(
    config: WorkflowConfig,
    deps: { gateway: ActivationGateway }
): Promise<WorkflowResult> {

    let ctx: Context = { config, gateway: deps.gateway };
    let result: StepResult<Context> = ok(ctx);

    const pipeline = [
        validateConfig,
        fetchPrices,
        selectStrategy,
        safetyGate,
        execute
    ];

    for (const step of pipeline) {
        if (result.status !== 'success') break;
        result = await step(result.data);
    }

    // Map internal result to public result
    if (result.status === 'halt') {
        return { status: 'halt', reason: result.reason };
    }
    if (result.status === 'failure') {
        return { status: 'failure', error: result.error };
    }

    // Success
    const finalCtx = result.data;
    if (!finalCtx.activationId || !finalCtx.selectedOffer) {
        return { status: 'failure', error: new Error("Workflow completed but missing output data") };
    }

    return {
        status: 'success',
        activationId: finalCtx.activationId,
        countryId: finalCtx.selectedOffer.countryId,
        price: finalCtx.selectedOffer.price
    };
}
