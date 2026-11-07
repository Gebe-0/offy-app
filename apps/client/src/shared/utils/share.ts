// Base URL pública do redirecionador de compartilhamento do OFFY
export const SHARE_BASE_URL = "https://api.cloudfy.shop";

export type ShareEntityType = "artist" | "album" | "playlist" | "track";

/**
 * Constrói o link público de compartilhamento web (https://api.cloudfy.shop/track?id=...).
 * Quando acessado no navegador, este link exibe o card do OFFY e redireciona automaticamente
 * para o protocolo desktop nativo (offy://).
 */
export function buildShareUrl(type: ShareEntityType, id: string): string {
  return `${SHARE_BASE_URL}/${type}?id=${encodeURIComponent(id)}`;
}

/**
 * Constrói o protocolo direto para o aplicativo desktop (ex: offy://track?id=...)
 */
export function buildAppDeepLink(type: ShareEntityType, id: string): string {
  return `offy://${type}?id=${encodeURIComponent(id)}`;
}

