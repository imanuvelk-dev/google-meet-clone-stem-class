import { FakeCallClient, type FakeParticipant } from '@meeting/FakeCallClient.ts'
import { FakeMediaClient, type FakeMediaScenario } from '@meeting/FakeMediaClient.ts'
import type { MediaClient } from '@meeting/MeetingClient.ts'
import type { CreateCall } from '@routes/Call/createCall.ts'

/**
 * Lets e2e drive the app's states deterministically: `/room?fake=blocked`.
 *
 * Two params, because precall media and the call are orthogonal: you might want
 * a poor network AND a reconnecting meeting. `?fake=` picks the media scenario
 * and is what turns fake mode on at all; `?fake_call=` picks the call scenario
 * within it and defaults to a call that simply works.
 *
 * `?fake=` gating both matters: without it, an e2e run that clicked Join would
 * fall through to the real client and hit /api/token and VideoSDK.
 *
 * DEV-only. Guarded by import.meta.env.DEV so the fakes and every scenario
 * tree-shake out of the production bundle: shipping a switch that fakes the
 * camera would be a real bug, not a test convenience.
 */
function mediaScenarios(): Record<string, FakeMediaScenario> {
  return {
    ok: {},
    blocked: { permissions: { camera: 'blocked', microphone: 'blocked' } },
    denied: { permissions: { camera: 'denied', microphone: 'denied' } },
    'no-devices': { devices: [] },
    'in-use': { cameraInUse: true },
    'poor-network': { network: { uplink: 1, downlink: 2 } },
    'mic-blocked': { permissions: { camera: 'granted', microphone: 'blocked' } },
    /**
     * The only scenario whose device ids have to be real, because the browser is
     * the thing under test.
     *
     * setSinkId takes an id from enumerateDevices and rejects anything else with
     * NotFoundError, so the ordinary fake speakers ('speaker-1') can never prove
     * that routing happened - selecting one is indistinguishable from the picker
     * doing nothing, which is the exact bug we are here to disprove. 'default' is
     * the one output id every browser with any audio output resolves, so it is the
     * one real id that can be written down ahead of time rather than discovered on
     * the machine running the test.
     */
    'speaker-routing': {
      devices: [
        { deviceId: 'cam-1', label: 'FaceTime HD Camera', kind: 'camera' },
        { deviceId: 'mic-1', label: 'MacBook Pro Microphone', kind: 'microphone' },
        { deviceId: 'speaker-unset', label: 'Some Other Speakers', kind: 'speaker' },
        { deviceId: 'default', label: 'System Default Speakers', kind: 'speaker' },
      ],
    },
  }
}

export function fakeClientFromUrl(): MediaClient | undefined {
  if (!import.meta.env.DEV) return undefined

  const requested = new URLSearchParams(window.location.search).get('fake')
  if (!requested) return undefined

  const scenarios = mediaScenarios()
  const scenario = scenarios[requested]
  if (!scenario) {
    // A typo'd scenario silently falling back to a working camera would make a
    // test pass for the wrong reason.
    throw new Error(
      `Unknown fake scenario "${requested}". Known: ${Object.keys(scenarios).join(', ')}`,
    )
  }
  return new FakeMediaClient(scenario)
}

interface FakeCallSetup {
  /**
   * Rejects instead of building a client, which is the only way to reach the
   * join-failure UI: the real path there is a dead /api/token.
   */
  createFails?: boolean
  /**
   * Holds at 'connecting' so a test can drive the rest. FakeCallClient.join() is
   * synchronous, so an auto-connecting fake never renders the connecting state
   * at all and a test asserting it would pass for the wrong reason.
   */
  autoConnect?: boolean
  joinFails?: boolean
  /** The local participant is always added from the entered name. */
  remotes?: FakeParticipant[]
  /** Your own mic. Defaults on; the Figma frame draws it muted. */
  micEnabled?: boolean
  /**
   * Defaults true inside the fake, so a scenario must opt out to be a guest.
   * Every host affordance is gated on this.
   */
  isHost?: boolean
  /** Reaches the store through the history bucket, so the merge is exercised. */
  chatHistory?: { senderId: string; senderName: string; text: string; timestamp: number }[]
  /** Ordered, earliest first. Folded from a log inside the fake, never a boolean. */
  raisedHands?: string[]
  pendingEntries?: { participantId: string; name: string }[]
  isRecording?: boolean
}

/**
 * Names, so a grid of twenty is twenty people rather than twenty of "Remote 4".
 * Real-length names are the point: the tile's label truncates, and a placeholder
 * that never does would hide that it does.
 */
function remoteNames(): string[] {
  return [
    'Ada Lovelace',
    'Grace Hopper',
    'Alan Turing',
    'Katherine Johnson',
    'Edsger Dijkstra',
    'Barbara Liskov',
    'Donald Knuth',
    'Margaret Hamilton',
    'Tim Berners-Lee',
    'Radia Perlman',
    'Ken Thompson',
    'Frances Allen',
    'Dennis Ritchie',
    'Jean Bartik',
    'Vint Cerf',
    'Sophie Wilson',
    'Linus Torvalds',
    'Shafi Goldwasser',
    'Guido van Rossum',
    'Anita Borg',
  ]
}

/**
 * A roster of a given size, with roughly a third camera-off and a quarter muted.
 *
 * Not all-on: a grid where every tile is a video proves nothing about the two
 * states the Figma frame actually draws - the avatar fallback and the mute badge
 * - and those are the states with somewhere to go wrong.
 */
function remotes(count: number): FakeParticipant[] {
  const names = remoteNames()
  return Array.from({ length: count }, (_, i) => ({
    id: `remote-${i + 1}`,
    displayName: names[i % names.length] ?? `Guest ${i + 1}`,
    micOn: i % 4 !== 0,
    webcamOn: i % 3 !== 0,
  }))
}

function callScenarios(): Record<string, FakeCallSetup> {
  return {
    ok: {},
    'two-people': {
      remotes: [{ id: 'remote-1', displayName: 'Ada Lovelace', micOn: true, webcamOn: true }],
    },
    /**
     * The grid at the counts the plan wants seen. The local participant is always
     * added on top, so each name is the total: 'four' is you plus three.
     *
     * These exist because the states worth looking at are the ones you cannot
     * stage. Twenty people will not join a dev machine, and 'fifty' is the only way
     * to see the 49-tile cap page at all.
     */
    /**
     * The Figma Meeting frame's own roster, and the one diffable case in the phase:
     * you (muted, camera on) plus one camera-off and one camera-on remote, which is
     * what 42:6675 draws. M8's `figma:diff -- meeting` wants this exact world.
     */
    three: {
      micEnabled: false,
      remotes: [
        { id: 'remote-1', displayName: 'Lucy Xu', micOn: true, webcamOn: false },
        { id: 'remote-2', displayName: 'Kimberly Reynolds', micOn: true, webcamOn: true },
      ],
    },
    four: { remotes: remotes(3) },
    nine: { remotes: remotes(8) },
    twenty: { remotes: remotes(19) },
    fifty: { remotes: remotes(49) },
    /** Someone else's screen. presenterId follows screenShareOn inside the fake. */
    presenting: {
      remotes: [
        { id: 'remote-1', displayName: 'Ada Lovelace', micOn: true, webcamOn: true },
        {
          id: 'remote-2',
          displayName: 'Grace Hopper',
          micOn: true,
          webcamOn: true,
          screenShareOn: true,
        },
        { id: 'remote-3', displayName: 'Alan Turing', micOn: false, webcamOn: false },
      ],
    },
    'slow-connect': { autoConnect: false },
    'join-fails': { joinFails: true },
    'token-fails': { createFails: true },
    /**
     * A guest: every host affordance must be absent, not merely disabled. The
     * default is host, so this is the only way to see the other side.
     */
    guest: { isHost: false, remotes: remotes(2) },
    /** Two people knocking. Admitting one traverses the real roster-arrival path. */
    'lobby-host': {
      isHost: true,
      remotes: remotes(1),
      pendingEntries: [
        { participantId: 'knock-1', name: 'Katherine Johnson' },
        { participantId: 'knock-2', name: 'Barbara Liskov' },
      ],
    },
    /**
     * Waiting to be let in: a guest held at 'connecting' with no decision yet,
     * which is what the "Asking to be let in" screen derives from. Nothing in the
     * SDK announces this state - see the plan's open risks.
     */
    'lobby-guest': { isHost: false, autoConnect: false },
    /** Order is the assertion: remote-2 raised first and must sort above remote-1. */
    'hands-up': { remotes: remotes(3), raisedHands: ['remote-2', 'remote-1'] },
    'chat-history': {
      remotes: remotes(2),
      chatHistory: [
        {
          senderId: 'remote-1',
          senderName: 'Ada Lovelace',
          text: 'Morning - starting a couple of minutes late.',
          timestamp: 1_700_000_000_000,
        },
        {
          senderId: 'remote-1',
          senderName: 'Ada Lovelace',
          text: 'Grabbing the deck now.',
          timestamp: 1_700_000_001_000,
        },
        {
          senderId: 'remote-2',
          senderName: 'Grace Hopper',
          text: 'No rush, still joining.',
          timestamp: 1_700_000_002_000,
        },
      ],
    },
    recording: { remotes: remotes(2), isRecording: true },
    captions: {
      remotes: [{ id: 'remote-1', displayName: 'Ada Lovelace', micOn: true, webcamOn: true }],
    },
  }
}

export function fakeCallFromUrl(): CreateCall | undefined {
  if (!import.meta.env.DEV) return undefined

  const params = new URLSearchParams(window.location.search)
  const requested = params.get('fake_call')

  if (!params.has('fake')) {
    if (requested !== null) {
      // Silently handing back the real client here would put a test against a
      // live VideoSDK room without saying so.
      throw new Error('fake_call needs fake=... as well: the call fake only exists in fake mode.')
    }
    return undefined
  }

  const scenarios = callScenarios()
  const setup = scenarios[requested ?? 'ok']
  if (!setup) {
    throw new Error(
      `Unknown fake call scenario "${requested}". Known: ${Object.keys(scenarios).join(', ')}`,
    )
  }

  return ({ meetingId, name }) => {
    if (setup.createFails) return Promise.reject(new Error('Fake token failure'))

    const client = new FakeCallClient({
      meetingId,
      ...(setup.autoConnect === undefined ? {} : { autoConnect: setup.autoConnect }),
      ...(setup.joinFails === undefined ? {} : { joinFails: setup.joinFails }),
      ...(setup.isHost === undefined ? {} : { isHost: setup.isHost }),
      ...(setup.chatHistory === undefined ? {} : { chatHistory: setup.chatHistory }),
      ...(setup.raisedHands === undefined ? {} : { raisedHands: setup.raisedHands }),
      ...(setup.pendingEntries === undefined ? {} : { pendingEntries: setup.pendingEntries }),
      ...(setup.isRecording === undefined ? {} : { isRecording: setup.isRecording }),
      // Built here rather than in the table so a scenario cannot accidentally
      // ship a local participant with a hardcoded name that is not the one the
      // user just typed.
      participants: [
        {
          id: 'local-1',
          displayName: name,
          isLocal: true,
          micOn: setup.micEnabled ?? true,
          webcamOn: true,
        },
        ...(setup.remotes ?? []),
      ],
    })

    /**
     * The fake's simulate* hooks, reachable from Playwright.
     *
     * FakeCallClient already exists to produce events a real meeting will not
     * produce to order - someone joining mid-call, someone muting - but a
     * scenario picked at page load can only describe the world at time zero. The
     * events worth testing are the ones that happen afterwards, and this handle
     * is the only way a test can cause one.
     *
     * DEV-only, alongside the fakes themselves: this whole module is behind
     * import.meta.env.DEV and tree-shakes out of the production bundle.
     */
    ;(window as unknown as { __fakeCall?: FakeCallClient }).__fakeCall = client

    return Promise.resolve(client)
  }
}
