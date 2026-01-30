import { PlatfoneClient, RateLimitError, PriceConflictError, PlatfoneApiError } from '../../src/api/platfone_client';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';

describe('PlatfoneClient', () => {
    let mock: MockAdapter;
    let client: PlatfoneClient;
    const apiKey = 'test-key';
    const baseUrl = 'https://api.test';

    beforeEach(() => {
        mock = new MockAdapter(axios);
        client = new PlatfoneClient(apiKey, baseUrl);
    });

    afterEach(() => {
        mock.restore();
    });

    test('requestActivation: sends correct headers and params', async () => {
        mock.onPost('/activation/new').reply(config => {
            expect(config.headers?.['X-Api-Key']).toBe(apiKey);
            const params = JSON.parse(config.data);
            expect(params.order_id).toBe('order-123');
            return [200, { activation_id: 'act-1', phone: '123456', activation_status: 'active' }];
        });

        const result = await client.requestActivation({
            service_id: 'wa',
            country_id: 'uk',
            max_price: 100,
            order_id: 'order-123'
        });

        expect(result.id).toBe('act-1');
    });

    test('Error Mapping: Handles 429 Rate Limit', async () => {
        mock.onGet('/user/balance').reply(429, { message: 'Too many requests' }, { 'retry-after': '60' });

        await expect(client.getBalance()).rejects.toThrow(RateLimitError);
        try {
            await client.getBalance();
        } catch (e: any) {
            expect(e.retryAfter).toBe(60);
        }
    });

    test('Error Mapping: Handles 409 Price Conflict', async () => {
        mock.onPost('/activation/new').reply(409, { suggestedPrice: 150 });

        await expect(client.requestActivation({
            service_id: 'wa',
            country_id: 'uk',
            max_price: 100,
            order_id: 'order-123'
        })).rejects.toThrow(PriceConflictError);
    });

    test('Error Mapping: Handles generic API error', async () => {
        mock.onGet('/user/balance').reply(403, { message: 'Forbidden' });

        await expect(client.getBalance()).rejects.toThrow(PlatfoneApiError);
    });
});
