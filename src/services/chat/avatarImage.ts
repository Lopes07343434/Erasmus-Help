/**
 * Profile / group photos: whatever the user picks (JPEG, PNG, WebP, a large camera photo…) is decoded in the
 * browser, centre-cropped to a square, shrunk to CHAT_LIMITS.avatarSizePx and re-encoded as JPEG. The upload is
 * therefore small (≈30–80 KB), has no EXIF metadata (location!) and always matches the bucket's allowed types.
 */
import { AppError } from '@/services/errors'
import { CHAT_LIMITS } from './types'

const JPEG_QUALITY = 0.86

/** Throws AppError('invalid-input') for non-images / unreadable or huge files, 'not-supported' without canvas. */
export async function prepareAvatarImage(file: Blob, size: number = CHAT_LIMITS.avatarSizePx): Promise<Blob> {
  if (!file.type.startsWith('image/') || file.size === 0 || file.size > CHAT_LIMITS.avatarSourceMaxBytes) throw new AppError('invalid-input')
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') throw new AppError('not-supported')

  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch (err) {
    // e.g. HEIC on a browser that cannot decode it
    throw new AppError('invalid-input', err)
  }
  try {
    const side = Math.min(bitmap.width, bitmap.height)
    if (!(side >= 1)) throw new AppError('invalid-input')
    const out = Math.min(size, side)
    const canvas = document.createElement('canvas')
    canvas.width = out
    canvas.height = out
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new AppError('not-supported')
    // Transparent PNGs become white instead of black once encoded as JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, out, out)
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, out, out)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
    if (!blob || blob.type !== 'image/jpeg') throw new AppError('not-supported')
    if (blob.size > CHAT_LIMITS.avatarMaxBytes) throw new AppError('invalid-input')
    return blob
  } finally {
    bitmap.close()
  }
}
