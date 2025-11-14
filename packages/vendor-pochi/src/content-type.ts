const ContentType = {
  gemini: [
    // https://ai.google.dev/gemini-api/docs/image-understanding#supported-formats
    "image/png",
    "image/jpeg",
    "image/webp",
    "image/heic",
    "image/heif",

    // https://ai.google.dev/gemini-api/docs/video-understanding#supported-formats
    "video/mp4",
    "video/mpeg",
    "video/mov",
    "video/avi",
    "video/x-flv",
    "video/mpg",
    "video/webm",
    "video/wmv",
    "video/3gpp",

    // https://ai.google.dev/gemini-api/docs/audio#supported-formats
    "audio/wav",
    "audio/mp3",
    "audio/aiff",
    "audio/aac",
    "audio/ogg",
    "audio/flac",

    // https://ai.google.dev/gemini-api/docs/document-processing#document-types
    "application/pdf",
  ],
  claude: [
    // https://docs.claude.com/en/docs/build-with-claude/vision#ensuring-image-quality
    // https://docs.claude.com/en/api/messages-examples#vision
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",

    // https://docs.claude.com/en/docs/build-with-claude/pdf-support#option-2%3A-base64-encoded-pdf-document
    "application/pdf",
  ],
  gpt: [
    // https://platform.openai.com/docs/guides/images-vision#image-input-requirements
    // https://platform.openai.com/docs/models/gpt-5.1-codex
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",

    // https://platform.openai.com/docs/guides/pdf-files#base64-encoded-files
    "application/pdf",
  ],

  // other pochi models only support text input, e.g., kimi-k2, glm-4.6, qwen3-coder and grok-code-fask-1
};

export const getContentTypesForModel = (
  modelId: string,
): string[] | undefined => {
  if (modelId.includes("google/gemini")) {
    return ContentType.gemini;
  }
  if (modelId.includes("anthropic/claude")) {
    return ContentType.claude;
  }
  if (modelId.includes("openai/gpt")) {
    return ContentType.gpt;
  }
};
