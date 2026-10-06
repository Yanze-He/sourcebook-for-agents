import https from 'node:https';
import { lookup } from 'node:dns';
import { isIP } from 'node:net';

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;

function publicAddress(address) {
  if (isIP(address) !== 4) return false;
  const [a,b] = address.split('.').map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127));
}

// Resolve and validate the exact address used by the TLS connection, including redirects.
export async function downloadImage(value, redirects = 0) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) throw new Error('图片需要公开的 HTTPS 地址');
  if (isIP(url.hostname) && !publicAddress(url.hostname)) throw new Error('不支持内部网络图片地址');
  if (redirects > 4) throw new Error('图片重定向次数过多');
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15",
        accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        referer: url.origin + "/",
      },
      family: 4,
      lookup(host, options, callback) {
        lookup(host, { family: 4 }, (error, address, family) => {
          if (error) return callback(error);
          if (!publicAddress(address)) return callback(new Error('不支持内部网络图片地址'));
          callback(null, address, family);
        });
      },
    }, (response) => {
      if ([301,302,303,307,308].includes(response.statusCode)) {
        response.resume();
        try { resolve(downloadImage(new URL(response.headers.location, url).href, redirects + 1)); } catch (error) { reject(error); }
        return;
      }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`图片下载失败（${response.statusCode}）`)); return; }
      const chunks = []; let size = 0;
      response.on('data', chunk => {
        size += chunk.length;
        if (size > MAX_MEDIA_BYTES) request.destroy(new Error('图片超过 20 MB'));
        else chunks.push(chunk);
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const bytes = Buffer.concat(chunks);
          resolve({ bytes, ...imageType(bytes) });
        } catch (error) { reject(error); }
      });
    });
    request.setTimeout(15000, () => request.destroy(new Error('图片下载超时，请重试')));
    request.on('error', reject);
  });
}

export function imageType(bytes) {
  if (bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return {mime:'image/png', ext:'.png'};
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) return {mime:'image/jpeg', ext:'.jpg'};
  if (/^GIF8[79]a/.test(bytes.subarray(0,6).toString())) return {mime:'image/gif', ext:'.gif'};
  if (bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP') return {mime:'image/webp', ext:'.webp'};
  throw new Error('仅支持 PNG、JPEG、GIF、WebP 图片');
}
