import type {
  BundledLanguageInfo,
  DynamicImportLanguageRegistration,
} from "@shikijs/types";

// common languages picked from shiki/bundle/full
export const bundledLanguagesInfo: BundledLanguageInfo[] = [
  {
    id: "apache",
    name: "Apache Conf",
    import: (() =>
      import("@shikijs/langs/apache")) as DynamicImportLanguageRegistration,
  },
  {
    id: "bat",
    name: "Batch File",
    aliases: ["batch"],
    import: (() =>
      import("@shikijs/langs/bat")) as DynamicImportLanguageRegistration,
  },
  {
    id: "c",
    name: "C",
    import: (() =>
      import("@shikijs/langs/c")) as DynamicImportLanguageRegistration,
  },
  {
    id: "clojure",
    name: "Clojure",
    aliases: ["clj"],
    import: (() =>
      import("@shikijs/langs/clojure")) as DynamicImportLanguageRegistration,
  },
  {
    id: "cpp",
    name: "C++",
    aliases: ["c++"],
    import: (() =>
      import("@shikijs/langs/cpp")) as DynamicImportLanguageRegistration,
  },
  {
    id: "csharp",
    name: "C#",
    aliases: ["c#", "cs"],
    import: (() =>
      import("@shikijs/langs/csharp")) as DynamicImportLanguageRegistration,
  },
  {
    id: "css",
    name: "CSS",
    import: (() =>
      import("@shikijs/langs/css")) as DynamicImportLanguageRegistration,
  },
  {
    id: "dart",
    name: "Dart",
    import: (() =>
      import("@shikijs/langs/dart")) as DynamicImportLanguageRegistration,
  },
  {
    id: "diff",
    name: "Diff",
    import: (() =>
      import("@shikijs/langs/diff")) as DynamicImportLanguageRegistration,
  },
  {
    id: "docker",
    name: "Dockerfile",
    aliases: ["dockerfile"],
    import: (() =>
      import("@shikijs/langs/docker")) as DynamicImportLanguageRegistration,
  },
  {
    id: "go",
    name: "Go",
    import: (() =>
      import("@shikijs/langs/go")) as DynamicImportLanguageRegistration,
  },
  {
    id: "graphql",
    name: "GraphQL",
    aliases: ["gql"],
    import: (() =>
      import("@shikijs/langs/graphql")) as DynamicImportLanguageRegistration,
  },
  {
    id: "html",
    name: "HTML",
    import: (() =>
      import("@shikijs/langs/html")) as DynamicImportLanguageRegistration,
  },
  {
    id: "java",
    name: "Java",
    import: (() =>
      import("@shikijs/langs/java")) as DynamicImportLanguageRegistration,
  },
  {
    id: "javascript",
    name: "JavaScript",
    aliases: ["js"],
    import: (() =>
      import("@shikijs/langs/javascript")) as DynamicImportLanguageRegistration,
  },
  {
    id: "json",
    name: "JSON",
    import: (() =>
      import("@shikijs/langs/json")) as DynamicImportLanguageRegistration,
  },
  {
    id: "jsonc",
    name: "JSON with Comments",
    import: (() =>
      import("@shikijs/langs/jsonc")) as DynamicImportLanguageRegistration,
  },
  {
    id: "jsx",
    name: "JSX",
    import: (() =>
      import("@shikijs/langs/jsx")) as DynamicImportLanguageRegistration,
  },
  {
    id: "kotlin",
    name: "Kotlin",
    aliases: ["kt", "kts"],
    import: (() =>
      import("@shikijs/langs/kotlin")) as DynamicImportLanguageRegistration,
  },
  {
    id: "less",
    name: "Less",
    import: (() =>
      import("@shikijs/langs/less")) as DynamicImportLanguageRegistration,
  },
  {
    id: "lua",
    name: "Lua",
    import: (() =>
      import("@shikijs/langs/lua")) as DynamicImportLanguageRegistration,
  },
  {
    id: "make",
    name: "Makefile",
    aliases: ["makefile"],
    import: (() =>
      import("@shikijs/langs/make")) as DynamicImportLanguageRegistration,
  },
  {
    id: "markdown",
    name: "Markdown",
    aliases: ["md"],
    import: (() =>
      import("@shikijs/langs/markdown")) as DynamicImportLanguageRegistration,
  },
  {
    id: "nginx",
    name: "Nginx",
    import: (() =>
      import("@shikijs/langs/nginx")) as DynamicImportLanguageRegistration,
  },
  {
    id: "objective-c",
    name: "Objective-C",
    aliases: ["objc"],
    import: (() =>
      import(
        "@shikijs/langs/objective-c"
      )) as DynamicImportLanguageRegistration,
  },
  {
    id: "perl",
    name: "Perl",
    import: (() =>
      import("@shikijs/langs/perl")) as DynamicImportLanguageRegistration,
  },
  {
    id: "php",
    name: "PHP",
    import: (() =>
      import("@shikijs/langs/php")) as DynamicImportLanguageRegistration,
  },
  {
    id: "powershell",
    name: "PowerShell",
    aliases: ["ps", "ps1"],
    import: (() =>
      import("@shikijs/langs/powershell")) as DynamicImportLanguageRegistration,
  },
  {
    id: "prisma",
    name: "Prisma",
    import: (() =>
      import("@shikijs/langs/prisma")) as DynamicImportLanguageRegistration,
  },
  {
    id: "python",
    name: "Python",
    aliases: ["py"],
    import: (() =>
      import("@shikijs/langs/python")) as DynamicImportLanguageRegistration,
  },
  {
    id: "ruby",
    name: "Ruby",
    aliases: ["rb"],
    import: (() =>
      import("@shikijs/langs/ruby")) as DynamicImportLanguageRegistration,
  },
  {
    id: "rust",
    name: "Rust",
    aliases: ["rs"],
    import: (() =>
      import("@shikijs/langs/rust")) as DynamicImportLanguageRegistration,
  },
  {
    id: "sass",
    name: "Sass",
    import: (() =>
      import("@shikijs/langs/sass")) as DynamicImportLanguageRegistration,
  },
  {
    id: "scala",
    name: "Scala",
    import: (() =>
      import("@shikijs/langs/scala")) as DynamicImportLanguageRegistration,
  },
  {
    id: "scss",
    name: "SCSS",
    import: (() =>
      import("@shikijs/langs/scss")) as DynamicImportLanguageRegistration,
  },
  {
    id: "shellscript",
    name: "Shell",
    aliases: ["bash", "sh", "shell", "zsh"],
    import: (() =>
      import(
        "@shikijs/langs/shellscript"
      )) as DynamicImportLanguageRegistration,
  },
  {
    id: "sql",
    name: "SQL",
    import: (() =>
      import("@shikijs/langs/sql")) as DynamicImportLanguageRegistration,
  },
  {
    id: "swift",
    name: "Swift",
    import: (() =>
      import("@shikijs/langs/swift")) as DynamicImportLanguageRegistration,
  },
  {
    id: "terraform",
    name: "Terraform",
    aliases: ["tf", "tfvars"],
    import: (() =>
      import("@shikijs/langs/terraform")) as DynamicImportLanguageRegistration,
  },
  {
    id: "toml",
    name: "TOML",
    import: (() =>
      import("@shikijs/langs/toml")) as DynamicImportLanguageRegistration,
  },
  {
    id: "tsx",
    name: "TSX",
    import: (() =>
      import("@shikijs/langs/tsx")) as DynamicImportLanguageRegistration,
  },
  {
    id: "typescript",
    name: "TypeScript",
    aliases: ["ts"],
    import: (() =>
      import("@shikijs/langs/typescript")) as DynamicImportLanguageRegistration,
  },
  {
    id: "vue",
    name: "Vue",
    import: (() =>
      import("@shikijs/langs/vue")) as DynamicImportLanguageRegistration,
  },
  {
    id: "wasm",
    name: "WebAssembly",
    import: (() =>
      import("@shikijs/langs/wasm")) as DynamicImportLanguageRegistration,
  },
  {
    id: "xml",
    name: "XML",
    import: (() =>
      import("@shikijs/langs/xml")) as DynamicImportLanguageRegistration,
  },
  {
    id: "yaml",
    name: "YAML",
    aliases: ["yml"],
    import: (() =>
      import("@shikijs/langs/yaml")) as DynamicImportLanguageRegistration,
  },
];

export const bundledLanguagesBase = Object.fromEntries(
  bundledLanguagesInfo.map((i) => [i.id, i.import]),
);

export const bundledLanguagesAlias = Object.fromEntries(
  bundledLanguagesInfo.flatMap(
    (i) => i.aliases?.map((a) => [a, i.import]) || [],
  ),
);

export type BundledLanguage =
  | "apache"
  | "batch"
  | "bat"
  | "c"
  | "clj"
  | "clojure"
  | "c++"
  | "cpp"
  | "c#"
  | "cs"
  | "csharp"
  | "css"
  | "dart"
  | "diff"
  | "docker"
  | "dockerfile"
  | "go"
  | "gql"
  | "graphql"
  | "html"
  | "java"
  | "javascript"
  | "js"
  | "json"
  | "jsonc"
  | "jsx"
  | "kt"
  | "kts"
  | "kotlin"
  | "less"
  | "lua"
  | "make"
  | "makefile"
  | "markdown"
  | "md"
  | "nginx"
  | "objc"
  | "objective-c"
  | "perl"
  | "php"
  | "ps"
  | "ps1"
  | "powershell"
  | "prisma"
  | "python"
  | "py"
  | "rb"
  | "ruby"
  | "rust"
  | "rs"
  | "sass"
  | "scala"
  | "scss"
  | "sh"
  | "shell"
  | "shellscript"
  | "bash"
  | "sh"
  | "shell"
  | "zsh"
  | "sql"
  | "swift"
  | "tf"
  | "tfvars"
  | "terraform"
  | "toml"
  | "tsx"
  | "ts"
  | "typescript"
  | "vue"
  | "wasm"
  | "xml"
  | "yaml"
  | "yml"
  | "zsh";

export const bundledLanguages = {
  ...bundledLanguagesBase,
  ...bundledLanguagesAlias,
} as Record<BundledLanguage, DynamicImportLanguageRegistration>;
