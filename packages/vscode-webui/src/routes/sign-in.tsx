import { buttonVariants } from "@/components/ui/button";
import { useUserStorage } from "@/lib/hooks/use-user-storage";
import { cn } from "@/lib/utils";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { LogInIcon, TerminalIcon } from "lucide-react";
import { useEffect } from "react";
import { z } from "zod";

const searchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/sign-in")({
  validateSearch: (search) => searchSchema.parse(search),
  component: SignInPage,
});

function SignInPage() {
  const { navigate } = useRouter();
  const { redirect } = Route.useSearch();
  const { users } = useUserStorage();

  useEffect(() => {
    if (users?.pochi) {
      const redirectPath = redirect || "/";
      navigate({ to: redirectPath, replace: true });
    }
  }, [users, navigate, redirect]);

  return (
    <div className="flex h-screen select-none flex-col items-center justify-center p-5 text-center text-gray-600 dark:text-gray-300">
      <h2 className="mb-2 flex items-center gap-3 font-semibold text-2xl text-gray-800 dark:text-gray-100">
        <TerminalIcon className="animate-[spin_6s_linear_infinite]" />
        Welcome to Pochi
      </h2>
      <p className="mb-4 leading-relaxed">
        To use Pochi, you need to sign in with your account.
        <br />
        This allows Pochi to securely access your information and provide
        personalized assistance.
      </p>
      <a
        className={cn(buttonVariants({ variant: "ghost" }), "mb-4")}
        href="command:pochi.openLoginPage"
        target="_blank"
        rel="noopener noreferrer"
      >
        <LogInIcon className="mr-2 size-4" /> Sign In
      </a>

      <div className="absolute bottom-6">
        <a
          className="text-muted-foreground text-sm underline-offset-4 transition-colors hover:text-foreground hover:underline"
          href="https://docs.getpochi.com"
          target="_blank"
          rel="noopener noreferrer"
        >
          Need help? View documentation
        </a>
      </div>
    </div>
  );
}
