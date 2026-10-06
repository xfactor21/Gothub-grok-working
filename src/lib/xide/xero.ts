import { createServerFn } from "@tanstack/react-start";

export type XeroAskInput = {
  prompt: string;
  projectName: string;
  templateId: string;
  activeFile: string | null;
  activeContent: string;
  files: string[];
  diagnostics: string[];
  symbols: string[];
};

export type XeroAskResult =
  | {
      ok: true;
      text: string;
      patches: { path: string; content: string }[];
    }
  | { ok: false; error: string };

const PATCH_RE =
  /<<<FILE\s+([^\s>]+)>>>\s*([\s\S]*?)<<<END>>>/g;

function extractPatches(text: string): { path: string; content: string }[] {
  const out: { path: string; content: string }[] = [];
  const re = new RegExp(PATCH_RE.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const path = m[1]?.trim();
    const content = (m[2] ?? "").replace(/^\n/, "").replace(/\n$/, "");
    if (path) out.push({ path, content });
  }
  return out;
}

export const askXero = createServerFn({ method: "POST" })
  .validator((input: XeroAskInput) => input)
  .handler(async ({ data }): Promise<XeroAskResult> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "Xero is not available in this environment." };
    }
    const prompt = data.prompt.slice(0, 4000);
    const fileSlice = data.activeContent.slice(0, 6000);
    const fileList = data.files.slice(0, 80).join("\n");
    const diags = data.diagnostics.slice(0, 20).join("\n") || "(none)";
    const symbols = data.symbols.slice(0, 40).join(", ") || "(none)";

    const system = `You are Xero, the engineering agent inside xIDE v9.
You help the developer understand, navigate, and safely change their workspace.
Rules:
- Never invent files that are not in the workspace listing unless the user asks to create them.
- Never run shell or claim a Gradle daemon is executing on-device.
- If you propose a full-file rewrite, emit one or more patches using EXACTLY this fence:

<<<FILE relative/path>>>
complete file contents
<<<END>>>

- Patches must be the entire file, not a diff.
- Keep answers tight. Lead with the useful part.
- If the user asks to explain code, do not emit a patch unless they also asked to change it.
- Refer to symbols and diagnostics when they are relevant.`;

    const user = `Project: ${data.projectName} (${data.templateId})
Active file: ${data.activeFile ?? "(none)"}
Workspace files:
${fileList}

Indexed symbols: ${symbols}

Diagnostics:
${diags}

Active file contents:
${fileSlice || "(empty)"}

Developer:
${prompt}`;

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: "grok-4.5",
          temperature: 0.3,
          max_tokens: 1200,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
      });
      if (!res.ok) {
        return { ok: false, error: `Xero upstream error ${res.status}` };
      }
      const body = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const text = body.choices?.[0]?.message?.content?.trim() ?? "";
      if (!text) return { ok: false, error: "Xero returned an empty reply." };
      return { ok: true, text, patches: extractPatches(text) };
    } catch {
      return { ok: false, error: "Xero could not reach the model." };
    }
  });
