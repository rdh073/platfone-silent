import { IActivationRepository } from '../domain/repository';
import { PlatfoneClient, RateLimitError } from '../api/platfone_client';
import { InvariantCheckingStateMachine, EventSource } from '../domain/state_machine';

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
     * Truth resides in the combination of Webhook + API.
     */
    async syncOne(activationId: string): Promise<void> {
        const local = await this.repository.findById(activationId);
        if (!local) return;

        try {
            const remote = await this.api.getActivation(activationId);

            // We use the state machine to transition from local to remote state.
            // This enforces invariants like monotonic progression.
            const nextState = InvariantCheckingStateMachine.deriveFromPayload(
                local,
                {
                    activation_status: remote.state, // Map the domain status back to what driveFromPayload expects if needed
                    sms_status: remote.smsStatus
                },
                EventSource.POLL
            );

            // Only update if something changed
            if (nextState.state !== local.state || nextState.smsStatus !== local.smsStatus) {
                const updated = {
                    ...local,
                    ...nextState,
                    smsCode: remote.smsCode ?? local.smsCode,
                    smsText: remote.smsText ?? local.smsText,
                    updatedAt: Math.floor(Date.now() / 1000),
                };
                await this.repository.save(updated);
                console.log(`[Worker] RECONCILED: ${activationId} (${local.state} -> ${updated.state})`);
            }
        } catch (error: any) {
            if (error.statusCode === 404) {
                console.warn(`[Worker] GHOST ACTIVATION detected: ${activationId} missing on server.`);
                // Note: As per Doctrine 3, we freeze it for manual verification if it's supposed to be active
            }
            throw error;
        }
    }
}
