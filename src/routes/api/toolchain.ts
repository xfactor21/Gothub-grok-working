import { createFileRoute } from "@tanstack/react-router";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

export const Route = createFileRoute("/api/toolchain")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const { getInstallStatus } = await import("@/lib/xide/install-toolchain.server");
        return json(getInstallStatus());
      },
      POST: async () => {
        const { startInstall } = await import("@/lib/xide/install-toolchain.server");
        return json(startInstall());
      },
    },
  },
});
