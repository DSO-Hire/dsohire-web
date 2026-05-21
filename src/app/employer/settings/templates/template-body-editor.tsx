"use client";

/**
 * TemplateBodyEditor — Tiptap WYSIWYG with a mergefield insertion menu
 * (Phase 4.5.f).
 *
 * Mirrors JobDescriptionEditor's setup (StarterKit + Link, H2/H3 only,
 * sanitizer-friendly extensions) and adds a "Insert variable ▾" toolbar
 * button that injects {{token}} at the cursor on click.
 *
 * The mergefield groups come from the manifest, so what shows up in
 * the dropdown matches what the renderer accepts. Reference panel
 * underneath the editor surfaces every variable with an example value
 * so DSOs don't have to memorize the schema.
 */

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useState } from "react";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
  Variable,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MergefieldGroup } from "@/lib/email/templates/manifest";

interface TemplateBodyEditorProps {
  value: string;
  onChange: (html: string) => void;
  groups: readonly MergefieldGroup[];
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function TemplateBodyEditor({
  value,
  onChange,
  groups,
  disabled = false,
  placeholder = "Write the email body…",
  className,
}: TemplateBodyEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class:
            "text-heritage underline underline-offset-2 hover:text-heritage-deep",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
    ],
    content: value,
    immediatelyRender: false,
    editable: !disabled,
    editorProps: {
      attributes: {
        class: cn(
          "min-h-[260px] max-h-[640px] overflow-y-auto",
          "px-5 py-4",
          "outline-none focus-visible:outline-none",
          "dso-prose"
        ),
      },
    },
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
  });

  if (!editor) return null;

  return (
    <div
      className={cn(
        "border border-[var(--rule-strong)] bg-cream",
        "focus-within:ring-2 focus-within:ring-heritage focus-within:ring-offset-0",
        className
      )}
    >
      <Toolbar editor={editor} groups={groups} disabled={disabled} />
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

/* ─────────── Toolbar ─────────── */

function Toolbar({
  editor,
  groups,
  disabled,
}: {
  editor: Editor;
  groups: readonly MergefieldGroup[];
  disabled: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[var(--rule)] px-2 py-1.5 bg-ivory">
      <ToolbarButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold"
        disabled={disabled}
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic"
        disabled={disabled}
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Heading 2"
        disabled={disabled}
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="Heading 3"
        disabled={disabled}
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Bulleted list"
        disabled={disabled}
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Numbered list"
        disabled={disabled}
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        label="Blockquote"
        disabled={disabled}
      >
        <Quote className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("link")}
        onClick={() => {
          if (editor.isActive("link")) {
            editor.chain().focus().unsetLink().run();
            return;
          }
          const url = window.prompt("Enter URL (must include https://):");
          if (url) {
            editor
              .chain()
              .focus()
              .extendMarkRange("link")
              .setLink({ href: url })
              .run();
          }
        }}
        label="Link"
        disabled={disabled}
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
      <Divider />
      <InsertVariableMenu
        editor={editor}
        groups={groups}
        disabled={disabled}
      />
    </div>
  );
}

function InsertVariableMenu({
  editor,
  groups,
  disabled,
}: {
  editor: Editor;
  groups: readonly MergefieldGroup[];
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);

  const insert = (token: string) => {
    editor.chain().focus().insertContent(`{{${token}}}`).run();
    setOpen(false);
  };

  return (
    <div className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1.5 px-2 h-8 text-[12px] font-semibold text-slate-body hover:bg-ivory-deep hover:text-ink rounded transition-colors",
          open && "bg-ink text-ivory hover:bg-ink-soft hover:text-ivory",
          disabled && "opacity-40 cursor-not-allowed"
        )}
      >
        <Variable className="h-3.5 w-3.5" />
        Insert variable
        <ChevronDown className="h-3 w-3" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close menu"
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => setOpen(false)}
          />
          <div className="absolute left-0 top-full z-50 mt-1 w-[280px] max-w-[calc(100vw-2rem)] max-h-[360px] overflow-y-auto border border-[var(--rule-strong)] bg-white shadow-lg">
            {groups.map((group) => (
              <div key={group.id}>
                <div className="border-b border-t border-[var(--rule)] bg-cream/50 px-3 py-1.5 text-[10px] font-bold tracking-[1.5px] uppercase text-heritage-deep">
                  {group.label}
                </div>
                {group.fields.map((field) => (
                  <button
                    key={field.token}
                    type="button"
                    onClick={() => insert(field.token)}
                    className="block w-full text-left px-3 py-2 text-[13px] hover:bg-cream/50 transition-colors"
                  >
                    <div className="font-mono text-[12px] text-ink">
                      {`{{${field.token}}}`}
                    </div>
                    <div className="text-[11px] text-slate-meta mt-0.5">
                      {field.label} · &ldquo;{field.example}&rdquo;
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  label,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center transition-colors",
        active
          ? "bg-ink text-ivory"
          : "text-slate-body hover:bg-ivory-deep hover:text-ink",
        disabled && "opacity-40 cursor-not-allowed"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-[var(--rule-strong)]" />;
}
