import { PriceSelector, PricePolicy, Offer } from '../../src/domain/price_selector';

describe('PriceSelector', () => {
    const baseOffers: Offer[] = [
        { id: 'A', price: 0.5, quality: 0.8 },
        { id: 'B', price: 0.3, quality: 0.5 },
        { id: 'C', price: 1.2, quality: 0.9 }, // Expensive
        { id: 'D', price: 0.3, quality: 0.6 }, // Same price as B, better quality
    ];

    describe('Constraints & Invariants', () => {
        test('FAIL: Empty input', () => {
            expect(() => PriceSelector.rank([], { policy: PricePolicy.CHEAPEST, maxPrice: 1.0 }))
                .toThrow(/empty or invalid/);
        });

        test('FAIL: Invalid maxPrice', () => {
            expect(() => PriceSelector.rank(baseOffers, { policy: PricePolicy.CHEAPEST, maxPrice: 0 }))
                .toThrow(/maxPrice must be positive/);
        });

        test('FAIL: No offers under maxPrice', () => {
            expect(() => PriceSelector.rank(baseOffers, { policy: PricePolicy.CHEAPEST, maxPrice: 0.2 }))
                .toThrow(/No offers available/);
        });

        test('FAIL: Missing price in offer', () => {
            const badOffers = [{ id: 'X', price: undefined as any, quality: 0.5 }];
            expect(() => PriceSelector.rank(badOffers, { policy: PricePolicy.CHEAPEST, maxPrice: 1.0 }))
                .toThrow(/missing price/);
        });

        test('FILTER: Excludes offers > maxPrice', () => {
            const ranked = PriceSelector.rank(baseOffers, { policy: PricePolicy.CHEAPEST, maxPrice: 1.0 });
            expect(ranked.find(o => o.id === 'C')).toBeUndefined();
        });
    });

    describe('Policy: CHEAPEST', () => {
        test('sorts strictly by price ascending', () => {
            const ranked = PriceSelector.rank(baseOffers, { policy: PricePolicy.CHEAPEST, maxPrice: 1.0 });
            // Expected: B (0.3), D (0.3), A (0.5). Stability not strictly guaranteed by standard sort but D should be near B.
            expect(ranked[0].price).toBe(0.3);
            expect(ranked[1].price).toBe(0.3);
            expect(ranked[2].id).toBe('A');
        });
    });

    describe('Policy: BEST_QUALITY', () => {
        test('sorts strictly by quality descending', () => {
            const ranked = PriceSelector.rank(baseOffers, { policy: PricePolicy.BEST_QUALITY, maxPrice: 2.0 });
            // Expected: C (0.9), A (0.8), D (0.6), B (0.5)
            expect(ranked[0].id).toBe('C');
            expect(ranked[1].id).toBe('A');
            expect(ranked[2].id).toBe('D');
            expect(ranked[3].id).toBe('B');
        });

        test('still adheres to maxPrice', () => {
            const ranked = PriceSelector.rank(baseOffers, { policy: PricePolicy.BEST_QUALITY, maxPrice: 1.0 });
            // C rejected. Next best is A.
            expect(ranked[0].id).toBe('A');
        });
    });

    describe('Policy: BALANCED', () => {
        test('balances price and quality (High Quality Weight)', () => {
            // High quality weight: A (0.8q, 0.5p) vs B (0.5q, 0.3p)
            // Score = Q - P
            // A: 0.8 - 0.5 = 0.3
            // B: 0.5 - 0.3 = 0.2
            // Winner: A
            const ranked = PriceSelector.rank(baseOffers, {
                policy: PricePolicy.BALANCED,
                maxPrice: 1.0,
                qualityWeight: 1,
                priceWeight: 1
            });
            expect(ranked[0].id).toBe('A');
        });

        test('balances price and quality (High Price Penalty)', () => {
            // High price penalty: P weight = 2
            // A: 0.8 - 1.0 = -0.2
            // B: 0.5 - 0.6 = -0.1
            // D: 0.6 - 0.6 = 0.0
            // Winner: D (Highest score)
            const ranked = PriceSelector.rank(baseOffers, {
                policy: PricePolicy.BALANCED,
                maxPrice: 1.0,
                qualityWeight: 1,
                priceWeight: 2
            });
            expect(ranked[0].id).toBe('D');
            expect(ranked[0].price).toBe(0.3);
            expect(ranked[1].id).toBe('B'); // Runner up
        });
    });
});
