import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Guard for the 2026-07-16 launch-day crash class: in a `"use server"`
 * module, the server-actions compiler turns EVERY export into a runtime
 * server-reference registration. A type re-export (`export type { X }` or
 * `export { X }`) leaks into the compiled chunk as an undefined identifier
 * and crashes the whole route at module evaluation (ReferenceError).
 *
 * Allowed: async function exports (the actual server actions) and erased
 * TS declarations (`export interface X {}`, `export type X = ...`).
 * Forbidden: any re-export statement (`export { ... }`, `export type
 * { ... }`, `export * from`), and non-async value exports.
 */
const useServerExportsPlugin = {
  rules: {
    "no-unsafe-use-server-exports": {
      meta: {
        type: "problem",
        docs: {
          description:
            'Disallow non-async-function exports in "use server" modules',
        },
        schema: [],
        messages: {
          reExport:
            'Re-export statements in a "use server" module compile into broken server-reference registrations (launch-day crash 2026-07-16). Export the type from a shared non-"use server" module instead.',
          nonAsync:
            'Only async functions (and erased TS type declarations) may be exported from a "use server" module. This export compiles into a server-reference registration and can crash the route at module evaluation.',
        },
      },
      create(context) {
        const body = context.sourceCode.ast.body;
        let isUseServer = false;
        for (const node of body) {
          if (
            node.type === "ExpressionStatement" &&
            node.expression.type === "Literal" &&
            typeof node.expression.value === "string"
          ) {
            if (node.expression.value === "use server") {
              isUseServer = true;
              break;
            }
            continue; // other directives ("use strict", etc.)
          }
          break; // past the directive prologue
        }
        if (!isUseServer) return {};

        const isAsyncFn = (n) =>
          n != null &&
          (n.type === "FunctionDeclaration" ||
            n.type === "FunctionExpression" ||
            n.type === "ArrowFunctionExpression") &&
          n.async;

        return {
          ExportAllDeclaration(node) {
            context.report({ node, messageId: "reExport" });
          },
          ExportNamedDeclaration(node) {
            if (node.specifiers.length > 0) {
              context.report({ node, messageId: "reExport" });
              return;
            }
            const decl = node.declaration;
            if (decl == null) return;
            if (
              decl.type === "TSInterfaceDeclaration" ||
              decl.type === "TSTypeAliasDeclaration"
            ) {
              return; // erased at compile time — safe
            }
            if (isAsyncFn(decl)) return;
            if (decl.type === "VariableDeclaration") {
              if (decl.declarations.every((d) => isAsyncFn(d.init))) return;
            }
            context.report({ node, messageId: "nonAsync" });
          },
          ExportDefaultDeclaration(node) {
            if (!isAsyncFn(node.declaration)) {
              context.report({ node, messageId: "nonAsync" });
            }
          },
        };
      },
    },
  },
};


/**
 * Unslop guard (2026-11-19). Keeps the design system honest:
 *   - no text-[Npx]: px text ignores the text-size toggle; use text-2xs/xs/sm
 *     or a rem value.
 *   - no hex in Tailwind arbitrary values (text-[#...], bg-[#...]): use tokens.
 *   - no 100vh / h-screen: mobile browser chrome makes them overflow; use dvh.
 * Scans string literals and template chunks, so it catches className strings,
 * cn() args and inline style values alike. Pixel-locked files are exempted
 * in the config block below.
 */
const UNSLOP_CHECKS = [
  [/\btext-\[\d+(?:\.\d+)?px\]/, "pxText"],
  [/\b(?:text|bg|border|from|via|to|fill|stroke|ring|outline|decoration|divide)-\[#[0-9a-fA-F]{3,8}\]/, "hexClass"],
  [/\b100vh\b|(?:^|[\s"'`:])(?:min-h-|max-h-|h-)screen\b/, "vh"],
];
const unslopPlugin = {
  rules: {
    "design-tokens": {
      meta: {
        type: "problem",
        docs: { description: "Enforce DSO Hire design tokens (no px text, raw hex classes, 100vh)" },
        schema: [],
        messages: {
          pxText: "Pixel font size (text-[Npx]) ignores the text-size toggle. Use text-2xs / text-xs / text-sm or a rem value.",
          hexClass: "Raw hex in a Tailwind class. Use a design token (text-heritage, bg-ink, text-heritage-bright, ...).",
          vh: "100vh / h-screen overflows behind mobile browser chrome. Use dvh (h-dvh, min-h-dvh, 100dvh).",
        },
      },
      create(context) {
        const check = (node, text) => {
          if (typeof text !== "string") return;
          for (const [re, messageId] of UNSLOP_CHECKS) {
            if (re.test(text)) context.report({ node, messageId });
          }
        };
        return {
          Literal(node) { check(node, node.value); },
          TemplateElement(node) { check(node, node.value.cooked); },
          JSXText(node) { /* visible copy, not styling */ },
        };
      },
    },
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "use-server-exports": useServerExportsPlugin },
    rules: {
      "use-server-exports/no-unsafe-use-server-exports": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { "unslop": unslopPlugin },
    rules: { "unslop/design-tokens": "error" },
  },
  {
    // Pixel-locked by design: print/PDF resume, fixed-size marketing
    // gauges, OG image routes, the avatar palette, third-party brand marks.
    files: [
      "src/components/resume/**",
      "src/app/candidate/resume/build/**",
      "src/app/candidate/(app)/resume/resume-toolbar.tsx",
      "src/components/marketing/fit-dial.tsx",
      "src/components/marketing/film-strip.tsx",
      "src/components/ui/avatar.tsx",
      "src/components/auth/linkedin-oauth-button.tsx",
      "src/components/analytics/apps-sparkline.tsx",
      "src/app/**/opengraph-image.tsx",
      "src/app/**/twitter-image.tsx",
      "src/app/**/og/**",
      "src/lib/**/__tests__/**",
      "**/*.test.{ts,tsx}",
    ],
    rules: { "unslop/design-tokens": "off" },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
