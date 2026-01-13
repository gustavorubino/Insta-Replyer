import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Instagram, ArrowLeft, Loader2, ChevronDown, Mail } from "lucide-react";
import { SiGoogle, SiGithub, SiApple } from "react-icons/si";
import { ThemeToggle } from "@/components/theme-toggle";

const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Senha obrigatória"),
});

const registerSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
  confirmPassword: z.string().min(1, "Confirme sua senha"),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Senhas não coincidem",
  path: ["confirmPassword"],
});

type LoginFormData = z.infer<typeof loginSchema>;
type RegisterFormData = z.infer<typeof registerSchema>;

export default function Login() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [showEmailForm, setShowEmailForm] = useState(false);
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  const loginForm = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "", firstName: "", lastName: "" },
  });

  const loginMutation = useMutation({
    mutationFn: async (data: LoginFormData) => {
      const res = await apiRequest("POST", "/api/auth/login", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Email ou senha incorretos",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (data: RegisterFormData) => {
      const { confirmPassword, ...registerData } = data;
      const res = await apiRequest("POST", "/api/auth/register", registerData);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/user"] });
      navigate("/");
    },
    onError: (error: any) => {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Erro ao criar conta",
      });
    },
  });

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <a href="/" className="flex items-center gap-2 hover-elevate rounded-md p-2 -m-2">
            <ArrowLeft className="h-4 w-4" />
            <Instagram className="h-6 w-6 text-primary" />
            <span className="font-semibold">Instagram AI</span>
          </a>
          <ThemeToggle />
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">Bem-vindo</CardTitle>
              <CardDescription>
                Entre com sua conta social ou email
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <a href="/api/login" className="block">
                <Button 
                  variant="outline" 
                  className="w-full justify-start gap-3"
                  data-testid="button-login-social"
                >
                  <div className="flex items-center gap-2">
                    <SiGoogle className="h-4 w-4" />
                    <SiGithub className="h-4 w-4" />
                    <SiApple className="h-4 w-4" />
                  </div>
                  <span>Continuar com Google, GitHub ou Apple</span>
                </Button>
              </a>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">ou</span>
                </div>
              </div>

              <Collapsible open={showEmailForm} onOpenChange={setShowEmailForm}>
                <CollapsibleTrigger asChild>
                  <Button 
                    variant="ghost" 
                    className="w-full justify-between"
                    data-testid="button-toggle-email"
                  >
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4" />
                      <span>Continuar com email</span>
                    </div>
                    <ChevronDown className={`h-4 w-4 transition-transform ${showEmailForm ? "rotate-180" : ""}`} />
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-4">
                  <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "login" | "register")}>
                    <TabsList className="grid w-full grid-cols-2 mb-4">
                      <TabsTrigger value="login" data-testid="tab-login">Entrar</TabsTrigger>
                      <TabsTrigger value="register" data-testid="tab-register">Criar Conta</TabsTrigger>
                    </TabsList>

                    <TabsContent value="login">
                      <Form {...loginForm}>
                        <form onSubmit={loginForm.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
                          <FormField
                            control={loginForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input
                                    type="email"
                                    placeholder="seu@email.com"
                                    data-testid="input-email"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={loginForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Senha</FormLabel>
                                <FormControl>
                                  <Input
                                    type="password"
                                    placeholder="Sua senha"
                                    data-testid="input-password"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={loginMutation.isPending}
                            data-testid="button-submit-login"
                          >
                            {loginMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Entrar
                          </Button>
                        </form>
                      </Form>
                    </TabsContent>

                    <TabsContent value="register">
                      <Form {...registerForm}>
                        <form onSubmit={registerForm.handleSubmit((data) => registerMutation.mutate(data))} className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={registerForm.control}
                              name="firstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Nome</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="João"
                                      data-testid="input-first-name"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={registerForm.control}
                              name="lastName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>Sobrenome</FormLabel>
                                  <FormControl>
                                    <Input
                                      placeholder="Silva"
                                      data-testid="input-last-name"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <FormField
                            control={registerForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Email</FormLabel>
                                <FormControl>
                                  <Input
                                    type="email"
                                    placeholder="seu@email.com"
                                    data-testid="input-register-email"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Senha</FormLabel>
                                <FormControl>
                                  <Input
                                    type="password"
                                    placeholder="Mínimo 6 caracteres"
                                    data-testid="input-register-password"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={registerForm.control}
                            name="confirmPassword"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Confirmar Senha</FormLabel>
                                <FormControl>
                                  <Input
                                    type="password"
                                    placeholder="Confirme sua senha"
                                    data-testid="input-confirm-password"
                                    {...field}
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <Button
                            type="submit"
                            className="w-full"
                            disabled={registerMutation.isPending}
                            data-testid="button-submit-register"
                          >
                            {registerMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : null}
                            Criar Conta
                          </Button>
                        </form>
                      </Form>
                    </TabsContent>
                  </Tabs>
                </CollapsibleContent>
              </Collapsible>
            </CardContent>
          </Card>

          <p className="text-center text-sm text-muted-foreground">
            Ao continuar, você concorda com nossos Termos de Serviço e Política de Privacidade.
          </p>
        </div>
      </main>
    </div>
  );
}
