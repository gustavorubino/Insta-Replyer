import { Link } from "wouter";
import { AlertCircle, Home } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/i18n";

export default function NotFound() {
  const { t } = useLanguage();
  
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 mb-4">
        <AlertCircle className="h-8 w-8 text-destructive" />
      </div>
      <h1 className="text-2xl font-semibold mb-2">{t.notFound.title}</h1>
      <p className="text-muted-foreground mb-6 max-w-md">
        {t.notFound.description}
      </p>
      <Button asChild data-testid="button-go-home">
        <Link href="/">
          <Home className="h-4 w-4 mr-2" />
          {t.notFound.goHome}
        </Link>
      </Button>
    </div>
  );
}
