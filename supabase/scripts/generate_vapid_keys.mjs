// Generates the VAPID key pair used for Web Push (no dependencies): node supabase/scripts/generate_vapid_keys.mjs
//   public key  → frontend build variable VITE_VAPID_PUBLIC_KEY (public by design) AND secret VAPID_PUBLIC_KEY
//   private key → ONLY the Supabase secret VAPID_PRIVATE_KEY. Never commit it, never put it in a VITE_* variable.
// Keep the pair: if it changes, every device must subscribe again (the app does that automatically on the next open).
import { createECDH } from 'node:crypto'

const ecdh = createECDH('prime256v1')
ecdh.generateKeys()
const b64url = (buffer) => buffer.toString('base64url')
// The private scalar must be exactly 32 bytes (Node may drop leading zero bytes).
const privateKey = ecdh.getPrivateKey()
const padded = Buffer.concat([Buffer.alloc(32 - privateKey.length), privateKey])

console.log(`VAPID_PUBLIC_KEY=${b64url(ecdh.getPublicKey())}`)
console.log(`VAPID_PRIVATE_KEY=${b64url(padded)}`)
console.log('\nPublic → GitHub Actions variable VITE_VAPID_PUBLIC_KEY + Supabase secret VAPID_PUBLIC_KEY.')
console.log('Private → Supabase secret VAPID_PRIVATE_KEY only.')
