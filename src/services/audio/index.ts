export {
  AUDIO_MIME_CANDIDATES,
  DEFAULT_MAX_AUDIO_DURATION_MS,
  MIN_AUDIO_DURATION_MS,
  baseMimeType,
  createAudioRecorder,
  extensionForMimeType,
  mapGetUserMediaError,
  pickAudioMimeType,
  rmsToLevel,
  type AudioExtension,
  type AudioRecorder,
  type AudioRecorderDeps,
  type AudioRecorderStartOptions,
  type AudioRecorderState,
  type RecordedAudio,
} from './recorder'
export { formatDuration, getAudioDuration, mediaErrorToAppError, readMediaDurationMs, type AudioDurationOptions } from './duration'
