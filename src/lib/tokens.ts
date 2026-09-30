/**
 * Utilitários para geração e validação de tokens de acesso
 */

/**
 * Gera um token seguro de acompanhamento usando UUID v4.
 * Criptograficamente seguro via Web Crypto / Node crypto module.
 */
export function gerarTokenAcompanhamento(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback seguro usando crypto.getRandomValues se randomUUID não estiver disponível
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    bytes[6] = (bytes[6] & 0x0f) | 0x40; // Versão 4
    bytes[8] = (bytes[8] & 0x3f) | 0x80; // Variante RFC4122
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  throw new Error('Ambiente não possui API de criptografia segura (crypto)');
}

/**
 * Valida o formato de um token de acompanhamento.
 * Aceita UUIDs v4 (novos tokens seguros) e tokens legados alfanuméricos.
 */
export function validarFormatoToken(token: string | null | undefined): boolean {
  if (!token || typeof token !== 'string') {
    return false;
  }

  const tokenTrim = token.trim();
  if (tokenTrim.length < 8 || tokenTrim.length > 64) {
    return false;
  }

  // Regex para UUID (ex: 123e4567-e89b-12d3-a456-426614174000)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  // Regex para tokens alfanuméricos legados (ex: Math.random + Date.now)
  const legadoRegex = /^[a-z0-9]{8,64}$/i;

  return uuidRegex.test(tokenTrim) || legadoRegex.test(tokenTrim);
}
