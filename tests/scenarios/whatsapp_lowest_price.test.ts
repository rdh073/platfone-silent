import { PriceSelector, PricePolicy } from '../../src/domain/price_selector';
import { Availability } from '../../src/domain/models';

describe('Scenario: WhatsApp Lowest Price Selection', () => {
    // Mock Data simulating API response for 'getPrices("wa")'
    const waOffers: Availability[] = [
        {
            country: 'US', // Expensive
            price: { min: 5.00, max: 6.00, suggested: 5.50 },
            quality: { avg: 0.9 },
            count: 100
        },
        {
            country: 'ID', // Cheapest!
            price: { min: 0.15, max: 0.20, suggested: 0.18 },
            quality: { avg: 0.7 },
            count: 500
        },
        {
            country: 'RU', // Middle
            price: { min: 2.00, max: 2.50, suggested: 2.25 },
            quality: { avg: 0.5 },
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
            id: avail.country,
            price: avail.price.min,
            quality: avail.quality?.avg || 0.5
        }));

        const ranked = PriceSelector.rank(offers, {
            policy: myPolicy,
            maxPrice: maxBudget
        });

        const bestOption = ranked[0]!;

        // 3. Assert: Verify the decision
        expect(bestOption).toBeDefined();
        expect(bestOption.id).toBe('ID'); // Expecting Indonesia
        expect(bestOption.price).toBe(0.15);

        // Ensure others are ranked correctly (ascending price)
        expect(ranked[1]!.id).toBe('RU'); // 2.00
        expect(ranked[2]!.id).toBe('US'); // 5.00
    });

    test('should fail if all offers exceed budget', () => {
        const tightBudget = 0.10; // Lower than cheapest (0.15)

        const offers = waOffers.map(avail => ({
            id: avail.country,
            price: avail.price.min,
            quality: avail.quality?.avg || 0.5
        }));

        expect(() => {
            PriceSelector.rank(offers, {
                policy: PricePolicy.CHEAPEST,
                maxPrice: tightBudget
            });
        }).toThrow(/No offers available/);
    });
});
