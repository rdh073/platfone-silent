import { PriceSelector, PricePolicy } from '../../src/domain/price_selector';
import { Availability } from '../../src/domain/models';

describe('Scenario: Strategic Policy Selection', () => {
    // Strategic Data Set designed to have distinct winners for each policy
    const marketOffers: Availability[] = [
        {
            service_id: 'wa',
            country_id: 'CHEAP',
            price: 0.10,
            quality: 0.20, // Low reliability
            count: 100
        },
        {
            service_id: 'wa',
            country_id: 'MIDDLE',
            price: 0.50,
            quality: 0.70, // Good reliability for price
            count: 50
        },
        {
            service_id: 'wa',
            country_id: 'EXPENSIVE',
            price: 1.00,
            quality: 0.95, // Excelent reliability
            count: 20
        }
    ];

    const offers = marketOffers.map(avail => ({
        id: avail.country_id,
        price: avail.price,
        quality: avail.quality
    }));

    test('Policy: CHEAPEST should select the lowest price (ignoring quality)', () => {
        const ranked = PriceSelector.rank(offers, {
            policy: PricePolicy.CHEAPEST,
            maxPrice: 2.00
        });

        expect(ranked[0].id).toBe('CHEAP');
        expect(ranked[0].price).toBe(0.10);
    });

    test('Policy: BEST_QUALITY should select the expensive/reliable option', () => {
        const ranked = PriceSelector.rank(offers, {
            policy: PricePolicy.BEST_QUALITY,
            maxPrice: 2.00
        });

        expect(ranked[0].id).toBe('EXPENSIVE');
        expect(ranked[0].quality).toBe(0.95);
    });

    test('Policy: BALANCED should select the middle ground', () => {
        // Balanced formula: Score = (Q_Weight * Q) - (P_Weight * P)
        // CHEAP:     (0.5 * 0.2) - (0.5 * 0.1) = 0.10 - 0.05 =  0.05
        // MIDDLE:    (0.5 * 0.7) - (0.5 * 0.5) = 0.35 - 0.25 =  0.10  <-- WINNER
        // EXPENSIVE: (0.5 * 0.95) - (0.5 * 1.0) = 0.475 - 0.5 = -0.025

        const ranked = PriceSelector.rank(offers, {
            policy: PricePolicy.BALANCED,
            maxPrice: 2.00,
            qualityWeight: 0.5,
            priceWeight: 0.5
        });

        expect(ranked[0].id).toBe('MIDDLE');
    });
});
