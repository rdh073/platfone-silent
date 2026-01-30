import axios, { AxiosInstance, AxiosError } from 'axios';
import { Service, Country, Availability, Activation } from '../domain/models';

export class PlatfoneApiError extends Error {
    constructor(
        message: string,
        public readonly statusCode: number,
        public readonly data?: any
    ) {
        super(message);
        this.name = 'PlatfoneApiError';
    }
}

export class RateLimitError extends PlatfoneApiError {
    constructor(public readonly retryAfter?: number) {
        super('Rate limit exceeded', 429);
        this.name = 'RateLimitError';
    }
}

export class PriceConflictError extends PlatfoneApiError {
    constructor(public readonly suggestedPrice: number, data: any) {
        super('Market price exceeded max_price', 409, data);
        this.name = 'PriceConflictError';
    }
}

export class PlatfoneClient {
    private client: AxiosInstance;

    constructor(apiKey: string, baseUrl: string) {
        this.client = axios.create({
            baseURL: baseUrl,
            headers: {
                'X-Api-Key': apiKey,
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        });

        this.setupInterceptors();
    }

    private setupInterceptors() {
        this.client.interceptors.response.use(
            (response) => response,
            (error: AxiosError) => {
                if (error.response) {
                    const status = error.response.status;
                    const data = error.response.data as any;

                    if (status === 429) {
                        const retryAfter = error.response.headers['retry-after'];
                        throw new RateLimitError(retryAfter ? parseInt(retryAfter, 10) : undefined);
                    }

                    if (status === 409 && data.suggestedPrice) {
                        throw new PriceConflictError(data.suggestedPrice, data);
                    }

                    throw new PlatfoneApiError(
                        data.message || `API Error: ${status}`,
                        status,
                        data
                    );
                }
                throw error;
            }
        );
    }

    /**
     * Catalog Endpoints
     */
    async getServices(): Promise<Service[]> {
        const response = await this.client.get('/activation/services');
        return response.data;
    }

    async getCountries(): Promise<Country[]> {
        const response = await this.client.get('/activation/countries');
        return response.data;
    }

    async getPrices(serviceId: string): Promise<Availability[]> {
        const response = await this.client.get(`/activation/prices/services`, {
            params: { service_id: serviceId },
        });
        return response.data;
    }

    /**
     * Activation Lifecycle
     */
    async requestActivation(params: {
        service_id: string;
        country_id?: string;
        max_price: number;
        order_id: string; // INV-04: Mandating client_request_id (order_id)
        quality_factor?: number;
    }): Promise<Activation> {
        const response = await this.client.post('/activation/new', params);
        return this.mapActivationResponse(response.data);
    }

    async getActivation(id: string): Promise<Activation> {
        const response = await this.client.get(`/activation/${id}`);
        return this.mapActivationResponse(response.data);
    }

    async cancelActivation(id: string): Promise<void> {
        await this.client.post(`/activation/${id}/cancel`);
    }

    async finalizeActivation(id: string): Promise<void> {
        await this.client.post(`/activation/${id}/finalize`);
    }

    async getBalance(): Promise<{ total: number; reserved: number }> {
        const response = await this.client.get('/user/balance');
        return response.data;
    }

    /**
     * Mapping logic to convert remote payload to local Domain Model
     */
    private mapActivationResponse(data: any): Activation {
        return {
            id: data.activation_id,
            externalId: data.order_id,
            phone: data.phone,
            serviceId: data.service_id,
            countryId: data.country_id,
            state: data.activation_status,
            smsStatus: data.sms_status,
            price: data.price,
            maxPrice: data.max_price || 0,
            smsCode: data.sms_code,
            smsText: data.sms_text,
            createdAt: data.created_at,
            updatedAt: data.updated_at,
            expiresAt: data.expire_at,
            isRetriable: data.is_retriable,
        };
    }
}
