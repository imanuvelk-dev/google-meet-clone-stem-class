import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => {
  cleanup()
})

/**
 * jsdom implements no media capture: no MediaStream, no canvas.captureStream.
 * Real browsers (and therefore Playwright) have both, so this shim exists only
 * to let unit tests exercise the same code path, and must stay dumb enough that
 * it cannot mask a real bug.
 */
if (typeof globalThis.MediaStream === 'undefined') {
  class MediaStreamShim {
    private readonly tracks: MediaStreamTrack[]

    constructor(tracks: MediaStreamTrack[] = []) {
      this.tracks = [...tracks]
    }

    getTracks(): MediaStreamTrack[] {
      return [...this.tracks]
    }

    getVideoTracks(): MediaStreamTrack[] {
      return this.tracks.filter((track) => track.kind === 'video')
    }

    getAudioTracks(): MediaStreamTrack[] {
      return this.tracks.filter((track) => track.kind === 'audio')
    }
  }

  globalThis.MediaStream = MediaStreamShim as unknown as typeof MediaStream
}

/**
 * jsdom's play() returns undefined where the spec - and every real browser -
 * returns a Promise. Any caller that handles a rejected play(), which is the one
 * thing a caller of play() must do, therefore explodes on `.catch` of undefined.
 *
 * Resolved, never rejected: the autoplay policy is a browser behaviour, so the
 * blocked path is Playwright's to prove and this shim must not pretend to.
 */
if (typeof HTMLMediaElement !== 'undefined') {
  HTMLMediaElement.prototype.play = function play() {
    return Promise.resolve()
  }
}
