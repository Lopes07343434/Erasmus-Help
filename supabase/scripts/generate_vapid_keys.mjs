// Generates a Web Push VAPID key pair (P-256). Usage: node supabase/scripts/generate_vapid_keys.mjs
// Public key  → VITE_VAPID_PUBLIC_KEY (frontend build) and VAPID_PUBLIC_KEY (function secret).
// Private key → ONLY as a function secret (`supabase secrets set VAPID_PRIVATE_KEY=…`). Never commit it, never put it in VITE_*.
import { generateKeyPairSync } from 'node:crypto'

const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const pub = publicKey.export({ format: 'jwk' })
const priv = privateKey.export({ format: 'jwk' })
const b64url = (b64) => b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const bytes = (v) => Buffer.from(v.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

const publicKeyB64 = b64url(Buffer.concat([Buffer.from([0x04]), bytes(pub.x), bytes(pub.y)]).toString('base64'))
const privateKeyB64 = b64url(bytes(priv.d).toString('base64'))

console.log(`VAPID_PUBLIC_KEY=${publicKeyB64}`)
console.log(`VAPID_PRIVATE_KEY=${privateKeyB64}`)
console.log('\nKeep the private key secret. The public key is public by design.')
