import { Activation } from '../domain/models';
import { IActivationRepository } from '../domain/repository';
import { LifecycleState } from '../domain/state_machine';

export class InMemoryActivationRepository implements IActivationRepository {
    private activations: Map<string, Activation> = new Map();

    async save(activation: Activation): Promise<void> {
        this.activations.set(activation.id, { ...activation });
    }

    async findById(id: string): Promise<Activation | null> {
        const activation = this.activations.get(id);
        return activation ? { ...activation } : null;
    }

    async findByExternalId(externalId: string): Promise<Activation | null> {
        for (const activation of this.activations.values()) {
            if (activation.externalId === externalId) {
                return { ...activation };
            }
        }
        return null;
    }

    async findActive(): Promise<Activation[]> {
        const activeStates = [
            LifecycleState.PENDING,
            LifecycleState.ACTIVE,
            LifecycleState.SMS_RECEIVED,
        ];

        return Array.from(this.activations.values())
            .filter(a => activeStates.includes(a.state))
            .map(a => ({ ...a }));
    }
}
