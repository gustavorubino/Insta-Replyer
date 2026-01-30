
import { db } from "../server/db";
import { mediaLibrary, interactionDialect, manualQA } from "../shared/schema";

async function seedData() {
    console.log("🌱 Semeando dados de teste para UX Review...");

    // 1. Criar um Post com Imagem e Vision AI
    console.log("📸 Criando post com Vision AI...");
    const [visionPost] = await db.insert(mediaLibrary).values({
        userId: "test-user-1",
        instagramMediaId: "test_media_01",
        mediaType: "IMAGE",
        mediaUrl: "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=800", // Dog image
        thumbnailUrl: "https://images.unsplash.com/photo-1517849845537-4d257902454a?w=400",
        caption: "Dia de parque com o Rex! 🐕🌳 #natureza #pet",
        imageDescription: "A imagem mostra um cachorro da raça Bulldog Francês correndo alegremente em um gramado verde sob a luz do sol. O cão tem pelagem clara e parece estar brincando.",
        postedAt: new Date(),
        syncedAt: new Date()
    }).returning();

    // 2. Criar uma Thread Complexa nesse post
    console.log("💬 Criando Thread de discussão...");

    // Comentário do Usuário (Raiz)
    await db.insert(interactionDialect).values({
        userId: "test-user-1",
        mediaId: visionPost.id,
        channelType: "public_comment",
        senderName: "Maria Silva",
        senderUsername: "mariasilva.oficial",
        userMessage: "Que lindo! Onde fica esse parque? 😍",
        myResponse: "Oi Maria! Fica no Ibirapuera, perto do portão 7! 😉",
        instagramCommentId: "comment_01",
        interactedAt: new Date(Date.now() - 3600000) // 1h atrás
    });

    // Outro comentário sem resposta
    await db.insert(interactionDialect).values({
        userId: "test-user-1",
        mediaId: visionPost.id,
        channelType: "public_comment",
        senderName: "João Paulo",
        senderUsername: "joao_paulo99",
        userMessage: "O Rex tá enorme! Passa a dieta dele haha",
        myResponse: null, // Sem resposta ainda
        instagramCommentId: "comment_02",
        interactedAt: new Date(Date.now() - 1800000) // 30min atrás
    });

    // 3. Criar Correção de Ouro (Manual QA)
    console.log("🏆 Criando Golden Corrections...");
    await db.insert(manualQA).values({
        userId: "test-user-1",
        question: "Qual o horário de funcionamento?",
        answer: "Funcionamos de segunda a sexta, das 9h às 18h! 🚀",
        source: "approval_queue",
        createdAt: new Date()
    });

    console.log("✅ Dados de teste inseridos com sucesso!");
    process.exit(0);
}

seedData().catch(console.error);
