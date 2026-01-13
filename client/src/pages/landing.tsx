import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import { Bot, MessageSquare, Sparkles, Shield, Zap, Clock } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-lg bg-background/80 border-b">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            <span className="font-semibold text-lg">Instagram AI</span>
          </div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <a href="/login">
              <Button data-testid="button-login">Entrar</Button>
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1 pt-16">
        <section className="py-20 md:py-32">
          <div className="container mx-auto px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div className="space-y-6">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-bold tracking-tight">
                  Respostas Inteligentes para seu Instagram
                </h1>
                <p className="text-lg text-muted-foreground max-w-lg">
                  Automatize suas respostas de DMs e comentários com inteligência artificial, 
                  mantendo o controle total com aprovação humana.
                </p>
                <div className="flex flex-wrap gap-4">
                  <a href="/login">
                    <Button size="lg" data-testid="button-get-started">
                      <Sparkles className="mr-2 h-5 w-5" />
                      Começar Agora
                    </Button>
                  </a>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1">
                    <Shield className="h-4 w-4" />
                    <span>Seguro</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Zap className="h-4 w-4" />
                    <span>Rápido</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>Economia de tempo</span>
                  </div>
                </div>
              </div>
              <div className="relative">
                <div className="aspect-[4/3] rounded-lg bg-gradient-to-br from-primary/20 via-primary/10 to-background border shadow-2xl p-6 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <MessageSquare className="h-16 w-16 mx-auto text-primary" />
                    <p className="text-lg font-medium">Dashboard Inteligente</p>
                    <p className="text-sm text-muted-foreground">
                      Gerencie mensagens, aprove respostas e veja estatísticas
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 bg-muted/30">
          <div className="container mx-auto px-4">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold mb-4">Como Funciona</h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Sistema inteligente que aprende com suas correções
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6">
              <Card className="hover-elevate">
                <CardHeader>
                  <MessageSquare className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>Receba Mensagens</CardTitle>
                  <CardDescription>
                    DMs e comentários são recebidos automaticamente do Instagram
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="hover-elevate">
                <CardHeader>
                  <Bot className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>IA Gera Respostas</CardTitle>
                  <CardDescription>
                    A inteligência artificial sugere respostas com score de confiança
                  </CardDescription>
                </CardHeader>
              </Card>
              <Card className="hover-elevate">
                <CardHeader>
                  <Sparkles className="h-10 w-10 text-primary mb-2" />
                  <CardTitle>Aprove ou Edite</CardTitle>
                  <CardDescription>
                    Revise e aprove as respostas. A IA aprende com suas correções
                  </CardDescription>
                </CardHeader>
              </Card>
            </div>
          </div>
        </section>

        <section className="py-20">
          <div className="container mx-auto px-4 text-center">
            <h2 className="text-3xl font-bold mb-4">Pronto para começar?</h2>
            <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
              Entre agora e comece a automatizar suas respostas do Instagram
            </p>
            <a href="/login">
              <Button size="lg" data-testid="button-cta-login">
                <Bot className="mr-2 h-5 w-5" />
                Entrar com sua Conta
              </Button>
            </a>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>Instagram AI Response System</p>
        </div>
      </footer>
    </div>
  );
}
