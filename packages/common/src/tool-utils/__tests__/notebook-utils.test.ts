import { describe, expect, it } from "vitest";
import {
  type NotebookContent,
  editNotebookCell,
  parseNotebook,
  serializeNotebook,
  validateNotebookPath,
  validateNotebookStructure,
} from "../notebook-utils";

describe("notebook-utils", () => {
  describe("validateNotebookPath", () => {
    it("should pass for .ipynb files", () => {
      expect(() => validateNotebookPath("test.ipynb")).not.toThrow();
      expect(() => validateNotebookPath("/path/to/test.ipynb")).not.toThrow();
    });

    it("should throw for non-.ipynb files", () => {
      expect(() => validateNotebookPath("test.py")).toThrow(
        "File must be a Jupyter notebook (.ipynb)",
      );
      expect(() => validateNotebookPath("test.txt")).toThrow(
        "File must be a Jupyter notebook (.ipynb)",
      );
    });
  });

  describe("validateNotebookStructure", () => {
    it("should pass for valid notebook structure", () => {
      expect(() =>
        validateNotebookStructure({ cells: [] }),
      ).not.toThrow();
      expect(() =>
        validateNotebookStructure({ cells: [{ source: "test" }] }),
      ).not.toThrow();
    });

    it("should throw for invalid structures", () => {
      expect(() => validateNotebookStructure(null)).toThrow(
        "Invalid notebook format: no cells array found",
      );
      expect(() => validateNotebookStructure(undefined)).toThrow(
        "Invalid notebook format: no cells array found",
      );
      expect(() => validateNotebookStructure({})).toThrow(
        "Invalid notebook format: no cells array found",
      );
      expect(() => validateNotebookStructure({ cells: "not an array" })).toThrow(
        "Invalid notebook format: no cells array found",
      );
    });
  });

  describe("parseNotebook", () => {
    it("should parse valid notebook JSON", () => {
      const json = JSON.stringify({ cells: [{ source: "test" }] });
      const notebook = parseNotebook(json);
      expect(notebook.cells).toHaveLength(1);
      expect(notebook.cells[0].source).toBe("test");
    });

    it("should throw for invalid JSON", () => {
      expect(() => parseNotebook("invalid json")).toThrow();
    });

    it("should throw for invalid notebook structure", () => {
      const json = JSON.stringify({ notCells: [] });
      expect(() => parseNotebook(json)).toThrow(
        "Invalid notebook format: no cells array found",
      );
    });
  });

  describe("editNotebookCell", () => {
    it("should edit cell by ID", () => {
      const notebook: NotebookContent = {
        cells: [
          { id: "cell-1", source: "original" },
          { id: "cell-2", source: "content" },
        ],
      };

      const updated = editNotebookCell(notebook, "cell-2", "updated");
      expect(updated.cells[1].source).toBe("updated");
      expect(updated.cells[0].source).toBe("original");
    });

    it("should edit cell by index", () => {
      const notebook: NotebookContent = {
        cells: [
          { id: "cell-1", source: "original" },
          { id: "cell-2", source: "content" },
        ],
      };

      const updated = editNotebookCell(notebook, "0", "updated");
      expect(updated.cells[0].source).toBe("updated");
      expect(updated.cells[1].source).toBe("content");
    });

    it("should edit cell without ID by index", () => {
      const notebook: NotebookContent = {
        cells: [{ source: "original" }, { source: "content" }],
      };

      const updated = editNotebookCell(notebook, "1", "updated");
      expect(updated.cells[1].source).toBe("updated");
      expect(updated.cells[0].source).toBe("original");
    });

    it("should throw when cell not found", () => {
      const notebook: NotebookContent = {
        cells: [{ id: "cell-1", source: "original" }],
      };

      expect(() => editNotebookCell(notebook, "non-existent", "updated")).toThrow(
        'Cell with ID "non-existent" not found in notebook',
      );
    });

    it("should throw when index is out of range", () => {
      const notebook: NotebookContent = {
        cells: [{ id: "cell-1", source: "original" }],
      };

      expect(() => editNotebookCell(notebook, "5", "updated")).toThrow(
        'Cell with ID "5" not found in notebook',
      );
    });
  });

  describe("serializeNotebook", () => {
    it("should serialize notebook to formatted JSON", () => {
      const notebook: NotebookContent = {
        cells: [{ id: "cell-1", source: "test" }],
      };

      const json = serializeNotebook(notebook);
      expect(json).toContain('"cells"');
      expect(json).toContain('"id": "cell-1"');
      expect(json).toContain('"source": "test"');
      // Check it's formatted (has newlines and indentation)
      expect(json.split("\n").length).toBeGreaterThan(1);
    });

    it("should handle empty cells array", () => {
      const notebook: NotebookContent = { cells: [] };
      const json = serializeNotebook(notebook);
      const parsed = JSON.parse(json);
      expect(parsed.cells).toEqual([]);
    });
  });

  describe("round-trip serialization", () => {
    it("should maintain structure through parse and serialize", () => {
      const original = {
        cells: [
          { id: "cell-1", source: "print('hello')" },
          { id: "cell-2", source: "print('world')" },
        ],
      };

      const json = serializeNotebook(original);
      const parsed = parseNotebook(json);
      expect(parsed).toEqual(original);
    });
  });
});

