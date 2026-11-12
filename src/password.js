// Cloudflare WebCrypto limita a derivação PBKDF2 a 100.000 iterações por chamada.
export const PBKDF2_ITERATIONS = 100000;
export async function hashPassword(password, salt) {
  const encoding = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoding.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bytes = await crypto.subtle.deriveBits(
    {name: 'PBKDF2', salt: encoding.encode(salt), iterations: PBKDF2_ITERATIONS, hash: 'SHA-256'},
    key,
    256
  );
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
