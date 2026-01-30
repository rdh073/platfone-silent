import { IActivationRepository } from '../domain/repository';
import { PlatfoneClient, RateLimitError } from '../api/platfone_client';
import { handleActivationWebhook } from '../workflow/webhook_logic';

export class ReconciliationWorker {
    constructor(
        private readonly repository: IActivationRepository,
        private readonly api: PlatfoneClient
    ) { }

    /**
     * Performs a single synchronization pass over all active activations.
     * INV-05: Polling is reconciliation only.
     */
    async syncAll(): Promise<{ processed: number; failures: number }> {
        const activeActivations = await this.repository.findActive();
        console.log(`[Worker] Starting sync pass for ${activeActivations.length} active activations...`);

        let processed = 0;
        let failures = 0;

        for (const activation of activeActivations) {
            try {
                await this.syncOne(activation.id);
                processed++;

                // Minor delay to respect rate limits if many active (INV-08)
                if (activeActivations.length > 5) {
                    await new Promise(r => setTimeout(r, 500));
                }
            } catch (error: any) {
                if (error instanceof RateLimitError) {
                    console.error(`[Worker] GLOBAL RATE LIMIT BREACH. Pausing sync loop.`);
                    return { processed, failures: failures + (activeActivations.length - processed) };
                }

                console.error(`[Worker] Failed to sync ${activation.id}: ${error.message}`);
                failures++;
            }
        }

        return { processed, failures };
    }

    /**
     * Syncs a single activation's state from the remote API.
     * Unified Reconciliation Strategy: TREAT POLL AS PSEUDO-WEBHOOK.
     */
    async syncOne(activationId: string): Promise<void> {
        const local = await this.repository.findById(activationId);
        if (!local) return;

        try {
            const remote = await this.api.getActivation(activationId);

            // ADR-004: Polling MUST reuse handleActivationWebhook logic.
            const result = handleActivationWebhook({
                activationId: activationId,
                status: remote.state,
                smsCode: remote.smsCode ?? undefined,
                smsText: remote.smsText ?? undefined
            }, local);

            if (result.status === 'success') {
                const { instruction } = result;
                const updated = {
                    ...local,
                    state: instruction.newState,
                    smsStatus: instruction.newSmsStatus,
                    smsCode: instruction.smsCode ?? local.smsCode,
                    smsText: instruction.smsText ?? local.smsText,
                    updatedAt: Math.floor(Date.now() / 1000),
                };
                await this.repository.save(updated);
                console.log(`[Worker] RECONCILED: ${activationId} (${local.state} -> ${updated.state})`);
            } else if (result.status === 'halt') {
                // Idempotent or safe ignore
            } else {
                console.error(`[Worker] Invariant Logic Failure for ${activationId}: ${result.error.message}`);
            }

        } catch (error: any) {
            if (error.statusCode === 404) {
                console.warn(`[Worker] GHOST ACTIVATION detected: ${activationId} missing on server.`);
            }
            throw error;
        }
    }
}

