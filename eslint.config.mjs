import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...tseslint.configs.recommendedTypeChecked,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ["eslint.config.mjs"],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      next: { rootDir: "web" },
    },
  },
  // Test files: suppress false positives from bun's assertion types and
  // React's JSX.Element typing (.props is `any`). These rules catch real
  // issues in source but only produce noise in tests that call components
  // directly or use expect().rejects.
  {
    files: [
      "tests/**/*.ts",
      "tests/**/*.tsx",
      "apps/*/tests/**/*.ts",
      "apps/*/tests/**/*.tsx",
    ],
    rules: {
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-argument": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    "web/.next/**",
    "out/**",
    "build/**",
    "web/next-env.d.ts",
  ]),
]);

export default eslintConfig;
