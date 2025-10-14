import typescriptParser from "@typescript-eslint/parser";
// eslint.config.mjs
import i18next from "eslint-plugin-i18next";

export default [
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: typescriptParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      i18next,
    },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only", // only check jsx
          words: {
            exclude: [
              // Numbers and common symbols
              "^\\d+$", // Pure numbers
              "^[0-9.,]+$", // Numbers with decimals and commas
              // Single character symbols
              "^[@/\\\\|\\-_+=:;,.?!#$%&*()\\[\\]{}<>\"'`~^]$",
              // Common technical terms
              "^(px|rem|em|%|vh|vw|auto|none|inherit|KB|MB|GB|ms|s|min|h)$",
              // Boolean and null values
              "^(true|false|null|undefined)$",
            ],
          },
        },
      ],
    },
  },
  {
    files: [
      "**/*.test.{js,jsx,ts,tsx}",
      "**/*.spec.{js,jsx,ts,tsx}",
      "**/*.story.{js,jsx,ts,tsx}",
      "**/*.stories.{js,jsx,ts,tsx}",
    ],
    rules: {
      "i18next/no-literal-string": "off",
    },
  },
];
