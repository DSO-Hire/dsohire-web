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
