import { ROUTES } from '@/app/router'

/** Conversar opened directly in a given mode (TalkPage reads `?mode=person|train`). */
export const TALK_TRAIN_PATH = `${ROUTES.talk}?mode=train`
export const TALK_PERSON_PATH = `${ROUTES.talk}?mode=person`
