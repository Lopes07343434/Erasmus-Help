import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

/**
 * PWA icons generated from the official vector mark (do NOT redesign it).
 * Run `npm run generate-pwa-assets`; output is written next to the source image (public/brand/).
 *
 * Padding = fraction of the icon NOT used by the mark (the mark is fit into (1 - padding) × size):
 * - transparent ("any"): 0.05 → mark almost edge to edge on a transparent canvas.
 * - maskable: 0.42 → the mark's corners stay ~13 px inside the 80 % safe-zone circle at 512 px
 *   (mark half-diagonal ≈ 0.644 × rendered width must be ≤ 0.4 × size ⇒ padding ≥ 0.38).
 * - apple: 0.3 on the light app background (iOS fills transparency with black).
 */
const LIGHT_BACKGROUND = '#F3F4F8'

export default defineConfig({
  headLinkOptions: { preset: '2023', basePath: '/brand/' },
  preset: {
    ...minimal2023Preset,
    // Truecolor PNG: the default (quality 60) quantises to a palette and bands the mark's gradients.
    png: { compressionLevel: 9, palette: false },
    transparent: { ...minimal2023Preset.transparent, padding: 0.05 },
    maskable: {
      ...minimal2023Preset.maskable,
      padding: 0.42,
      resizeOptions: { fit: 'contain', background: LIGHT_BACKGROUND },
    },
    apple: {
      ...minimal2023Preset.apple,
      padding: 0.3,
      resizeOptions: { fit: 'contain', background: LIGHT_BACKGROUND },
    },
  },
  images: ['public/brand/eh-mark.svg'],
})
