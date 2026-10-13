// SHA-256 (FIPS 180-4), computed synchronously, for keys the drawing code needs at once (R3c: script results are
// keyed by the SHA-256 of the numbers passed). Files are hashed with crypto.subtle (storage/json.ts).

const primes = (n: number) => { const p: number[] = []; for (let k = 2; p.length < n; k++) if (p.every(q => k % q)) p.push(k); return p; };
const frac = (v: number) => ((v - Math.floor(v)) * 2 ** 32) >>> 0;
const K = Uint32Array.from(primes(64), p => frac(Math.cbrt(p)));
const H0 = Uint32Array.from(primes(8), p => frac(Math.sqrt(p)));
const rotr = (v: number, n: number) => (v >>> n) | (v << (32 - n));

export function sha256Bytes(data: Uint8Array): string {
  const len = data.length, size = Math.ceil((len + 9) / 64) * 64, m = new Uint8Array(size);
  m.set(data);
  m[len] = 0x80;
  const dv = new DataView(m.buffer);
  dv.setUint32(size - 8, Math.floor(len / 0x20000000));
  dv.setUint32(size - 4, (len * 8) >>> 0);
  const h = H0.slice(), w = new Uint32Array(64);
  for (let o = 0; o < size; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15], b = w[i - 2];
      w[i] = (rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)) + w[i - 7] + (rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)) + w[i - 16];
    }
    let [A, B, C, D, E, F, G, H] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (H + (rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25)) + ((E & F) ^ (~E & G)) + K[i] + w[i]) | 0;
      const t2 = ((rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22)) + ((A & B) ^ (A & C) ^ (B & C))) | 0;
      H = G; G = F; F = E; E = (D + t1) | 0; D = C; C = B; B = A; A = (t1 + t2) | 0;
    }
    h[0] += A; h[1] += B; h[2] += C; h[3] += D; h[4] += E; h[5] += F; h[6] += G; h[7] += H;
  }
  return Array.from(h, v => v.toString(16).padStart(8, '0')).join('');
}

export const sha256Text = (s: string) => sha256Bytes(new TextEncoder().encode(s));
