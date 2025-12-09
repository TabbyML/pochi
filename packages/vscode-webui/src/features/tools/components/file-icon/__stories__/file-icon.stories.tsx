import type { Meta, StoryObj } from "@storybook/react";
import { FileIcon } from "../index";

const meta = {
  title: "Pochi/FileIcon",
  component: FileIcon,
  parameters: {
    layout: "centered",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof FileIcon>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TypescriptReact: Story = {
  args: {
    path: "src/components/Button.tsx",
  },
};

// JavaScript Family
export const Javascript: Story = {
  args: {
    path: "src/utils/helper.js",
  },
};

export const Typescript: Story = {
  args: {
    path: "src/components/App.ts",
  },
};

export const JSX: Story = {
  args: {
    path: "src/components/Navbar.jsx",
  },
};

export const TSX: Story = {
  args: {
    path: "src/components/Header.tsx",
  },
};

// Web Development
export const HTML: Story = {
  args: {
    path: "public/index.html",
  },
};

export const CSS: Story = {
  args: {
    path: "src/styles/main.css",
  },
};

export const SCSS: Story = {
  args: {
    path: "src/styles/variables.scss",
  },
};

// Backend Languages
export const Python: Story = {
  args: {
    path: "scripts/data_processor.py",
  },
};

export const Java: Story = {
  args: {
    path: "src/main/java/com/example/Main.java",
  },
};

export const CSharp: Story = {
  args: {
    path: "src/Program.cs",
  },
};

export const GoLang: Story = {
  args: {
    path: "cmd/server/main.go",
  },
};

export const Rust: Story = {
  args: {
    path: "src/lib.rs",
  },
};

export const Ruby: Story = {
  args: {
    path: "app/models/user.rb",
  },
};

export const PHP: Story = {
  args: {
    path: "public/index.php",
  },
};

// Systems Programming
export const C: Story = {
  args: {
    path: "src/main.c",
  },
};

export const CPP: Story = {
  args: {
    path: "src/algorithm.cpp",
  },
};

// Data & Config
export const JSONFile: Story = {
  args: {
    path: "package.json",
  },
};

export const YAML: Story = {
  args: {
    path: "docker-compose.yml",
  },
};

export const Markdown: Story = {
  args: {
    path: "README.md",
  },
};

// Modern Frontend Frameworks
export const Vue: Story = {
  args: {
    path: "src/components/App.vue",
  },
};

export const Svelte: Story = {
  args: {
    path: "src/components/Counter.svelte",
  },
};

// Directory
export const Folder: Story = {
  args: {
    path: "src/components/",
    isDirectory: true,
  },
};
