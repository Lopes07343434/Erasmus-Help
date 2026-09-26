/**
 * Photo URLs. Photos live in the public bucket `avatars` under random object names, so the URL of a path never
 * changes (a new photo = a new path) and can be cached forever by the browser and here.
 */
import { avatarPublicUrl } from './repository'

const urls = new Map<string, string | null>()

/** Public URL of a photo path (profile or group), or null (no photo / chat not configured). No request. */
export function avatarUrl(path: string | null | undefined): string | null {
  if (!path) return null
  let url = urls.get(path)
  if (url === undefined) {
    url = avatarPublicUrl(path)
    urls.set(path, url)
  }
  return url
}

/** Object path for a new photo: `users/{userId}/{uuid}.jpg` or `groups/{conversationId}/{uuid}.jpg`. */
export function newAvatarPath(scope: 'users' | 'groups', ownerId: string): string {
  return `${scope}/${ownerId}/${crypto.randomUUID()}.jpg`
}
