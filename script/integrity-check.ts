
import { build } from "esbuild";
import { readFile } from "fs/promises";
import { resolve } from "path";

console.log("🛡️  Iniciando Verificação de Integridade e Segurança...");

// Check environment variables based on NODE_ENV
function checkEnvironmentVariables(): boolean {
    const isProduction = process.env.NODE_ENV === "production";
    console.log(`ENV... Verificando variáveis (${isProduction ? "PRODUCTION" : "DEVELOPMENT"})...`);

    if (isProduction) {
        if (!process.env.PROD_DB_URL) {
            console.error("❌ ERRO: PROD_DB_URL é OBRIGATÓRIO em produção.");
            return false;
        }
        console.log("✅ PROD_DB_URL: Configurado.");
    } else {
        const hasDbUrl = process.env.PROD_DB_URL || process.env.DATABASE_URL;
        if (!hasDbUrl) {
            console.error("❌ ERRO: DATABASE_URL ou PROD_DB_URL deve estar configurado.");
            return false;
        }
        console.log("✅ Database URL: Configurado (dev mode).");
    }
    return true;
}

async function checkDatabase() {
    console.log("POSTGRES... Verificando conexão...");
    try {
        // Dynamic import to avoid loading DB before ENV check
        const { db } = await import("../server/db");
        const { sql } = await import("drizzle-orm");
        await db.execute(sql`SELECT 1`);
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
    "nodemailer", "passport", "passport-local", "pg", "stripe", "uuid",
    "ws", "xlsx", "zod", "zod-validation-error",
];

// Force exclusion of development files that break CJS build
const forceExternal = ["./vite", "../vite.config", "../../vite.config"];

async function checkBuild() {
    console.log("BUILD... Simulando compilação do servidor...");
    try {
        const pkg = JSON.parse(await readFile("package.json", "utf-8"));
        const allDeps = [
            ...Object.keys(pkg.dependencies || {}),
            ...Object.keys(pkg.devDependencies || {}),
        ];
        // Tudo que não está na allowlist é externo
        const externals = allDeps.filter((dep) => !allowlist.includes(dep));

        // Adiciona exclusões manuais
        const finalExternals = [...externals, ...forceExternal];

        // Simula o build do esbuild para o server
        await build({
            entryPoints: ["server/index.ts"],
            platform: "node",
            bundle: true,
            format: "cjs",
            outfile: "dist/test-build.cjs", // Temporário
            external: finalExternals,
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
    // Check ENV first - exit early if failed (before trying to connect to DB)
    const envOk = checkEnvironmentVariables();
    if (!envOk) {
        console.error("\n💀 FALHA NA VERIFICAÇÃO DE AMBIENTE. NÃO PROSSEGUIR.");
        process.exit(1);
    }

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
