import express, { Request, Response } from 'express';
import bodyParser from 'body-parser';

const app = express();
const port = 3000;

app.use(bodyParser.json());

// Main webhook endpoint
app.post('/webhook', (req: Request, res: Response) => {
    const { id, type, api_version, data } = req.body;

    console.log(`\n--- 📡 Received Webhook [${type}] ---`);
    console.log(`ID: ${id}`);
    console.log(`Version: ${api_version}`);
    console.log(`Payload:`, JSON.stringify(data, null, 2));

    // Specific handling logic
    if (type === 'activation.updated') {
        console.log(`✅ Activation ${data.activation_id} updated. SMS Status: ${data.sms_status}`);
    } else if (type === 'account.low_balance') {
        console.log(`⚠️ Low Balance Alert!`);
    }

    // Always return success as per documentation
    res.status(200).json({ result: 'success' });
});

app.listen(port, () => {
    console.log(`🚀 Webhook listener running at http://localhost:${port}/webhook`);
});
