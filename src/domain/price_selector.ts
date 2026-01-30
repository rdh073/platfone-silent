/**
 * MODULE: PriceSelector
 * RESPONSIBILITY: This module performs ranking only. 
 * It does not and must not make pricing or billing decisions.
 * It is pure, deterministic, and side-effect free.
 */

export enum PricePolicy {
    CHEAPEST = 'CHEAPEST',
    BALANCED = 'BALANCED',
    BEST_QUALITY = 'BEST_QUALITY'
}

export interface Offer {
    id: string;
    price: number;
    quality: number; // 0.0 to 1.0 (or higher, normalized externally usually, but we stick to raw here)
    provider_name?: string;
}

export interface SelectorOptions {
    policy: PricePolicy;
    maxPrice: number;
    qualityWeight?: number; // For BALANCED policy
    priceWeight?: number;   // For BALANCED policy
}

export class PriceSelectorError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'PriceSelectorError';
    }
}

export class PriceSelector {
    /**
     * Ranks a list of offers based on the provided policy and constraints.
     * Enforces strictly: price <= maxPrice.
     * Throws on any ambiguity, missing data, or if no offers remain.
     */
    static rank(offers: Offer[], options: SelectorOptions): Offer[] {
        // 1. Validation
        if (!offers || !Array.isArray(offers) || offers.length === 0) {
            throw new PriceSelectorError("Input offers list is empty or invalid.");
        }
        if (options.maxPrice <= 0) {
            throw new PriceSelectorError("maxPrice must be positive.");
        }

        // 2. Filtering (Hard Constraint: maxPrice)
        const validOffers = offers.filter(o => {
            if (o.price === undefined || o.price === null) {
                throw new PriceSelectorError(`Offer ${o.id} is missing price.`);
            }
            return o.price <= options.maxPrice;
        });

        if (validOffers.length === 0) {
            throw new PriceSelectorError(`No offers available under maxPrice ($${options.maxPrice}).`);
        }

        // 3. Ranking based on Policy
        switch (options.policy) {
            case PricePolicy.CHEAPEST:
                return this.rankByCheapest(validOffers);

            case PricePolicy.BALANCED:
                const qWeight = options.qualityWeight ?? 0.5;
                const pWeight = options.priceWeight ?? 0.5;
                return this.rankByBalanced(validOffers, qWeight, pWeight);

            case PricePolicy.BEST_QUALITY:
                return this.rankByQuality(validOffers);

            default:
                throw new PriceSelectorError(`Unknown policy: ${options.policy}`);
        }
    }

    private static rankByCheapest(offers: Offer[]): Offer[] {
        // Sort ascending by price
        return offers.sort((a, b) => a.price - b.price);
    }

    private static rankByQuality(offers: Offer[]): Offer[] {
        // Sort descending by quality
        return offers.sort((a, b) => (b.quality ?? 0) - (a.quality ?? 0));
    }

    private static rankByBalanced(offers: Offer[], qWeight: number, pWeight: number): Offer[] {
        // Normalize prices for scoring (lower is better for price)
        // We invert price score: (1 - normalized_price)
        // This is a simple implementation: 
        // Score = (qWeight * quality) - (pWeight * price)
        // Higher score wins.

        return offers.sort((a, b) => {
            const scoreA = (qWeight * (a.quality ?? 0)) - (pWeight * a.price);
            const scoreB = (qWeight * (b.quality ?? 0)) - (pWeight * b.price);
            return scoreB - scoreA;
        });
    }
}
