import { Activation } from './models';

/**
 * Repository interface for managing activation persistence.
 * DOCTRINE-01: Explicit State Over Implicit Behavior.
 */
export interface IActivationRepository {
    /**
     * Saves or updates an activation.
     * MUST enforce uniqueness on activation_id (INV-01).
     */
    save(activation: Activation): Promise<void>;

    /**
     * Retrieves an activation by its primary external ID (activation_id).
     */
    findById(id: string): Promise<Activation | null>;

    /**
     * Retrieves an activation by our local correlation ID (order_id).
     */
    findByExternalId(externalId: string): Promise<Activation | null>;

    /**
     * Retrieves all activations that are not in a terminal state (PENDING, ACTIVE, SMS_RECEIVED).
     */
    findActive(): Promise<Activation[]>;
}
