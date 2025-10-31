export const getFileName = (filePath: string) => {
  // Normalize path separators (handle both / and \)
  const normalizedPath = filePath.replace(/\\/g, "/");
  const parts = normalizedPath.split("/");
  return parts[parts.length - 1];
};

export const isFolder = (filePath: string) => {
  // Handle empty string as root directory
  if (!filePath || filePath.trim() === "") {
    return true;
  }

  // Normalize path separators (handle both / and \)
  const normalizedPath = filePath.replace(/\\/g, "/");

  // Handle paths ending with slash - they are definitely folders
  if (normalizedPath.endsWith("/")) {
    return true;
  }

  // Handle root paths
  if (normalizedPath === "/" || normalizedPath === "//") {
    return true;
  }

  // Handle current/parent directory references
  if (normalizedPath === "." || normalizedPath === "..") {
    return true;
  }

  // Split path and get the last segment (filename)
  const parts = normalizedPath.split("/").filter((part) => part !== "");

  // If no parts after filtering, it's a root-like path
  if (parts.length === 0) {
    return true;
  }

  const lastSegment = parts[parts.length - 1];

  // Handle current/parent directory references in path
  if (lastSegment === "." || lastSegment === "..") {
    return true;
  }

  // Known file patterns without extensions that should be treated as files
  const knownFiles = new Set([
    "README",
    "LICENSE",
    "CHANGELOG",
    "COPYING",
    "INSTALL",
    "NEWS",
    "AUTHORS",
    "CONTRIBUTORS",
    "Makefile",
    "Dockerfile",
    "Vagrantfile",
    "Gemfile",
    "Podfile",
    "Rakefile",
    "Procfile",
    "gradlew",
    "mvnw",
    "configure",
    "install",
    "bootstrap",
    "setup",
    ".gitignore",
    ".gitattributes",
    ".gitmodules",
    ".gitkeep",
    ".env",
    ".env.example",
    ".env.local",
    ".env.production",
    ".env.development",
    ".eslintrc",
    ".prettierrc",
    ".babelrc",
    ".npmrc",
    ".yarnrc",
    ".editorconfig",
    ".htaccess",
    ".htpasswd",
    ".htdigest",
    "yarn.lock",
    "package-lock.json",
    "composer.lock",
    "Pipfile.lock",
    "tsconfig.json",
    "jsconfig.json",
    "webpack.config.js",
    "vite.config.js",
    "rollup.config.js",
    "babel.config.js",
    "jest.config.js",
    "vitest.config.js",
  ]);

  // Check if it's a known file type
  if (knownFiles.has(lastSegment)) {
    return false;
  }

  // Check for file extensions
  const dotIndex = lastSegment.lastIndexOf(".");

  // If no dot found, treat as folder (unless it's a known file)
  if (dotIndex === -1) {
    return true;
  }

  // If dot is at the beginning (hidden file/folder), check if it has extension after the dot
  if (dotIndex === 0) {
    // Hidden files like .gitignore, .env (already handled above)
    // Hidden folders like .git, .vscode (no extension after dot)
    const afterDot = lastSegment.substring(1);

    // If there's another dot after the first one, it might have an extension
    const secondDotIndex = afterDot.indexOf(".");
    if (secondDotIndex === -1) {
      // No second dot, so it's like .git, .vscode (folder) or .gitignore (file - handled above)
      // Check if it's a known hidden file pattern
      return !knownFiles.has(lastSegment);
    }
    // Has second dot, like .env.example - treat as file
    return false;
  }

  // For regular files, if there's a dot and something after it, it's likely a file
  const extension = lastSegment.substring(dotIndex + 1);

  // If extension is empty (ends with dot), treat as folder
  if (!extension) {
    return true;
  }

  // If extension looks like a file extension (alphanumeric, common patterns), treat as file
  // Common file extensions are typically 1-10 characters, alphanumeric with some special chars
  if (
    /^[a-zA-Z0-9]{1,10}$/.test(extension) ||
    /^(js|ts|jsx|tsx|css|scss|sass|less|html|htm|xml|json|yaml|yml|toml|ini|cfg|conf|config|md|txt|log|sql|py|java|c|cpp|h|hpp|cs|php|rb|go|rs|swift|kt|dart|scala|clj|hs|ml|fs|pl|sh|bat|cmd|ps1|vbs|lua|r|m|mm|asm|s|f|f90|f95|pas|ada|cob|cobol|for|bas|vb|d|nim|zig|odin|v|cr|ex|exs|erl|hrl|elm|purs|res|resi|reason|rei|ml|mli|ocaml|hs|lhs|agda|idr|lean|coq|v|dfy|why|whiley|boogie|bpl|smt|smt2|tla|als|dsl|grammar|g4|y|yacc|l|lex|flex|jj|pest|ne|ohm|peg|abnf|bnf|ebnf|railroads|xsd|dtd|rng|rnc|wsdl|wadl|raml|swagger|openapi|proto|thrift|avro|parquet|orc|arrow|flatbuf|cap|pcap|har|log|trace|prof|flame|svg|png|jpg|jpeg|gif|bmp|tiff|webp|ico|pdf|eps|ps|ai|psd|sketch|fig|xd|zip|tar|gz|bz2|xz|7z|rar|dmg|iso|img|bin|exe|msi|deb|rpm|apk|ipa|app|pkg|snap|flatpak|appimage|wasm|so|dll|dylib|a|lib|o|obj|class|jar|war|ear|aar|gem|egg|whl|nupkg|vsix|crx|xpi)$/i.test(
      extension,
    )
  ) {
    return false;
  }

  // For ambiguous cases (like single letters, numbers, or uncommon extensions),
  // default to treating as folder since that's safer for directory traversal
  return true;
};

/**
 * Adds a zero-width space (U+200B) after each URL special character
 * to improve line breaking in URIs.
 */
export const addLineBreak = (text: string) => {
  return text.replace(
    /[\/\.\+\?\=\%\&\#\:\;\,\_\~]/g,
    (match) => `${match}\u200B`,
  );
};

export const getWorktreeNameFromWorktreePath = (
  worktreePath?: string | null,
) => {
  if (!worktreePath) return undefined;
  return worktreePath.split(/[\\|/]/).pop();
};
