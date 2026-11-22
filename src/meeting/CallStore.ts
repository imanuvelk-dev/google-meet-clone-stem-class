import type {
  Caption,
  CallParticipant,
  CallReaction,
  CallState,
  ChatMessage,
  PendingEntry,
} from './CallClient.ts'

/**
 * The read side of CallClient, shared by the real client and the fake.
 *
 * Its entire job is to make snapshots referentially stable. useSyncExternalStore
 * compares snapshots with Object.is and re-renders when they differ, so a store
 * that handed out a fresh object each time would re-render forever. The real
 * client's bridges push the SDK's state on every one of their renders, which
 * makes that hazard constant rather than theoretical. So every mutator here
 * diffs first and returns without notifying when nothing actually moved.
 *
 * Subclasses own their transports; this owns identity.
 */

const INITIAL_STATE: CallState = {
  connection: 'idle',
  meetingId: null,
  localParticipantId: null,
  activeSpeakerId: null,
  presenterId: null,
  pinnedParticipantId: null,
  localMicOn: false,
  localWebcamOn: false,
  localScreenShareOn: false,
  selectedCameraId: null,
  selectedMicrophoneId: null,
  qualityLimitation: null,
  leaveReason: null,
  error: null,
  isHost: false,
  entryDecision: null,
  micRequest: null,
  webcamRequest: null,
  isRecording: false,
  recordingState: 'idle',
  transcription: 'idle',
  whiteboardUrl: null,
}

const NO_IDS: readonly string[] = []
const NO_MESSAGES: readonly ChatMessage[] = []

/**
 * A participant as the transports know it: raw tracks, because only this store
 * may decide when a MediaStream is a new one. See streamFor.
 */
export interface ParticipantFacts {
  id: string
  displayName: string
  isLocal: boolean
  micOn: boolean
  webcamOn: boolean
  screenShareOn: boolean
  webcamTrack: MediaStreamTrack | null
  micTrack: MediaStreamTrack | null
  screenShareTrack: MediaStreamTrack | null
}

export interface ChatMessageFacts {
  senderId: string
  senderName: string
  message: string
  timestamp: number
}

export interface HandRaiseFacts {
  participantId: string
  raised: boolean
}

export class CallStore {
  private readonly listeners = new Set<() => void>()
  private readonly reactionListeners = new Set<(reaction: CallReaction) => void>()
  private readonly captionListeners = new Set<(caption: Caption) => void>()
  private state: CallState = INITIAL_STATE
  private readonly participants = new Map<string, CallParticipant>()
  private ids: readonly string[] = NO_IDS

  private readonly mediaFacts = new Map<string, ParticipantFacts>()
  private raisedOrder: readonly string[] = NO_IDS

  private readonly chatByKey = new Map<string, ChatMessage>()
  private chatLog: readonly ChatMessage[] = NO_MESSAGES
  private chatReadCount = 0

  private readonly pendingEntries = new Map<string, PendingEntry>()
  private pendingIds: readonly string[] = NO_IDS

  // Arrow fields, not methods: these are handed straight to useSyncExternalStore
  // and would lose `this` as bare references.
  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getState = (): CallState => this.state

  readonly getParticipantIds = (): readonly string[] => this.ids

  readonly getParticipant = (participantId: string): CallParticipant | null =>
    this.participants.get(participantId) ?? null

  readonly getChatMessages = (): readonly ChatMessage[] => this.chatLog

  readonly getChatUnreadCount = (): number => this.chatLog.length - this.chatReadCount

  readonly getRaisedHands = (): readonly string[] => this.raisedOrder

  readonly getPendingEntryIds = (): readonly string[] => this.pendingIds

  readonly getPendingEntry = (participantId: string): PendingEntry | null =>
    this.pendingEntries.get(participantId) ?? null

  readonly subscribeToReactions = (listener: (reaction: CallReaction) => void): (() => void) => {
    this.reactionListeners.add(listener)
    return () => {
      this.reactionListeners.delete(listener)
    }
  }

  readonly subscribeToCaptions = (listener: (caption: Caption) => void): (() => void) => {
    this.captionListeners.add(listener)
    return () => {
      this.captionListeners.delete(listener)
    }
  }

  /** Ignores keys whose value is unchanged, so a per-render push costs nothing. */
  protected patchState(patch: Partial<CallState>): void {
    const keys = Object.keys(patch) as (keyof CallState)[]
    if (!keys.some((key) => !Object.is(this.state[key], patch[key]))) return

    this.state = { ...this.state, ...patch }
    this.notify()
  }

  protected setParticipantFacts(facts: ParticipantFacts): void {
    this.mediaFacts.set(facts.id, facts)
    const changed = this.applyParticipant(facts.id)
    const cleared = this.clearPendingEntry(facts.id)
    if (changed || cleared) this.notify()
  }

  protected removeParticipantFacts(participantId: string): void {
    this.mediaFacts.delete(participantId)
    if (!this.participants.delete(participantId)) return

    this.ids = [...this.participants.keys()]

    // A departed participant must not stay pinned, presenting or speaking, or the
    // layout keeps a hole where they were. Folded into this one update so the
    // roster and the references into it can never be observed disagreeing.
    const patch: Partial<CallState> = {}
    if (this.state.pinnedParticipantId === participantId) patch.pinnedParticipantId = null
    if (this.state.presenterId === participantId) patch.presenterId = null
    if (this.state.activeSpeakerId === participantId) patch.activeSpeakerId = null
    if (Object.keys(patch).length > 0) this.state = { ...this.state, ...patch }

    this.notify()
  }

  protected setHandRaiseLog(log: readonly HandRaiseFacts[]): void {
    const next = foldHandRaise(log)
    if (sameIds(this.raisedOrder, next)) return

    const touched = new Set([...this.raisedOrder, ...next])
    this.raisedOrder = next
    for (const id of touched) this.applyParticipant(id)
    this.notify()
  }

  protected setChatLog(
    history: readonly ChatMessageFacts[],
    live: readonly ChatMessageFacts[],
  ): void {
    const seen = new Map<string, number>()
    const next: ChatMessage[] = []
    let added = false

    for (const facts of [...history, ...live]) {
      const key = chatKey(facts, seen)
      const existing = this.chatByKey.get(key)
      if (existing) {
        next.push(existing)
        continue
      }
      const message: ChatMessage = {
        id: key,
        senderId: facts.senderId,
        senderName: facts.senderName,
        text: facts.message,
        timestamp: facts.timestamp,
      }
      this.chatByKey.set(key, message)
      next.push(message)
      added = true
    }

    if (!added && next.length === this.chatLog.length) return

    this.chatLog = next
    this.notify()
  }

  protected markChatReadAt(count: number): void {
    if (this.chatReadCount === count) return
    this.chatReadCount = count
    this.notify()
  }

  protected setPendingEntry(entry: PendingEntry): void {
    if (this.pendingEntries.has(entry.participantId)) return
    this.pendingEntries.set(entry.participantId, entry)
    this.pendingIds = [...this.pendingEntries.keys()]
    this.notify()
  }

  protected removePendingEntry(participantId: string): void {
    if (!this.clearPendingEntry(participantId)) return
    this.notify()
  }

  protected emitReaction(reaction: CallReaction): void {
    for (const listener of [...this.reactionListeners]) listener(reaction)
  }

  protected emitCaption(caption: Caption): void {
    for (const listener of [...this.captionListeners]) listener(caption)
  }

  protected notify(): void {
    // Copied: a listener that unsubscribes on notification would otherwise
    // mutate the set mid-iteration.
    for (const listener of [...this.listeners]) listener()
  }

  private clearPendingEntry(participantId: string): boolean {
    if (!this.pendingEntries.delete(participantId)) return false
    this.pendingIds = [...this.pendingEntries.keys()]
    return true
  }

  private applyParticipant(participantId: string): boolean {
    const facts = this.mediaFacts.get(participantId)
    if (!facts) return false

    const current = this.participants.get(participantId) ?? null

    const next: CallParticipant = {
      id: facts.id,
      displayName: facts.displayName,
      isLocal: facts.isLocal,
      micOn: facts.micOn,
      webcamOn: facts.webcamOn,
      screenShareOn: facts.screenShareOn,
      webcamStream: streamFor(current?.webcamStream ?? null, facts.webcamTrack),
      micStream: streamFor(current?.micStream ?? null, facts.micTrack),
      screenShareStream: streamFor(current?.screenShareStream ?? null, facts.screenShareTrack),
      handRaised: this.raisedOrder.includes(facts.id),
    }

    if (current && shallowEqual(current, next)) return false

    this.participants.set(facts.id, next)
    if (!current) this.ids = [...this.participants.keys()]
    return true
  }
}

/**
 * The single most dangerous line in this design.
 *
 * Building `new MediaStream([track])` on every push would hand out a new
 * identity every time and spin useSyncExternalStore forever. The track itself is
 * stable for the life of the stream, so it is the identity we key on.
 */
function streamFor(
  current: MediaStream | null,
  track: MediaStreamTrack | null,
): MediaStream | null {
  if (!track) return null
  if (current && current.getTracks()[0] === track) return current
  return new MediaStream([track])
}

function chatKey(facts: ChatMessageFacts, seen: Map<string, number>): string {
  const base = `${facts.senderId}|${facts.timestamp}`
  const nth = seen.get(base) ?? 0
  seen.set(base, nth + 1)
  return `${base}|${nth}`
}

function foldHandRaise(log: readonly HandRaiseFacts[]): readonly string[] {
  const raised: string[] = []
  for (const entry of log) {
    const at = raised.indexOf(entry.participantId)
    if (entry.raised) {
      if (at === -1) raised.push(entry.participantId)
    } else if (at !== -1) {
      raised.splice(at, 1)
    }
  }
  return raised
}

function sameIds(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

function shallowEqual(a: CallParticipant, b: CallParticipant): boolean {
  const keys = Object.keys(a) as (keyof CallParticipant)[]
  return keys.every((key) => Object.is(a[key], b[key]))
}
