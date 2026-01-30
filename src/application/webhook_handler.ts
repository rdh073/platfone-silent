import { IActivationRepository } from '../domain/repository';
import { InvariantCheckingStateMachine, EventSource } from '../domain/state_machine';

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
     */
    async handle(data: WebhookPayload): Promise<{ result: string }> {
        if (data.event_type !== 'activation.updated') {
            // account.low_balance etc. are logged but don't involve the state machine
            console.log(`[Webhook] Handling non-activation event: ${data.event_type}`);
            return { result: 'success' };
        }

        const { activation_id, activation_status, sms_status, sms_code, sms_text } = data.payload;

        const activation = await this.repository.findById(activation_id);
        if (!activation) {
            // In a real system, we might log this as an incident or try to fetch from API
            console.warn(`[Webhook] Activation NOT FOUND: ${activation_id}`);
            return { result: 'success' }; // Still return success to avoid retries for non-existent resources
        }

        try {
            const nextState = InvariantCheckingStateMachine.deriveFromPayload(
                activation,
                { activation_status, sms_status },
                EventSource.WEBHOOK
            );

            // Update domain metadata from webhook
            const updatedActivation = {
                ...activation,
                ...nextState,
                smsCode: sms_code ?? activation.smsCode,
                smsText: sms_text ?? activation.smsText,
                updatedAt: Math.floor(Date.now() / 1000),
            };

            await this.repository.save(updatedActivation);
            console.log(`[Webhook] SUCCESS: ${activation_id} moved to ${nextState.state}`);

        } catch (error: any) {
            // If invariant is violated, log and alert as per Playbook 4.2
            console.error(`[Webhook] INVARIANT VIOLATION for ${activation_id}: ${error.message}`);
            // We still return success because it's a terminal logical failure, not a transient network one
        }

        return { result: 'success' };
    }
}
