import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV2 } from "@ai-sdk/provider";
import type { CreateModelOptions } from "@getpochi/common/vendor/edge";
import { wrapLanguageModel } from "ai";
import type { QwenCoderCredentials } from "./types";

// Qwen 模型常量
export const MAINLINE_VLM = "vision-model";
export const MAINLINE_CODER = "coder-model";

// Qwen 系统提示词
const QwenCoderSystemPrompt = 
  "You are Qwen Code, an AI assistant for coding tasks.";

// Qwen API 默认端点
const DEFAULT_QWEN_BASE_URL = "https://dashscope.aliyuncs.com/compatible-mode/v1";

// Qwen 模型映射
export const ModelIdMap: Record<string, string> = {
  // 根据 Qwen 的实际模型 ID 进行映射
  "vision-model": "qwen-vl-max",
  "coder-model": "qwen-coder-turbo",
};

/**
 * 为 Qwen API 添加认证头
 */
function addQwenHeaders(
  headers: Headers,
  credentials?: QwenCoderCredentials,
): void {
  if (credentials?.access_token) {
    headers.set("authorization", `Bearer ${credentials.access_token}`);
  }
  // 移除可能冲突的 API key header
  headers.delete("x-api-key");
  headers.delete("api-key");
}

/**
 * 获取当前的 Qwen API 端点
 */
function getCurrentEndpoint(credentials?: QwenCoderCredentials): string {
  // 如果 credentials 中包含 resource_url，使用它
  if (credentials && 'resource_url' in credentials && credentials.resource_url) {
    const baseEndpoint = credentials.resource_url;
    const suffix = '/v1/chat/completions';
    
    // 规范化 URL：添加协议，确保 /v1 后缀
    const normalizedUrl = baseEndpoint.startsWith('http')
      ? baseEndpoint
      : `https://${baseEndpoint}`;
    
    return normalizedUrl.endsWith(suffix)
      ? normalizedUrl
      : `${normalizedUrl}${suffix}`;
  }
  
  return DEFAULT_QWEN_BASE_URL;
}

/**
 * 创建 Qwen 模型基础实例
 */
function createQwenCoderModelBase(
  modelId: string,
  baseURL: string,
  customFetch: (
    input: string | URL | Request,
    init?: RequestInit,
  ) => Promise<Response>,
): LanguageModelV2 {
  const actualModelId = ModelIdMap[modelId] || modelId;

  // 使用 OpenAI SDK 因为 Qwen 是 OpenAI 兼容的
  const qwen = createOpenAI({
    baseURL,
    apiKey: "oauth-token", // 占位符，实际 token 在 headers 中
    fetch: customFetch as typeof fetch,
  });

  const model = qwen(actualModelId);

  return wrapLanguageModel({
    model,
    middleware: {
      middlewareVersion: "v2",
      async transformParams({ params }) {
        // 添加系统提示词
        params.prompt = [
          {
            role: "system",
            content: QwenCoderSystemPrompt,
          },
          ...params.prompt,
        ];
        
        // 设置 Qwen 特定的参数
        return {
          ...params,
          maxOutputTokens: params.maxOutputTokens || 8192,
          temperature: params.temperature ?? 0.7,
          topP: params.topP ?? 0.9,
        };
      },
    },
  });
}

/**
 * 创建带认证的 fetch 函数
 */
function createPatchedFetch(
  getCredentials: () => Promise<QwenCoderCredentials>,
) {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const credentials = await getCredentials();
    const headers = new Headers(init?.headers);

    addQwenHeaders(headers, credentials);

    // 动态获取端点
    const baseURL = getCurrentEndpoint(credentials);
    
    // 如果输入是字符串或 URL，可能需要替换 baseURL
    let finalUrl = input;
    if (typeof input === 'string' || input instanceof URL) {
      const inputUrl = new URL(input.toString());
      // 如果是相对路径或需要替换域名
      if (inputUrl.hostname === 'api.anthropic.com' || 
          inputUrl.hostname === 'localhost') {
        const newUrl = new URL(inputUrl.pathname + inputUrl.search, baseURL);
        finalUrl = newUrl.toString();
      }
    }

    return fetch(finalUrl, { ...init, headers });
  };
}

/**
 * 创建代理 fetch 函数（用于边缘环境）
 */
function createProxyFetch(
  getCredentials: () => Promise<QwenCoderCredentials | undefined>,
) {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const originalUrl = new URL(input.toString());
    
    // 使用本地代理服务器
    const url = new URL(originalUrl.pathname + originalUrl.search);
    url.protocol = "http:";
    url.host = "localhost";
    url.port = "54343";

    const credentials = await getCredentials();
    const headers = new Headers(init?.headers);

    addQwenHeaders(headers, credentials);
    
    // 获取实际的 Qwen 端点
    const baseURL = getCurrentEndpoint(credentials);
    const targetUrl = new URL(originalUrl.pathname + originalUrl.search, baseURL);
    headers.set("x-proxy-origin", targetUrl.toString());

    return fetch(url, {
      ...init,
      headers,
    });
  };
}

/**
 * 创建 Qwen 模型实例
 */
export function createQwenCoderModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const customFetch = createPatchedFetch(
    getCredentials as () => Promise<QwenCoderCredentials>,
  );

  // 使用默认 URL 初始化，实际请求时会被 customFetch 替换
  return createQwenCoderModelBase(
    modelId,
    "https://placeholder.qwen.ai/v1",
    customFetch,
  );
}

/**
 * 创建边缘环境的 Qwen 模型实例
 */
export function createEdgeQwenCoderModel({
  modelId,
  getCredentials,
}: CreateModelOptions): LanguageModelV2 {
  const customFetch = createProxyFetch(
    getCredentials as () => Promise<QwenCoderCredentials>,
  );

  return createQwenCoderModelBase(
    modelId,
    DEFAULT_QWEN_BASE_URL, // 会被 proxy 替换
    customFetch,
  );
}

/**
 * 获取支持的 Qwen 模型列表
 */
export function getSupportedQwenModels(): string[] {
  return [
    MAINLINE_VLM,
    MAINLINE_CODER,
    ...Object.keys(ModelIdMap),
  ];
}

/**
 * 检查模型 ID 是否被支持
 */
export function isModelSupported(modelId: string): boolean {
  return getSupportedQwenModels().includes(modelId) || 
         modelId in ModelIdMap;
}