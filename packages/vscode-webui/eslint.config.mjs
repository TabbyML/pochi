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
          mode: "jsx-only", // limit to JSX text and attributes to reduce noise
          // Only check user-facing attributes; ignore design/technical attrs like className/variant/size/id
          "jsx-attributes": {
            include: [
              "^title$",
              "^alt$",
              "^placeholder$",
              "^label$",
            ],
          },
          // Ignore developer-oriented strings passed to specific utility calls
          callees: {
            // Do not validate any function call arguments globally to reduce noise
            exclude: [".*"],
          },
          words: {
            exclude: [
              // Numbers and common symbols
              "^\\d+$", // Pure numbers
              "^[0-9.,]+$", // Numbers with decimals and commas
              // Single character symbols
              "^[@/\\\\|\\-_+=:;,.?!#$%&*()\\[\\]{}<>\"'`~^]$",
              // Cursor and special UI characters
              "^▍$",
              // Bullet points and list markers
              "^•$",
              // Common technical terms
              "^(px|rem|em|%|vh|vw|auto|none|inherit|KB|MB|GB|ms|s|min|h)$",
              // Boolean and null values
              "^(true|false|null|undefined)$",
              // Single letters (initials)
              "^[A-Za-z]$",
              // Brand names
              "^Pochi$",
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
