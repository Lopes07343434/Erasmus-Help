import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { prepareAvatarImage } from './avatarImage'
import { CHAT_LIMITS } from './types'

interface DrawCall {
  args: number[]
}

let draws: DrawCall[]
let toBlobType: string | null
let closed: number

beforeEach(() => {
  draws = []
  toBlobType = 'image/jpeg'
  closed = 0
  vi.stubGlobal(
    'createImageBitmap',
    vi.fn((file: Blob) =>
      file.size === 13 ? Promise.reject(new Error('undecodable')) : Promise.resolve({ width: 1200, height: 800, close: () => (closed += 1) }),
    ),
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
    () =>
      ({
        fillRect: () => undefined,
        drawImage: (...args: number[]) => draws.push({ args: args.slice(1) }),
        set fillStyle(_v: string) {},
        set imageSmoothingEnabled(_v: boolean) {},
        set imageSmoothingQuality(_v: string) {},
      }) as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb: BlobCallback, type?: string) {
    cb(toBlobType ? new Blob([`${this.width}x${this.height}`], { type: toBlobType ?? type }) : null)
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const photo = (bytes = 'photo-bytes', type = 'image/png') => new Blob([bytes], { type })

describe('prepareAvatarImage', () => {
  it('centre-crops to a square, shrinks to 512 px and re-encodes as JPEG', async () => {
    const out = await prepareAvatarImage(photo())
    expect(out.type).toBe('image/jpeg')
    expect(await out.text()).toBe(`${CHAT_LIMITS.avatarSizePx}x${CHAT_LIMITS.avatarSizePx}`)
    // 1200×800 → the centred 800×800 square
    expect(draws[0]?.args).toEqual([200, 0, 800, 800, 0, 0, 512, 512])
    expect(closed).toBe(1)
  })

  it('rejects what is not a usable image', async () => {
    await expect(prepareAvatarImage(new Blob(['%PDF'], { type: 'application/pdf' }))).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(prepareAvatarImage(new Blob([], { type: 'image/png' }))).rejects.toMatchObject({ code: 'invalid-input' })
    await expect(prepareAvatarImage(photo('x'.repeat(13)))).rejects.toMatchObject({ code: 'invalid-input' }) // cannot be decoded
    const huge = { type: 'image/jpeg', size: CHAT_LIMITS.avatarSourceMaxBytes + 1 } as Blob
    await expect(prepareAvatarImage(huge)).rejects.toMatchObject({ code: 'invalid-input' })
  })

  it('reports browsers that cannot re-encode', async () => {
    toBlobType = 'image/png' // canvas ignored the JPEG request
    await expect(prepareAvatarImage(photo())).rejects.toMatchObject({ code: 'not-supported' })
    vi.stubGlobal('createImageBitmap', undefined)
    await expect(prepareAvatarImage(photo())).rejects.toMatchObject({ code: 'not-supported' })
  })
})
