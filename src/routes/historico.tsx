import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/historico")({
  beforeLoad: () => {
    throw redirect({ to: "/central" });
  },
});
