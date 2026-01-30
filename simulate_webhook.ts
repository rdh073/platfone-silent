import axios from 'axios';

async function simulateWebhook() {
    const webhookUrl = 'http://localhost:3000/webhook';

    const mockPayload = {
        "id": "mock_event_123",
        "api_version": "1.0",
        "type": "activation.updated",
        "data": {
            "activation_id": "63f4d0dab040a865d80da08a",
            "phone": "447975777666",
            "country_id": "uk",
            "service_id": "whatsapp",
            "sms_status": "smsReceived",
            "activation_status": "active",
            "billing_status": "billed",
            "sms_code": "123456",
            "sms_text": "Your WhatsApp code is 123-456",
            "price": 90,
            "created_at": Math.floor(Date.now() / 1000)
        }
    };

    console.log("📤 Sending mock webhook request...");
    try {
        const response = await axios.post(webhookUrl, mockPayload);
        console.log("Response:", response.status, response.data);
    } catch (error: any) {
        console.error("Error sending webhook:", error.message);
    }
}

simulateWebhook();
