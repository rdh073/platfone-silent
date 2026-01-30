import { LifecycleState, SmsStatus } from './state_machine';

/**
 * Represents a single Service available for activation.
 */
export interface Service {
    id: string;
    name: string;
    altName?: string;
    hasDescription: boolean;
    hasWarning: boolean;
    prohibited: boolean;
}

/**
 * Represents a Country where numbers can be leased.
 */
export interface Country {
    id: string;
    name: string;
    altName?: string;
    codes: string[];
}

/**
 * Financial pricing data for a specific service/country pair.
 */
export interface PriceData {
    min: number;        // USD Cents
    max: number;        // USD Cents
    suggested: number;  // USD Cents
}

/**
 * Availability data for a service in a country.
 */
export interface Availability {
    price: PriceData;
    count: number;
    quality?: {
        avg: number;
    };
}

/**
 * The core Domain Entity representing a Phone Number Activation.
 * Extends the basic state with business and technical metadata.
 */
export interface Activation {
    id: string;             // Remote activation_id
    externalId?: string;    // Local correlation ID / order_id
    phone: string;          // E.164 formatted number
    serviceId: string;
    countryId: string;

    // State Machine Properties
    state: LifecycleState;
    smsStatus: SmsStatus;

    // Financial Properties
    price: number;          // Consumed/reserved price in USD Cents
    maxPrice: number;       // User-defined ceiling

    // SMS Data (Null until smsReceived)
    smsCode: string | null;
    smsText: string | null;

    // Temporal Properties (Unix timestamps)
    createdAt: number;
    updatedAt: number;
    expiresAt: number;

    // Metada
    isRetriable: boolean;
}

/**
 * Catalog root structure.
 */
export interface Catalog {
    services: Service[];
    countries: Country[];
}
