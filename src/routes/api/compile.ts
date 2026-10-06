import { createFileRoute } from "@tanstack/react-router";

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  "access-control-allow-headers": "content-type",
};

function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: CORS });
}

export const Route = createFileRoute("/api/compile")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      GET: async () => {
        const { describeToolchain } = await import("@/lib/xide/toolchain.server");
        return json(describeToolchain());
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => null)) as {
          projectName?: string;
          templateId?: string;
          files?: Record<string, string>;
          run?: boolean;
        } | null;
        if (!body || typeof body !== "object" || !body.files || typeof body.files !== "object") {
          return json({ error: "Expected { projectName, templateId, files, run }" }, 400);
        }
        const { compileProject } = await import("@/lib/xide/toolchain.server");
        const result = await compileProject({
          projectName: String(body.projectName ?? "app"),
          templateId: String(body.templateId ?? "empty"),
          files: Object.fromEntries(
            Object.entries(body.files)
              .slice(0, 120)
              .filter(([, v]) => typeof v === "string")
              .map(([k, v]) => [k, String(v)]),
          ),
          run: Boolean(body.run),
        });
        return json(result);
      },
    },
  },
});
