import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { FakeMediaClient, type FakeMediaScenario } from '../FakeMediaClient.ts'
import { MediaProvider } from '../MediaProvider.tsx'
import { useLocalMedia } from './useLocalMedia.ts'

const setup = (scenario: FakeMediaScenario = {}) => {
  const client = new FakeMediaClient(scenario)
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MediaProvider client={client}>{children}</MediaProvider>
  )
  return { client, ...renderHook(() => useLocalMedia(), { wrapper }) }
}

describe('useLocalMedia', () => {
  test('starts the camera and mic when permission is already granted', async () => {
    const { result } = setup()

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.stream).not.toBeNull()
    expect(result.current.error).toBeNull()
  })

  test('reports blocked permission as blocked, not as a generic error', async () => {
    const { result } = setup({ permissions: { camera: 'blocked', microphone: 'blocked' } })

    await waitFor(() => expect(result.current.status).toBe('error'))
    // The UI keys its recovery instructions off this exact reason. A generic
    // failure here would put a dead Retry button in front of the user.
    expect(result.current.error?.reason).toBe('permission-blocked')
  })

  test('reports no devices distinctly from denied permission', async () => {
    const { result } = setup({ devices: [] })

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.reason).toBe('no-devices')
  })

  test('reports a device held by another app', async () => {
    const { result } = setup({ cameraInUse: true })

    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(result.current.error?.reason).toBe('device-in-use')
  })

  test('toggling the camera off does not tear down the mic', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.toggleCamera())

    await waitFor(() => expect(result.current.cameraEnabled).toBe(false))
    expect(result.current.microphoneEnabled).toBe(true)
  })

  test('toggling the mic off leaves the camera preview running', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.toggleMicrophone())

    await waitFor(() => expect(result.current.microphoneEnabled).toBe(false))
    expect(result.current.cameraEnabled).toBe(true)
  })

  test('the camera can be toggled back on', async () => {
    const { result } = setup()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    act(() => result.current.toggleCamera())
    await waitFor(() => expect(result.current.cameraEnabled).toBe(false))
    act(() => result.current.toggleCamera())

    await waitFor(() => expect(result.current.cameraEnabled).toBe(true))
  })

  test('switching camera device restarts the track on the chosen device', async () => {
    const { client, result } = setup()
    await waitFor(() => expect(result.current.status).toBe('ready'))

    await act(async () => {
      await result.current.selectCamera('cam-2')
    })

    expect(client.lastCameraDeviceId).toBe('cam-2')
  })

  test('a blocked mic still allows a camera-only preview', async () => {
    // Meet lets you join with no mic. Failing the whole preview because audio
    // was refused would be worse than the real product.
    const { result } = setup({ permissions: { camera: 'granted', microphone: 'blocked' } })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.microphoneEnabled).toBe(false)
    expect(result.current.stream).not.toBeNull()
  })

  test('exposes the mic stream, which the call hands to MeetingProvider', async () => {
    const { result } = setup()

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.microphoneStream?.getAudioTracks()).toHaveLength(1)
  })

  test('a blocked mic leaves no mic stream to hand over', async () => {
    const { result } = setup({ permissions: { camera: 'granted', microphone: 'blocked' } })

    await waitFor(() => expect(result.current.status).toBe('ready'))
    expect(result.current.microphoneStream).toBeNull()
  })

  test('stops both tracks on unmount, so the camera light goes out', async () => {
    const { result, unmount } = setup()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const tracks = [
      ...(result.current.stream?.getTracks() ?? []),
      ...(result.current.microphoneStream?.getTracks() ?? []),
    ]
    expect(tracks).toHaveLength(2)

    unmount()

    expect(tracks.map((track) => track.readyState)).toEqual(['ended', 'ended'])
  })

  test('released tracks survive unmount, because the call is publishing them', async () => {
    // The whole point of the seam. If this regresses, joining kills the camera.
    const { result, unmount } = setup()
    await waitFor(() => expect(result.current.status).toBe('ready'))
    const tracks = [
      ...(result.current.stream?.getTracks() ?? []),
      ...(result.current.microphoneStream?.getTracks() ?? []),
    ]

    act(() => result.current.release())
    unmount()

    expect(tracks.map((track) => track.readyState)).toEqual(['live', 'live'])
  })
})
