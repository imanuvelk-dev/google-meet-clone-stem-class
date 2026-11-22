/**
 * Speaker output routing. Ours, not VideoSDK's.
 *
 * VideoSDK cannot route audio output at all: getPlaybackDevices() enumerates and
 * stops there. The only mechanism is HTMLMediaElement.setSinkId(deviceId),
 * applied to every audio element individually. So this store owns the selection
 * and the elements, and hands the two to each other.
 *
 * Three constraints shaped it:
 *
 * 1. setSinkId is typed in lib.dom, so it compiles everywhere, but it is
 *    Chromium-only at runtime and absent in Safari. Support is therefore detected
 *    at runtime and published as state, so the UI can HIDE the control where it
 *    cannot work. Precall currently ships a picker that silently changes nothing,
 *    which is the bug this exists to end. See CLAUDE.md.
 * 2. The selection has to outlive precall. It is made outside MeetingProvider and
 *    used inside it, so it cannot live in either one's React state. It persists
 *    to localStorage, the way the host grant does.
 * 3. Precall is not inside CallProvider, so this deliberately hangs off no
 *    provider: SpeakerContext defaults to the singleton and both sides get the
 *    same one for free.
 *
 * Two neighbouring APIs, and why neither is used:
 *
 * - The `speaker-selection` permission policy gates setSinkId. Its default
 *   allowlist is `self`, so a top-level document like ours is allowed and there
 *   is nothing to declare; a cross-origin iframe embedding us would have to send
 *   allow="speaker-selection". When it IS blocked, setSinkId rejects with
 *   NotAllowedError, which is a browser refusing to route at all rather than one
 *   device being unavailable - so that rejection disables the whole feature and
 *   the picker disappears. See apply().
 * - navigator.mediaDevices.selectAudioOutput() opens the browser's own output
 *   picker. Not used: enumerateDevices already exposes output device ids once
 *   microphone permission is granted, and precall cannot be got past without
 *   granting it. Calling it would put a second, browser-drawn picker in a UI
 *   whose entire purpose is to look like Meet's.
 */

const STORAGE_KEY = 'meet-clone:speaker-device'

export interface SpeakerState {
  /** Null means the browser default. */
  deviceId: string | null
  /** False in Safari. The picker must not render at all when false. */
  supported: boolean
}

export interface SpeakerStoreOptions {
  /** Tests only: jsdom has no setSinkId, so detection would disable everything. */
  supported?: boolean
  deviceId?: string | null
}

/** localStorage throws in private mode and when disabled. Not worth crashing over. */
function read(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

function write(deviceId: string | null): void {
  try {
    if (deviceId === null) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, deviceId)
  } catch {
    // Non-fatal: the choice simply will not survive a reload.
  }
}

export function detectSinkIdSupport(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype
}

export class SpeakerStore {
  private readonly listeners = new Set<() => void>()
  private readonly elements = new Set<HTMLMediaElement>()
  private state: SpeakerState

  constructor(options: SpeakerStoreOptions = {}) {
    this.state = {
      supported: options.supported ?? detectSinkIdSupport(),
      deviceId: options.deviceId === undefined ? read() : options.deviceId,
    }
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  readonly getState = (): SpeakerState => this.state

  readonly select = (deviceId: string | null): void => {
    if (this.state.deviceId === deviceId) return

    this.state = { ...this.state, deviceId }
    write(deviceId)
    for (const element of this.elements) void this.apply(element)
    this.notify()
  }

  /**
   * Every remote participant's <audio> element registers here. Returns an
   * unregister. Routing has to be applied per element, so an element that
   * mounts after the choice was made must still pick it up.
   */
  readonly register = (element: HTMLMediaElement): (() => void) => {
    this.elements.add(element)
    void this.apply(element)
    return () => {
      this.elements.delete(element)
    }
  }

  /** Tests only. */
  get registeredCount(): number {
    return this.elements.size
  }

  private async apply(element: HTMLMediaElement): Promise<void> {
    if (!this.state.supported || this.state.deviceId === null) return
    try {
      await element.setSinkId(this.state.deviceId)
    } catch (error) {
      if (isNotAllowed(error)) this.disable()
      // Any other rejection is one device, not the feature: it was unplugged
      // between being chosen and being used. The browser stays on the default,
      // which is the right outcome and not worth an error.
    }
  }

  /**
   * The browser has refused to route, so the picker must stop claiming it can.
   *
   * Detection at construction can only ask whether setSinkId EXISTS. Whether the
   * permission policy will let it run is only answerable by running it, so
   * support can be disproved later than it was detected. Clearing deviceId along
   * with it matters: a picker that vanishes while still reporting a chosen device
   * would leave the selection lying on in localStorage.
   */
  private disable(): void {
    if (!this.state.supported) return
    this.state = { supported: false, deviceId: null }
    write(null)
    this.notify()
  }

  private notify(): void {
    // Copied: a listener that unsubscribes on notification would otherwise
    // mutate the set mid-iteration.
    for (const listener of [...this.listeners]) listener()
  }
}

function isNotAllowed(error: unknown): boolean {
  return error instanceof Error && error.name === 'NotAllowedError'
}

/**
 * Shared by precall and in-call, because the selection has to cross between
 * them. SpeakerContext defaults to this, so neither side needs a provider.
 */
export const speakerStore = new SpeakerStore()
