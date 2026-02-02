
const fs = require('fs');

const content = fs.readFileSync('server/routes/index.ts', 'utf8');
const lines = content.split('\n');

let balance = 0;
let tryStartLine = -1;

// Procurar onde começa o try do processWebhookMessage
for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    if (line.includes('async function processWebhookMessage')) {
        console.log(`Função encontrada na linha ${i + 1}`);
    }
    
    if (line.includes('try {') && i > 3400) { // Aproximado
        if (tryStartLine === -1) {
            tryStartLine = i + 1;
            console.log(`TRY iniciado na linha ${tryStartLine}`);
            balance = 1; // Já contamos o { do try
            continue; // Pular para próxima linha para não contar duas vezes se tiver mais coisas
        }
    }

    if (tryStartLine !== -1) {
        // Contar chaves
        for (const char of line) {
            if (char === '{') balance++;
            if (char === '}') balance--;
        }

        if (balance === 0) {
            console.log(`TRY fechado na linha ${i + 1}: ${line.trim()}`);
            
            // Verificar se é o catch esperado
            const nextLine = lines[i+1] || "";
            if (!line.includes('catch') && !nextLine.includes('catch')) {
                console.log("ALERTA: Try fechou antes do catch!");
            } else {
                console.log("Parece OK (encontrou catch ou fechou no catch)");
            }
            break; 
        }
    }
}
