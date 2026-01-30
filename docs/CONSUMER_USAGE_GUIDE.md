# Consumer Usage Guide

**Role:** Application Developer
**Goal:** Integrate the reusable Platfone package into your application.

---

## 1. Concept: You Own The Infrastructure

This package provides **Pure Logic** and **Orchestration**.
It does **NOT** know how to talk to the database or the network.

**You must provide:**
1.  An `ActivationGateway` (to talk to the API).
2.  A `StateRepository` (to save data).

---

## 2. Installation

Install the package in your application:

```bash
npm install @platfone/core
```

_Note: `@platfone/core` is a placeholder name for this package._

---

## 3. Implement Required Ports

The package exports **Interfaces** that you must implement.

### A. The Gateway (Network Layer)
**Location:** `src/adapters/http_gateway.ts` (This is YOUR code)

```typescript
import { ActivationGateway, ActivationRequest } from '@platfone/core';
import axios from 'axios';

export class HttpActivationGateway implements ActivationGateway {
  constructor(private apiKey: string) {}

  async requestActivation(req: ActivationRequest) {
    // YOU decide which HTTP client to use
    const res = await axios.post('https://api.platfone.com/v1/activate', req, {
      headers: { Authorization: `Bearer ${this.apiKey}` }
    });
    return res.data;
  }

  async cancelActivation(id: string) {
    await axios.post(`https://api.platfone.com/v1/activate/${id}/cancel`);
  }
}
```

### B. The Repository (Persistence Layer)
**Location:** `src/adapters/memory_repo.ts` (This is YOUR code)

```typescript
import { StateRepository } from '@platfone/core';

export class InMemoryRepository implements StateRepository {
  private store = new Map();

  async save(key: string, data: any) {
    this.store.set(key, data);
  }

  async load(key: string) {
    return this.store.get(key) || null;
  }
}
```

---

## 4. Wiring The Service

Use the **Factory Function** to wire your adapters into the service.
Do this in your application's startup file (e.g., `src/main.ts`).

```typescript
import { createActivationService } from '@platfone/core';
import { HttpActivationGateway } from './adapters/http_gateway';
import { InMemoryRepository } from './adapters/memory_repo';

// 1. Instantiate Your Adapters
const gateway = new HttpActivationGateway(process.env.API_KEY);
const repo = new InMemoryRepository();

// 2. Inject into the Package Factory
const service = createActivationService({
    gateway: gateway,
    repository: repo
});

// 3. Use the Service
await service.requestNumber('whatsapp', 'us');
```

---

## 5. Running in Safe Mode (First Run)

By default, the package logic expects you to configure your adapters safely.

**Recommendation:**
1.  Start with `InMemoryRepository`.
2.  Use a `MockGateway` (stubbed responses) instead of the real HTTP gateway for initial integration testing.

```typescript
// Safe Mode Wiring
const service = createActivationService({
    gateway: new MockGateway(), // No network calls
    repository: new InMemoryRepository()
});
```

---

## 6. Common Mistakes

*   **❌ Importing `src/infra`**: The package has no `infra` folder. Do not try to find it.
*   **❌ Expecting Defaults**: `createActivationService()` throws an error if you don't provide adapters.
*   **❌ Auto-Wiring**: The package will never automatically read your `.env` file or connect to a database. You must explicitly pass those values.

---

## 7. Next Steps

*   Read **[README.md](../README.md)** for safety rules.
*   Review **[FUNDING_READINESS.md](FUNDING_READINESS.md)** before connecting a real Payment Gateway.
