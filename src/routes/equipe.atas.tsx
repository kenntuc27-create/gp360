import { Outlet, createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/equipe/atas")({
  component: AtasLayout,
});

function AtasLayout() {
  return <Outlet />;
}