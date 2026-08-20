import { generateKeyPairSync } from 'node:crypto';

function fromBase64Url(value) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4);
  return Buffer.from((value + padding).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
if (!jwk.x || !jwk.y || !jwk.d) throw new Error('Failed to export P-256 VAPID key material.');
const publicKey = Buffer.concat([Buffer.from([0x04]), fromBase64Url(jwk.x), fromBase64Url(jwk.y)]).toString('base64url');
const privateKeyRaw = fromBase64Url(jwk.d).toString('base64url');

console.log(`VITE_WEB_PUSH_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKeyRaw}`);
console.log('VAPID_SUBJECT=mailto:admin@docbd.info');
