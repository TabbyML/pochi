type ParserState =
  | "text"
  | "escape"
  | "csi"
  | "osc"
  | "osc-escape"
  | "control-string"
  | "control-string-escape";

/**
 * Converts terminal output into plain text while preserving printable Unicode,
 * tabs, and line controls. The parser is stateful so ANSI/OSC sequences split
 * across stream chunks are removed correctly.
 */
export class PlainOutputSanitizer {
  private state: ParserState = "text";

  write(chunk: string): string {
    let output = "";

    for (const character of chunk) {
      const code = character.charCodeAt(0);
      switch (this.state) {
        case "text":
          if (character === "\x1b") {
            this.state = "escape";
          } else if (character === "\u009b") {
            this.state = "csi";
          } else if (character === "\u009d") {
            this.state = "osc";
          } else if (
            character === "\u0090" ||
            character === "\u0098" ||
            character === "\u009e" ||
            character === "\u009f"
          ) {
            this.state = "control-string";
          } else if (
            character === "\n" ||
            character === "\r" ||
            character === "\t" ||
            (code >= 0x20 && code !== 0x7f && !(code >= 0x80 && code <= 0x9f))
          ) {
            output += character;
          }
          break;

        case "escape":
          if (character === "[") {
            this.state = "csi";
          } else if (character === "]") {
            this.state = "osc";
          } else if (
            character === "P" ||
            character === "X" ||
            character === "^" ||
            character === "_"
          ) {
            this.state = "control-string";
          } else if (code >= 0x30 && code <= 0x7e) {
            this.state = "text";
          }
          break;

        case "csi":
          if (code >= 0x40 && code <= 0x7e) {
            this.state = "text";
          }
          break;

        case "osc":
          if (character === "\x07" || character === "\u009c") {
            this.state = "text";
          } else if (character === "\x1b") {
            this.state = "osc-escape";
          }
          break;

        case "osc-escape":
          if (character === "\\") {
            this.state = "text";
          } else if (character !== "\x1b") {
            this.state = "osc";
          }
          break;

        case "control-string":
          if (character === "\u009c") {
            this.state = "text";
          } else if (character === "\x1b") {
            this.state = "control-string-escape";
          }
          break;

        case "control-string-escape":
          if (character === "\\") {
            this.state = "text";
          } else if (character !== "\x1b") {
            this.state = "control-string";
          }
          break;
      }
    }

    return output;
  }

  end(): string {
    this.state = "text";
    return "";
  }
}
