import type { NamespaceShape } from '../../types'

const common: NamespaceShape<'common'> = {
  appName: 'Erasmus Help',
  tagline: 'Support for Erasmus students',
  actions: {
    continue: 'Continue',
    back: 'Back',
    close: 'Close',
    save: 'Save',
    cancel: 'Cancel',
    retry: 'Try again',
    skip: 'Skip',
    start: 'Get started',
    confirm: 'Confirm',
    copy: 'Copy',
    copied: 'Copied',
    listen: 'Listen',
    stop: 'Stop',
    edit: 'Edit',
    change: 'Change',
    notNow: 'Not now',
    clear: 'Clear',
    reload: 'Reload',
    seeAll: 'See all',
  },
  a11y: {
    skipToContent: 'Skip to content',
  },
  status: {
    loading: 'Loading…',
    offline: 'Offline',
    offlineBody: "You're offline. Some features will return when you reconnect.",
    backOnline: 'Back online',
  },
  roles: {
    student: 'Student',
    monitor: 'Monitor',
  },
}
export default common
