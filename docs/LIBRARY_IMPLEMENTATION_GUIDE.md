# Reusable Package Implementation Guide

## 1. Introduction

This document defines the implementation standards for a **Reusable Package**.
This codebase is a library, not an application. It owns **Logic** and **Orchestration**. It does **NOT** own Infrastructure.

**Core Principle:**
> "We define the shape of the plug; the consumer buys the socket."

## 2. Module Structure

The package must adhere to this strict layout:

```text
src/
├── domain/       # Pure logic, types, state machines
├── ports/        # Interfaces defining required side effects
├── lib/          # Orchestration services (wiring logic to ports)
└── index.ts      # Public API contract
```

**FORBIDDEN:**
- `src/infra/` (No concrete implementations allowed)
- `src/db/`
- `src/api/`

## 3. Ports (Interfaces Only)

All interactions with the outside world must be abstracted via Interfaces in `src/ports/`.

**Example: Activation Gateway**
```typescript
// src/ports/activation_gateway.ts
import { ActivationResult } from '../domain/types';

export interface ActivationGateway {
  requestActivation(service: string, country: string): Promise<ActivationResult>;
  cancelActivation(id: string): Promise<void>;
}
```

**Example: State Persistence**
```typescript
// src/ports/state_repository.ts
export interface StateRepository {
  save(key: string, state: unknown): Promise<void>;
  load(key: string): Promise<unknown | null>;
}
```

## 4. Domain Layer

The Domain layer (`src/domain/`) must be **PURE**.
- It must **NOT** import from `src/ports/`.
- It must **NOT** perform I/O.

**Example: Pure Logic**
```typescript
// src/domain/validator.ts
import { PricePolicy } from './types';

export function isPriceValid(price: number, policy: PricePolicy): boolean {
  return price <= policy.maxPrice;
}
```

## 5. Library / Orchestration Layer

The Library layer (`src/lib/`) orchestrates Domain logic and Ports.
Dependencies are received via **Constructor Injection**.

**Example: Service Class**
```typescript
// src/lib/activation_service.ts
import { ActivationGateway } from '../ports/activation_gateway';
import { isPriceValid } from '../domain/validator';

export class ActivationService {
  constructor(private gateway: ActivationGateway) {}

  async activate(price: number): Promise<void> {
    if (!isPriceValid(price, { maxPrice: 1.0 })) {
      throw new Error("Price too high");
    }
    await this.gateway.requestActivation("sms", "us");
  }
}
```

## 6. Factory Pattern

Use Factory Functions to simplify instantiation.
Do **NOT** rely on default implementations.

**Example: Factory**
```typescript
// src/lib/factory.ts
import { ActivationService } from './activation_service';
import { ActivationGateway } from '../ports/activation_gateway';

export function createActivationService(gateway: ActivationGateway): ActivationService {
  return new ActivationService(gateway);
}
```

## 7. Public API Surface

`src/index.ts` defines the **Package Contract**.
Export only what the consumer needs to implement the ports and use the library.

**Example: src/index.ts**
```typescript
// Types & Interfaces
export type { ActivationGateway } from './ports/activation_gateway';
export type { ActivationResult } from './domain/types';

// Factory & Service
export { createActivationService } from './lib/factory';
export { ActivationService } from './lib/activation_service';
```

## 8. Consumer Usage Example

**The following code belongs in the CONSUMER APP, NOT the package.**

```typescript
// IN CONSUMER APP
import { createActivationService, ActivationGateway } from 'my-package';
import axios from 'axios';

// 1. Consumer Implements Infrastructure
class AxiosGateway implements ActivationGateway {
  async requestActivation(svc: string, country: string) {
    const res = await axios.post('/api/activate', { svc, country });
    return res.data;
  }
  async cancelActivation(id: string) { /* ... */ }
}

// 2. Consumer Wires the Service
const gateway = new AxiosGateway();
const service = createActivationService(gateway);

// 3. Consumer Uses the Service
await service.activate(0.50);
```

## 9. Anti-Patterns

The following are strict violations of the Reusable Package standard:

1.  **Concrete Infrastructure**: Referencing `pg`, `mysql`, `axios`, or `fs` inside the package.
2.  **Auto-Wiring**: Instantiating dependencies automatically without consumer input.
3.  **Default Adapters**: Providing a "default" implementation of a Port (couples package to infra).
4.  **Process Env Access**: Reading `process.env` directly in library code (Configuration must be passed as arguments).
