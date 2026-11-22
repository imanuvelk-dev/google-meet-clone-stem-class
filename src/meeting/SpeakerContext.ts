import { createContext } from 'react'
import { speakerStore, type SpeakerStore } from './speaker.ts'

/**
 * Defaults to the shared store rather than to null, unlike CallClientContext.
 *
 * That is deliberate: precall sits outside CallProvider and still needs the
 * speaker choice, so requiring a provider would either force one around the whole
 * app or split the selection in two. Tests override it with their own store.
 */
export const SpeakerContext = createContext<SpeakerStore>(speakerStore)
