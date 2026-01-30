import express from 'express';
import bodyParser from 'body-parser';
import * as dotenv from 'dotenv';
import { WebhookHandler } from './application/webhook_handler';
import { InMemoryActivationRepository } from './infrastructure/in_memory_repository';

// 1. Load Config Early
dotenv.config();

const app = express();
const portStr = process.env.PLATFONE_WEBHOOK_PORT;

// 2. Fail-Fast Validation
if (!portStr) {
    console.error(`❌ STARTUP FATAL: PLATFONE_WEBHOOK_PORT is missing.`);
    process.exit(1);
}

const PORT = parseInt(portStr, 10);

if (isNaN(PORT) || PORT < 1024 || PORT > 65535) {
    console.error(`❌ STARTUP FATAL: PLATFONE_WEBHOOK_PORT must be integer between 1024-65535. Found: '${portStr}'`);
    process.exit(1);
}

// Infrastructure Wiring
const repository = new InMemoryActivationRepository();
const handler = new WebhookHandler(repository);

app.use(bodyParser.json());

app.post('/webhook', async (req, res) => {
    const { event_type } = req.body;
    console.log(`📨 [Webhook Server] Event: ${event_type}`);
    // console.log('📦 Payload:', JSON.stringify(req.body, null, 2)); // Audit log disabled for brevity

    try {
        // Adapt Express request to WebhookPayload
        const result = await handler.handle(req.body);

        console.log('✅ [Webhook Server] Processed:', result);
        res.status(200).json(result);
    } catch (error: any) {
        console.error('❌ [Webhook Server] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`
🚀 Webhook Server listening on http://localhost:${PORT} [CANONICAL PORT]
👉 Send POST requests to /webhook
    `);
});
