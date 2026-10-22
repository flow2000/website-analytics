/**
 * 认证与安全工具（Workers 版，WebCrypto 实现，零依赖）
 * - PBKDF2 密码哈希 / 校验
 * - RFC 6238 TOTP（认证器 App 二次验证）
 * - HMAC-SHA256 签名 Cookie（wa_auth）
 * - 全局访问模式判定（none / password / totp）
 */

import { getSetting, setSetting, ensureSchema } from './d1.js';

const enc = new TextEncoder();
const dec = new TextDecoder();

// ==================== 基础编码 ====================

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function bytesToBase32(bytes) {
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32_ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32ToBytes(b32) {
  const s = String(b32).toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of s) {
    value = (value << 5) | B32_ALPHABET.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function randomBytes(n) {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

// ==================== HMAC / 签名 Cookie ====================

async function hmacKey(secretHex, algo = 'SHA-256') {
  return crypto.subtle.importKey('raw', hexToBytes(secretHex), { name: 'HMAC', hash: algo }, false, ['sign', 'verify']);
}

async function hmacSign(secretHex, msg, algo = 'SHA-256') {
  const key = await hmacKey(secretHex, algo);
  return bytesToHex(new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg))));
}

async function hmacVerify(secretHex, msg, sigHex, algo = 'SHA-256') {
  const key = await hmacKey(secretHex, algo);
  const expected = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
  const got = hexToBytes(sigHex);
  if (expected.length !== got.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected[i] ^ got[i];
  return diff === 0;
}

/** 获取/生成 Cookie 签名密钥（存 D1 settings.cookie_secret，32字节随机） */
export async function getCookieSecret(env) {
  await ensureSchema(env);
  let secret = await getSetting(env, 'cookie_secret');
  if (!secret) {
    secret = bytesToHex(randomBytes(32));
    await setSetting(env, 'cookie_secret', secret);
  }
  return secret;
}

/** 签发访问 Cookie：v1.<expires>.<sig> */
export async function makeAuthCookie(env, ttlDays = 7) {
  const secret = await getCookieSecret(env);
  const expires = Math.floor(Date.now() / 1000) + ttlDays * 86400;
  const sig = await hmacSign(secret, `wa_auth:${expires}:viewer`);
  return `wa_auth=v1.${expires}.${sig}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${ttlDays * 86400}`;
}

/** 校验 Cookie 是否有效 */
export async function checkAuthCookie(env, cookieHeader) {
  const m = /wa_auth=v1\.(\d+)\.([0-9a-f]+)/.exec(cookieHeader || '');
  if (!m) return false;
  const [, expires, sig] = m;
  const now = Math.floor(Date.now() / 1000);
  if (Number(expires) < now) return false;
  const secret = await getCookieSecret(env);
  return hmacVerify(secret, `wa_auth:${expires}:viewer`, sig);
}

// ==================== 全局访问模式 ====================

export const ACCESS_NONE = 'none';
export const ACCESS_PASSWORD = 'password';
export const ACCESS_TOTP = 'totp';

export async function getAccessMode(env) {
  await ensureSchema(env);
  const mode = await getSetting(env, 'access_mode');
  if (mode === ACCESS_PASSWORD || mode === ACCESS_TOTP) return mode;
  return ACCESS_NONE;
}

/**
 * 数据接口访问判定：
 * - mode none → 放行
 * - mode password/totp → 校验签名 Cookie
 */
export async function isDataAccessAllowed(env, request) {
  const mode = await getAccessMode(env);
  if (mode === ACCESS_NONE) return true;
  return checkAuthCookie(env, request.headers.get('Cookie'));
}

// ==================== PBKDF2 密码 ====================

const PBKDF2_ITERATIONS = 100000;

export async function hashPassword(password) {
  const salt = bytesToHex(randomBytes(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(salt), iterations: PBKDF2_ITERATIONS },
    key, 256
  );
  return { salt, hash: bytesToHex(new Uint8Array(bits)) };
}

export async function verifyPassword(password, saltHex, hashHex) {
  if (!password || !saltHex || !hashHex) return false;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: hexToBytes(saltHex), iterations: PBKDF2_ITERATIONS },
    key, 256
  );
  const got = bytesToHex(new Uint8Array(bits));
  // 常量时间比较
  if (got.length !== hashHex.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got.charCodeAt(i) ^ hashHex.charCodeAt(i);
  return diff === 0;
}

// ==================== TOTP (RFC 6238) ====================

export function generateTotpSecret() {
  return bytesToBase32(randomBytes(20)); // 160-bit → 32 字符
}

export function otpauthUrl(secretBase32, label = 'Cloudflare Analytics', issuer = 'website-analytics') {
  return `otpauth://totp/${encodeURIComponent(label)}?secret=${secretBase32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

async function totpAt(secretBase32, counter) {
  const secretBytes = base32ToBytes(secretBase32);
  const key = await crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const buf = new Uint8Array(8);
  let c = typeof counter === 'bigint' ? counter : BigInt(counter);
  for (let i = 7; i >= 0; i--) { buf[i] = Number(c & 0xffn); c >>= 8n; }
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, buf));
  const offset = mac[mac.length - 1] & 0x0f;
  const code = ((mac[offset] & 0x7f) << 24) | (mac[offset + 1] << 16) | (mac[offset + 2] << 8) | mac[offset + 3];
  return String(code % 1000000).padStart(6, '0');
}

/** 校验 6 位验证码（±1 个 30s 窗口） */
export async function verifyTotp(secretBase32, code) {
  if (!code || !/^\d{6}$/.test(String(code))) return false;
  const nowCounter = Math.floor(Date.now() / 1000 / 30);
  for (let d = -1; d <= 1; d++) {
    if ((await totpAt(secretBase32, nowCounter + d)) === String(code)) return true;
  }
  return false;
}