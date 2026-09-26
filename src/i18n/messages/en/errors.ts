import type { NamespaceShape } from '../../types'

const errors: NamespaceShape<'errors'> = {
  offline: { title: 'No internet connection', body: 'Check your connection and try again.' },
  timeout: { title: 'This is taking too long', body: "The service didn't respond in time. Please try again." },
  unavailable: { title: 'Service unavailable', body: "We couldn't reach the service. Try again in a moment." },
  notConfigured: { title: 'Not available yet', body: "This feature isn't enabled in this version yet." },
  notSupported: { title: 'Not supported on this device', body: "Your browser doesn't support this feature. Try Chrome, Edge or Safari." },
  permissionDenied: { title: 'Permission denied', body: 'Allow the permission in your browser settings to continue.' },
  noSpeech: { title: "We didn't hear anything", body: 'Speak a little closer to the microphone and try again.' },
  invalidInput: { title: 'Invalid data', body: 'Please check what you entered.' },
  notFound: { title: 'Not found', body: "We couldn't find what you were looking for." },
  rateLimited: { title: 'Too many requests', body: 'Wait a moment and try again.' },
  aborted: { title: 'Cancelled', body: 'The operation was cancelled.' },
  unknown: { title: 'Something went wrong', body: 'Please try again. If the problem persists, restart the app.' },
}
export default errors
