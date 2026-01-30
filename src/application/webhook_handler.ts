import { IActivationRepository } from '../domain/repository';
import { handleActivationWebhook } from '../workflow/webhook_logic';

export interface WebhookPayload {
    event_type: 'activation.updated' | 'account.low_balance';
    event_id: string;
    payload: {
        activation_id: string;
        activation_status: string;
        sms_status: string;
        sms_code?: string;
        sms_text?: string;
        [key: string]: any;
    };
}

export class WebhookHandler {
    constructor(private readonly repository: IActivationRepository) { }

    /**
     * Processes an incoming webhook.
     * DOCTRINE-02: Webhook is Authoritative.
     * DOCTRINE-04: Idempotency is required.
     * ADR-004: Reconciliation ONLY.
     */
    async handle(data: WebhookPayload): Promise<{ result: string }> {
        if (data.event_type !== 'activation.updated') {
            return { result: 'success' };
        }

        const { activation_id, activation_status, sms_code, sms_text } = data.payload;

        const activation = await this.repository.findById(activation_id);
        if (!activation) {
            // ADR-004: MUST return error/404 so provider retries if record not yet persisted.
            throw new Error(`Activation ${activation_id} not found. Retry required.`);
        }

        const result = handleActivationWebhook({
            activationId: activation_id,
            status: activation_status,
            smsCode: sms_code,
            smsText: sms_text
        }, activation);

        if (result.status === 'success') {
            const { instruction } = result;
            const updated = {
                ...activation,
                state: instruction.newState,
                smsStatus: instruction.newSmsStatus,
                smsCode: instruction.smsCode ?? activation.smsCode,
                smsText: instruction.smsText ?? activation.smsText,
                updatedAt: Math.floor(Date.now() / 1000),
            };

            await this.repository.save(updated);
            console.log(`[Webhook] SUCCESS: ${activation_id} -> ${instruction.newState}`);
        } else if (result.status === 'halt') {
            console.log(`[Webhook] HALT: ${result.reason}`);
        } else {
            // failure (e.g. ID mismatch or critical missing logic)
            console.error(`[Webhook] ERROR: ${result.error.message}`);
            // Depending on strictness, we might want to return success here for terminal illegal states
            // to stop the provider from retrying uselessly, or throw to keep visibility.
            // For now, we return success to stop retries on "logical" failures.
        }

        return { result: 'success' };
    }
}

