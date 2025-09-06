import type { GeminiCliVendorConfig } from "@getpochi/common/configuration";

// Types for Cloud Code Assist API
export interface ClientMetadata {
  ideType?: string;
  ideVersion?: string;
  pluginVersion?: string;
  platform?: string;
  updateChannel?: string;
  duetProject?: string;
  pluginType?: string;
  ideName?: string;
}

export interface LoadCodeAssistRequest {
  cloudaicompanionProject?: string;
  metadata: ClientMetadata;
}

export interface LoadCodeAssistResponse {
  currentTier?: GeminiUserTier | null;
  allowedTiers?: GeminiUserTier[] | null;
  cloudaicompanionProject?: string | null;
}

export interface GeminiUserTier {
  id: string;
  name: string;
  description: string;
  userDefinedCloudaicompanionProject?: boolean | null;
  isDefault?: boolean;
  hasAcceptedTos?: boolean;
  hasOnboardedPreviously?: boolean;
}

export interface OnboardUserRequest {
  tierId: string;
  cloudaicompanionProject?: string;
  metadata: ClientMetadata;
}

export interface LongrunningOperationResponse {
  name: string;
  done?: boolean;
  response?: {
    cloudaicompanionProject?: {
      id: string;
      name: string;
    };
  };
  error?: {
    code: number;
    message: string;
  };
}

export type GeminiCredentials = GeminiCliVendorConfig["credentials"];

export interface GeminiOAuthResult {
  authUrl: string;
  port: number;
  loginCompletePromise: Promise<GeminiCredentials>;
}
