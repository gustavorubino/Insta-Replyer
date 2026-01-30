
import { build } from "esbuild";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

console.log("🛡️  Iniciando Verificação de Integridade e Segurança...");

async function checkDatabase() {
    console.log("POSTGRES... Verificando conexão...");
    try {
        const result = await db.execute(sql`SELECT 1`);
        console.log("✅ Banco de Dados: Conectado e Respondendo.");
        return true;
    } catch (error) {
        console.error("❌ ERRO CRÍTICO NO BANCO:", error);
        return false;
    }
}

// server deps to bundle (same as build.ts)
const allowlist = [
    "@google/generative-ai", "axios", "connect-pg-simple", "cors", "date-fns",
    "drizzle-orm", "drizzle-zod", "express", "express-rate-limit",
    "express-session", "jsonwebtoken", "memorystore", "multer", "nanoid",
    "nodemailer", "passport", "passport-local", "pg", "stripe", "uuid",
    "ws", "xlsx", "zod", "zod-validation-error",
];

async function checkBuild() {
    console.log("BUILD... Simulando compilação do servidor...");
    try {
        const pkg = JSON.parse(await readFile("package.json", "utf-8"));
        const allDeps = [
            ...Object.keys(pkg.dependencies || {}),
            ...Object.keys(pkg.devDependencies || {}),
        ];
        const externals = allDeps.filter((dep) => !allowlist.includes(dep));

        // Simula o build do esbuild para o server
        await build({
            entryPoints: ["server/index.ts"],
            platform: "node",
            bundle: true,
            format: "cjs",
            outfile: "dist/test-build.cjs", // Temporário
            external: externals,
            logLevel: "error", // Só mostra erros
        });
        console.log("✅ Build do Servidor: SUCESSO. Sem erros de importação.");
        return true;
    } catch (error) {
        console.error("❌ ERRO DE BUILD:", error);
        return false;
    }
}

async function run() {
    const dbOk = await checkDatabase();
    const buildOk = await checkBuild();

    if (dbOk && buildOk) {
        console.log("\n✨ SISTEMA ÍNTEGRO. PRONTO PARA USO. ✨");
        process.exit(0);
    } else {
        console.error("\n💀 FALHA NA VERIFICAÇÃO. NÃO ENTREGAR AO USUÁRIO.");
        process.exit(1);
    }
}

run().catch(console.error);
