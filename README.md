# Platfone Activation Library

**Robust activation management library with state machine validation and webhook reconciliation for the Platfone API.**

This library provides a safe, type-checked, and resilient way to interact with the Platfone API for managing temporary phone number activations. It enforces strict architectural invariants (like "Explicit State Over Implicit Behavior") to prevent billing leaks and undefined states.

## Features

*   **🛡️ Safety First:** Enforces strict state transitions (e.g., cannot bill after cancellation).
*   **🤖 Automated Reconciliation:** Handles webhooks and polling to keep local state in sync.
*   **🔌 Easy Integration:** Simple TypeScript API for requesting and managing numbers.
*   **🧪 Simulators Included:** Built-in "Fake Gateway" for testing without spending money.

## Installation

```bash
npm install platfone-activation
```

*(Note: Ensure you have Node.js v18+)*

## Configuration

This library uses `.env` for configuration.

1.  Copy the example file:
    ```bash
    cp .env.example .env
    ```

2.  Edit `.env` to match your needs:

    ```ini
    # API Credentials
    PLATFONE_API_KEY=your_actual_key_here
    PLATFONE_API_BASE_URL=https://api.platfone.com/v1

    # Safety & Billing limits
    PLATFONE_MAX_PRICE=2.00
    
    # Policy: CHEAPEST, BALANCED, or BEST_QUALITY
    PLATFONE_PRICE_POLICY=BALANCED

    # Execution Mode: DRY_RUN (safe) or LIVE (real money)
    PLATFONE_EXECUTION_MODE=DRY_RUN

    # Auto-finalize on SMS receipt? true/false
    PLATFONE_AUTO_FINALIZE=false
    ```

## Usage Examples

We provide ready-to-run examples in the `examples/` directory.

### 0. High-Level Workflow (Recommended)
The easiest way to use the library. You provide the configuration (via `.env`) and the client, and the package handles the rest (Fetching -> Ranking -> Safety Check -> Execution).

**Run:** `npx ts-node examples/easy_workflow.ts`

```typescript
import { runActivationWorkflow, PlatfoneClient, PricePolicy } from 'platfone-activation';

// 1. Setup Client
const client = new PlatfoneClient(process.env.PLATFONE_API_KEY, process.env.PLATFONE_API_BASE_URL);

// 2. Run Workflow
const result = await runActivationWorkflow({
    serviceId: 'wa',
    pricePolicy: PricePolicy.BALANCED,
    maxBudget: 1.00,
    executionMode: 'DRY_RUN' // or 'LIVE' from env
}, { 
    gateway: client 
});
```

### 0.1 Asynchronous Webhook Handling (ADR-004)
The library provides a pure, IO-free handler to reconcile states from provider webhooks. This follows **ADR-004** (Unified Activation Flow) which guarantees that webhooks can only update existing activations, never create or bill them.

```typescript
import { handleActivationWebhook } from 'platfone-activation';

// 1. You receive a webhook event (authenticated by your app)
const event = { activationId: '123', status: 'active', smsCode: '9999' };

// 2. You load the current activation from your DB
const current = await myDb.load('123');

// 3. Reconcile with the library
const result = handleActivationWebhook(event, current);

if (result.status === 'success') {
    // 4. Update your database with the instruction
    await myDb.update('123', result.instruction);
    
    // 5. If instruction says so, perform side effects (like finalization)
    if (result.instruction.shouldFinalize) {
        await client.finalizeActivation('123');
    }
}
```

### 1. Simple Activation (Service Only)
Request a number for a service (e.g., WhatsApp) *without* specifying a country. The API will pick the best one based on your Policy.

**Run:** `npx ts-node examples/service_only_example.ts`

```typescript
import { PlatfoneClient } from '../src/api/platfone_client';

const client = new PlatfoneClient(process.env.PLATFONE_API_KEY, process.env.PLATFONE_API_BASE_URL);

// Request 'wa' (WhatsApp) service, generic country
const activation = await client.requestActivation({
    service_id: 'wa',
    // country_id is optional!
    max_price: 1.50,
    order_id: 'my-order-123'
});
```

### 2. Client Usage
Direct usage of the API client for checking balance, listing services, etc.

**Run:** `npx ts-node examples/client_usage.ts`

```typescript
const balance = await client.getBalance();
console.log(`Balance: $${balance.total}`);
```

### 3. Full Integration (Worker & State Machine)
Advanced usage showing how to wire up the `ReconciliationWorker` with a repository.

**Run:** `npx ts-node examples/integration_example.ts`

## Testing

Run the unit test suite to verify everything is working locally:

```bash
npm test
```

## License

MIT License. See [LICENSE](LICENSE) for details.
