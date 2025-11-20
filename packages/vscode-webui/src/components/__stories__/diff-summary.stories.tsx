import type { Meta, StoryObj } from "@storybook/react";
import { DiffSummary } from "../diff-summary";

const meta = {
  title: "Components/DiffSummary",
  component: DiffSummary,
  parameters: {
    layout: "padded",
  },
  tags: ["autodocs"],
} satisfies Meta<typeof DiffSummary>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    files: [
      { filepath: "aaa.md", added: 2, removed: 1 },
      { filepath: "README.md", added: 2, removed: 0 },
    ],
    onRevert: (filePath: string) => {
      console.log("Revert file:", filePath);
    },
    onRevertAll: () => {
      console.log("Revert all files");
    },
    onViewDiff: () => {
      console.log("View diff");
    },
  },
};

export const SingleFile: Story = {
  args: {
    files: [{ filepath: "src/components/button.tsx", added: 5, removed: 2 }],
    onRevert: (filePath: string) => {
      console.log("Revert file:", filePath);
    },
    onRevertAll: () => {
      console.log("Revert all files");
    },
    onViewDiff: () => {
      console.log("View diff");
    },
  },
};

export const ManyFiles: Story = {
  args: {
    files: [
      { filepath: "src/app/page.tsx", added: 15, removed: 3 },
      { filepath: "src/components/header.tsx", added: 8, removed: 5 },
      { filepath: "src/lib/utils.ts", added: 20, removed: 10 },
      {
        filepath: "src/features/authentication/login.tsx",
        added: 12,
        removed: 0,
      },
      { filepath: "package.json", added: 2, removed: 1 },
    ],
    onRevert: (filePath: string) => {
      console.log("Revert file:", filePath);
    },
    onRevertAll: () => {
      console.log("Revert all files");
    },
    onViewDiff: () => {
      console.log("View diff");
    },
  },
};

export const LargeChanges: Story = {
  args: {
    files: [
      { filepath: "src/main.tsx", added: 150, removed: 75 },
      { filepath: "src/app.tsx", added: 89, removed: 42 },
    ],
    onRevert: (filePath: string) => {
      console.log("Revert file:", filePath);
    },
    onRevertAll: () => {
      console.log("Revert all files");
    },
    onViewDiff: () => {
      console.log("View diff");
    },
  },
};

export const OnlyAdditions: Story = {
  args: {
    files: [
      { filepath: "src/new-feature.tsx", added: 25, removed: 0 },
      { filepath: "src/another-file.ts", added: 10, removed: 0 },
    ],
    onRevert: (filePath: string) => {
      console.log("Revert file:", filePath);
    },
    onRevertAll: () => {
      console.log("Revert all files");
    },
    onViewDiff: () => {
      console.log("View diff");
    },
  },
};

export const OnlyDeletions: Story = {
  args: {
    files: [
      { filepath: "src/old-file.tsx", added: 0, removed: 30 },
      { filepath: "src/deprecated.ts", added: 0, removed: 15 },
    ],
    onRevert: (filePath: string) => {
      console.log("Revert file:", filePath);
    },
    onRevertAll: () => {
      console.log("Revert all files");
    },
    onViewDiff: () => {
      console.log("View diff");
    },
  },
};
