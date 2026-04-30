"use client";

/**
 * JobDescriptionEditor — Tiptap WYSIWYG for DSO recruiters writing job posts.
 *
 * Per the Q4 decision (schema_and_routes_sketch.md):
 * Enabled: Bold, Italic, H2, H3, BulletList, OrderedList, Link, Blockquote
 * Disabled: Image, Table, CodeBlock (not needed for job descriptions)
 *
 * Output: HTML string (sanitized on render via <RenderedJobDescription />).
 * Designed for /employer/jobs/new and /employer/jobs/[id]/edit.
 */

import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Quote,
  Link as LinkIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface JobDescriptionEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
}

export function JobDescriptionEditor({
  value = "",
  onChange,
  placeholder = "Describe the role, responsibilities, and what makes this DSO a great place to work...",
  className,
}: JobDescriptionEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Brand: H1 is reserved for page titles; allow H2 + H3 only.
        heading: { levels: [2, 3] },
        // Drop features we don't need on job descriptions.
        codeBlock: false,
        code: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        HTMLAttributes: {
          class: "text-heritage underline underline-offset-2 hover:text-heritage-deep",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
    ],
    content: value,
    immediatelyRender: false, // Next.js SSR — Tiptap renders client-side only
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
      onChange?.(editor.getHTML());
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
      <Toolbar editor={editor} />
      <EditorContent editor={editor} placeholder={placeholder} />
    </div>
  );
}

/* ───────── Toolbar ───────── */

function Toolbar({ editor }: { editor: Editor }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-[var(--rule)] px-2 py-1.5 bg-ivory">
      <ToolbarButton
        active={editor.isActive("bold")}
        onClick={() => editor.chain().focus().toggleBold().run()}
        label="Bold"
      >
        <Bold className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        label="Italic"
      >
        <Italic className="h-4 w-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        label="Heading 2"
      >
        <Heading2 className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        label="Heading 3"
      >
        <Heading3 className="h-4 w-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        label="Bulleted list"
      >
        <List className="h-4 w-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        label="Numbered list"
      >
        <ListOrdered className="h-4 w-4" />
      </ToolbarButton>
      <Divider />
      <ToolbarButton
        active={editor.isActive("blockquote")}
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        label="Blockquote"
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
            editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          }
        }}
        label="Link"
      >
        <LinkIcon className="h-4 w-4" />
      </ToolbarButton>
    </div>
  );
}

function ToolbarButton({
  children,
  onClick,
  active,
  label,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center transition-colors",
        active
          ? "bg-ink text-ivory"
          : "text-slate-body hover:bg-ivory-deep hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span className="mx-1 h-5 w-px bg-[var(--rule-strong)]" />;
}
