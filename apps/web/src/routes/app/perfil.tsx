import { createFileRoute } from "@tanstack/react-router";
import { SignOut } from "@phosphor-icons/react";
import { Avatar } from "../../components/ui/avatar";
import { Button } from "../../components/ui/button";
import { PasswordCard, SessionsCard, ThemeCard } from "../../components/account-settings";
import { useLogout, useMe } from "../../lib/auth";

export const Route = createFileRoute("/app/perfil")({
  component: Profile,
});

function Profile() {
  const me = useMe()!;
  const logout = useLogout();
  return (
    <>
      <div className="mb-8 flex items-center gap-4">
        <Avatar name={me.name} size={60} />
        <div>
          <h1 className="font-display text-[36px] leading-tight">{me.name}</h1>
          <p className="text-sm text-ink-2">
            {me.email} · {me.studio.name}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-6">
        <ThemeCard />
        <PasswordCard />
        <SessionsCard />
        <Button variant="secondary" icon={<SignOut size={17} />} onClick={logout} className="self-start">
          Cerrar sesión
        </Button>
      </div>
    </>
  );
}
