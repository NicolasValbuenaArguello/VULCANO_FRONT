export interface AuthUser {
  id: number;
  usuario: string;
  rol: string;
}

export interface LoginRequest {
  usuario: string;
  password: string;
}

export interface LoginResponse {
  ok?: boolean;
  message?: string;
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  api_key?: string;
  usuario?: AuthUser;
  user?: unknown;
  permisos_especiales?: unknown[];
}

export interface AuthSession {
  accessToken: string;
  user: AuthUser | null;
  apiKey?: string | null;
  tokenType?: string;
  expiresAt?: number | null;
}
