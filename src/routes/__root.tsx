import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "@/hooks/useAuth";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <div className="mt-6">
          <Link to="/" className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "3K Sistemas" },
      { name: "description", content: "Sistema profissional para automação de cotações em licitações." },
      { name: "theme-color", content: "#1e3a6f" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "3K Sistemas" },
      { property: "og:title", content: "Gestão Pará" },
      { name: "twitter:title", content: "Gestão Pará" },
      { property: "og:description", content: "Sistema profissional para automação de cotações em licitações." },
      { name: "twitter:description", content: "Sistema profissional para automação de cotações em licitações." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/75400ae3-befb-44ac-822e-3dd66023f92d/id-preview-d81b02ba--74af575d-f9dd-499c-8ae1-724e8bc6175a.lovable.app-1776971538637.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/75400ae3-befb-44ac-822e-3dd66023f92d/id-preview-d81b02ba--74af575d-f9dd-499c-8ae1-724e8bc6175a.lovable.app-1776971538637.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/favicon.png" },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
    ],
  }),
  component: () => (
    <RootShell>
      <AuthProvider>
        <Outlet />
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </RootShell>
  ),
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {

  useEffect(() => {
    console.log("DARK EXECUTADO");
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>

      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}