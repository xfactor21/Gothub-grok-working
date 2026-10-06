import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileCode,
  Folder,
  FolderOpen,
  Plus,
  Trash2,
} from "lucide-react";
import { useXide } from "@/lib/xide/store";

function fileName(path: string): string {
  return path.split("/").pop() ?? path;
}

type Entry = { path: string; kind: "dir" | "file"; children: Entry[] };

function buildTree(folders: string[], files: string[]): Entry[] {
  const root: Entry[] = [];
  const dirMap = new Map<string, Entry>();

  const ensureDir = (path: string): Entry => {
    const existing = dirMap.get(path);
    if (existing) return existing;
    const node: Entry = { path, kind: "dir", children: [] };
    dirMap.set(path, node);
    const parent = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (parent) ensureDir(parent).children.push(node);
    else root.push(node);
    return node;
  };

  [...folders].sort().forEach((f) => ensureDir(f));
  [...files].sort().forEach((f) => {
    const parent = f.includes("/") ? f.slice(0, f.lastIndexOf("/")) : "";
    const node: Entry = { path: f, kind: "file", children: [] };
    if (parent) ensureDir(parent).children.push(node);
    else root.push(node);
  });

  const sortRec = (nodes: Entry[]) => {
    nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(root);
  return root;
}

function NodeRow({
  node,
  depth,
  open,
  active,
  onOpen,
  onToggle,
  onDelete,
}: {
  node: Entry;
  depth: number;
  open: Set<string>;
  active: string | null;
  onOpen: (p: string) => void;
  onToggle: (p: string) => void;
  onDelete: (p: string) => void;
}) {
  const expanded = open.has(node.path);
  const isActive = active === node.path;
  return (
    <div>
      <div
        className={`group flex h-8 items-center gap-1 pr-1 text-[13px] ${
          isActive ? "bg-elevated text-fg" : "text-muted hover:bg-elevated/70 hover:text-fg"
        }`}
        style={{ paddingLeft: 8 + depth * 12 }}
      >
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-1 text-left"
          onClick={() =>
            node.kind === "dir" ? onToggle(node.path) : onOpen(node.path)
          }
        >
          {node.kind === "dir" ? (
            expanded ? (
              <ChevronDown className="size-3.5 shrink-0" />
            ) : (
              <ChevronRight className="size-3.5 shrink-0" />
            )
          ) : (
            <span className="w-3.5" />
          )}
          {node.kind === "dir" ? (
            expanded ? (
              <FolderOpen className="size-3.5 shrink-0 text-accent" />
            ) : (
              <Folder className="size-3.5 shrink-0" />
            )
          ) : (
            <FileCode className="size-3.5 shrink-0" />
          )}
          <span className="truncate">{fileName(node.path)}</span>
        </button>
        <button
          type="button"
          className="hidden size-7 items-center justify-center rounded-sm text-subtle hover:text-danger group-hover:flex"
          aria-label={`Delete ${node.path}`}
          onClick={() => onDelete(node.path)}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
      {node.kind === "dir" && expanded
        ? node.children.map((c) => (
            <NodeRow
              key={c.path}
              node={c}
              depth={depth + 1}
              open={open}
              active={active}
              onOpen={onOpen}
              onToggle={onToggle}
              onDelete={onDelete}
            />
          ))
        : null}
    </div>
  );
}

export function FileTree() {
  const project = useXide((s) =>
    s.projects.find((p) => p.id === s.activeProjectId),
  );
  const activeFile = useXide((s) => s.activeFile);
  const openFile = useXide((s) => s.openFile);
  const createFile = useXide((s) => s.createFile);
  const createFolder = useXide((s) => s.createFolder);
  const deletePath = useXide((s) => s.deletePath);
  const [open, setOpen] = useState<Set<string>>(
    () => new Set(project?.folders ?? []),
  );
  const [draft, setDraft] = useState<null | "file" | "folder">(null);
  const [name, setName] = useState("");

  const tree = useMemo(
    () =>
      project ? buildTree(project.folders, Object.keys(project.files)) : [],
    [project],
  );

  if (!project) {
    return (
      <div className="p-4 text-sm text-muted">Open a project to browse files.</div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-9 items-center justify-between border-b border-border px-2">
        <span className="truncate px-1 text-[11px] font-medium tracking-[0.14em] text-subtle uppercase">
          Explorer
        </span>
        <div className="flex">
          <button
            type="button"
            className="flex size-8 items-center justify-center rounded-sm text-muted hover:text-fg"
            aria-label="New file"
            onClick={() => {
              setDraft("file");
              setName("");
            }}
          >
            <Plus className="size-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto py-1">
        {tree.map((n) => (
          <NodeRow
            key={n.path}
            node={n}
            depth={0}
            open={open}
            active={activeFile}
            onOpen={openFile}
            onToggle={(p) =>
              setOpen((prev) => {
                const next = new Set(prev);
                if (next.has(p)) next.delete(p);
                else next.add(p);
                return next;
              })
            }
            onDelete={deletePath}
          />
        ))}
        {draft ? (
          <form
            className="px-2 py-1"
            onSubmit={(e) => {
              e.preventDefault();
              const p = name.trim().replace(/^\/+/, "");
              if (p) {
                if (draft === "file") createFile(p);
                else createFolder(p);
              }
              setDraft(null);
              setName("");
            }}
          >
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => setDraft(null)}
              placeholder={draft === "file" ? "src/new.ts" : "src/lib"}
              className="h-8 w-full rounded-sm border border-border bg-bg px-2 font-mono text-xs text-fg outline-none focus:shadow-[var(--shadow-border-hover)]"
            />
          </form>
        ) : null}
      </div>
    </div>
  );
}
