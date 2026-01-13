import { Link } from "wouter";
import { AlertCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">Página não encontrada</h1>
      <p className="text-muted-foreground mb-6 max-w-md">
        A página que você está procurando não existe ou foi movida.
      </p>
      <Button asChild data-testid="button-go-home">
        <Link href="/">
          <Home className="h-4 w-4 mr-2" />
          Voltar ao Dashboard
        </Link>
      </Button>
    </div>
  );
}
