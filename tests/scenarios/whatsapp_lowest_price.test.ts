import { PriceSelector, PricePolicy } from '../../src/domain/price_selector';
import { Availability } from '../../src/domain/models';

describe('Scenario: WhatsApp Lowest Price Selection', () => {
    // Mock Data simulating API response for 'getPrices("wa")'
    const waOffers: Availability[] = [
        {
            service_id: 'wa',
            country_id: 'US', // Expensive
            price: 5.00,
            quality: 0.9,
            count: 100
        },
        {
            service_id: 'wa',
            country_id: 'ID', // Cheapest!
            price: 0.15,
            quality: 0.7,
            count: 500
        },
        {
            service_id: 'wa',
            country_id: 'RU', // Middle
            price: 2.00,
            quality: 0.5,
            count: 20
        }
    ];

    test('should select ID (Indonesia) as the lowest price for WhatsApp', () => {
        // 1. Arrange: User Configuration
        const myPolicy = PricePolicy.CHEAPEST;
        const maxBudget = 10.00;

        // 2. Act: Run the Selector Logic
        // Map API Availability[] to Domain Offer[]
        const offers = waOffers.map(avail => ({
            id: avail.country_id,
            price: avail.price,
            quality: avail.quality
        }));

        const ranked = PriceSelector.rank(offers, {
            policy: myPolicy,
            maxPrice: maxBudget
        });

        const bestOption = ranked[0];

        // 3. Assert: Verify the decision
        expect(bestOption).toBeDefined();
        expect(bestOption.id).toBe('ID'); // Expecting Indonesia
        expect(bestOption.price).toBe(0.15);

        // Ensure others are ranked correctly (ascending price)
        expect(ranked[1].id).toBe('RU'); // 2.00
        expect(ranked[2].id).toBe('US'); // 5.00
    });

    test('should fail if all offers exceed budget', () => {
        const tightBudget = 0.10; // Lower than cheapest (0.15)

        const offers = waOffers.map(avail => ({
            id: avail.country_id,
            price: avail.price,
            quality: avail.quality
        }));

        expect(() => {
            PriceSelector.rank(offers, {
                policy: PricePolicy.CHEAPEST,
                maxPrice: tightBudget
            });
        }).toThrow(/No offers available/);
    });
});
