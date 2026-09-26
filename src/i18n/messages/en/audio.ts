import type { NamespaceShape } from '../../types'

const audio: NamespaceShape<'audio'> = {
  mic: {
    record: 'Record voice message',
    requesting: 'Requesting microphone access…',
    unsupported: "This browser can't record voice messages",
  },
  recorder: {
    recording: 'Recording',
    requesting: 'Requesting access…',
    stopping: 'Finishing the recording…',
    recordingFor: 'Recording: {time}',
    cancel: 'Cancel recording',
    stop: 'Stop recording',
    send: 'Send voice message',
    remaining: '{seconds} s left',
    limitSoon: 'Recording stops automatically in {seconds} seconds',
    limit_one: '{count}-minute limit',
    limit_few: '{count}-minute limit',
    limit_many: '{count}-minute limit',
    limit_other: '{count}-minute limit',
  },
  player: {
    play: 'Play voice message',
    pause: 'Pause voice message',
    loading: 'Loading audio…',
    retry: 'Try playing again',
    seek: 'Voice message position',
    position: '{current} of {total}',
    unknownDuration: 'unknown length',
  },
  duration: {
    seconds_one: '{count} second',
    seconds_few: '{count} seconds',
    seconds_many: '{count} seconds',
    seconds_other: '{count} seconds',
    minutes_one: '{count} minute',
    minutes_few: '{count} minutes',
    minutes_many: '{count} minutes',
    minutes_other: '{count} minutes',
    minutesSeconds: '{minutes} {seconds}',
  },
  errors: {
    permissionDenied: 'Allow microphone access in your browser settings.',
    notSupported: "We couldn't find a microphone, or this browser can't record audio.",
    tooShort: 'Recording too short.',
    recordFailed: "Couldn't record. Please try again.",
    playFailed: "Couldn't play the audio.",
    playUnsupported: "This device can't play this audio format.",
    playOffline: "You're offline: the audio can't be loaded.",
  },
}
export default audio
