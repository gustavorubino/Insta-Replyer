
// Script para simular um webhook localmente
const crypto = require('crypto');

// Configuração
const PORT = 5000; // Porta interna do Replit
const PATH = '/api/webhooks/instagram';
const SECRET = process.env.INSTAGRAM_APP_SECRET || 'teste_secret'; // Fallback se não tiver env

const payload = {
  object: 'instagram',
  entry: [
    {
      id: '25941877765449078', // Conta do Gustavo
      time: Date.now(),
      messaging: [
        {
          sender: { id: '123456789' }, // Sender Falso
          recipient: { id: '25941877765449078' }, // Recipient (Gustavo)
          timestamp: Date.now(),
          message: {
            mid: 'm_fake_message_id_123',
            text: 'TESTE SIMULACAO WEBHOOK'
          }
        }
      ]
    }
  ]
};

const body = JSON.stringify(payload);

// Gerar assinatura X-Hub-Signature-256
// (O código do servidor espera isso para não rejeitar)
// Nota: Se o servidor não tiver a env INSTAGRAM_APP_SECRET carregada corretamente, 
// a validação vai falhar de qualquer jeito, o que também é um diagnóstico útil.
const signature = crypto.createHmac('sha256', SECRET).update(body).digest('hex');

console.log(`Enviando webhook simulado para http://localhost:${PORT}${PATH}`);
console.log(`X-Hub-Signature-256: sha256=${signature}`);

fetch(`http://localhost:${PORT}${PATH}`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-hub-signature-256': `sha256=${signature}`
  },
  body: body
})
.then(async res => {
  console.log(`Status Code: ${res.status}`);
  const text = await res.text();
  console.log(`Response: ${text}`);
})
.catch(err => {
  console.error("Erro na requisição:", err);
});
