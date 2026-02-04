
import fetch from 'node-fetch';
import crypto from 'crypto';

const WEBHOOK_URL = 'http://localhost:5000/api/webhooks/instagram';
const VERIFY_TOKEN = 'instagram_webhook_verify_2025'; // From server code
const APP_SECRET = process.env.INSTAGRAM_APP_SECRET || 'test_secret'; // Needs to match server if checking signature

// Payload replicating the "Hypothesis 1" structure (Graph API DM)
const payload = {
    object: 'instagram',
    entry: [
        {
            id: '51200739', // The ID we know is in the DB (from SESSION_STATE)
            time: Math.floor(Date.now() / 1000),
            changes: [
                {
                    field: 'messages', // The problematic field
                    value: {
                        from: {
                            id: '999999999',
                            username: 'sender_test'
                        },
                        id: 'mid_simulkation_' + Date.now(),
                        text: 'Teste de Simulação Graph API',
                        timestamp: Date.now()
                    }
                }
            ]
        }
    ]
};

const payloadString = JSON.stringify(payload);

// Calculate signature
const signature = crypto
    .createHmac('sha256', APP_SECRET)
    .update(payloadString)
    .digest('hex');

console.log(`Sending webhook to ${WEBHOOK_URL}...`);
console.log(`Payload:`, JSON.stringify(payload, null, 2));

fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-hub-signature-256': `sha256=${signature}`
    },
    body: payloadString
})
    .then(async res => {
        console.log(`Status: ${res.status} ${res.statusText}`);
        const text = await res.text();
        console.log(`Response: ${text}`);
    })
    .catch(err => {
        console.error('Error:', err);
    });
