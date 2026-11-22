import { describe, expect, test, vi } from 'vitest'
import { FakeMediaClient } from './FakeMediaClient.ts'
import { MediaError } from './MeetingClient.ts'

describe('FakeMediaClient', () => {
  test('defaults to a working camera and mic, so the happy path needs no setup', async () => {
    const client = new FakeMediaClient()

    await expect(client.checkPermissions()).resolves.toEqual({
      camera: 'granted',
      microphone: 'granted',
    })
    await expect(client.createCameraTrack()).resolves.toBeDefined()
  })

  test('lists the devices a normal laptop has', async () => {
    const client = new FakeMediaClient()

    expect(await client.getDevices('camera')).toHaveLength(2)
    expect(await client.getDevices('microphone')).toHaveLength(2)
    expect(await client.getDevices('speaker')).toHaveLength(1)
  })

  test('scenario: permission not yet asked, then granted on request', async () => {
    const client = new FakeMediaClient({ permissions: { camera: 'prompt', microphone: 'prompt' } })

    await expect(client.requestPermission('camera')).resolves.toBe('granted')
    expect((await client.checkPermissions()).camera).toBe('granted')
  })

  test('scenario: blocked permission cannot be re-prompted', async () => {
    // The whole point of the blocked state. If requestPermission could recover
    // from it, the UI would legitimately show a Retry button, and that button
    // would do nothing in a real browser.
    const client = new FakeMediaClient({
      permissions: { camera: 'blocked', microphone: 'blocked' },
    })

    await expect(client.requestPermission('camera')).resolves.toBe('blocked')
    await expect(client.createCameraTrack()).rejects.toThrow(MediaError)
  })

  test('scenario: blocked camera reports the blocked reason, not a generic failure', async () => {
    const client = new FakeMediaClient({
      permissions: { camera: 'blocked', microphone: 'granted' },
    })

    await expect(client.createCameraTrack()).rejects.toMatchObject({
      reason: 'permission-blocked',
    })
  })

  test('scenario: denied permission can be re-prompted', async () => {
    const client = new FakeMediaClient({ permissions: { camera: 'denied', microphone: 'denied' } })

    await expect(client.requestPermission('camera')).resolves.toBe('granted')
  })

  test('scenario: no devices at all', async () => {
    const client = new FakeMediaClient({ devices: [] })

    expect(await client.getDevices('camera')).toEqual([])
    await expect(client.createCameraTrack()).rejects.toMatchObject({ reason: 'no-devices' })
  })

  test('scenario: device in use by another app', async () => {
    const client = new FakeMediaClient({ cameraInUse: true })

    await expect(client.createCameraTrack()).rejects.toMatchObject({ reason: 'device-in-use' })
  })

  test('scenario: poor network drives the warning banner', async () => {
    const client = new FakeMediaClient({ network: { uplink: 1, downlink: 2 } })

    await expect(client.runPreCallTest()).resolves.toEqual({ uplink: 1, downlink: 2 })
  })

  test('hotplug notifies subscribers', () => {
    const client = new FakeMediaClient()
    const listener = vi.fn()

    client.onDeviceChanged(listener)
    client.simulateDeviceChange([])

    expect(listener).toHaveBeenCalledOnce()
  })

  test('hotplug actually changes the device list', async () => {
    const client = new FakeMediaClient()
    client.simulateDeviceChange([{ deviceId: 'cam-3', label: 'USB Camera', kind: 'camera' }])

    const cameras = await client.getDevices('camera')
    expect(cameras).toEqual([{ deviceId: 'cam-3', label: 'USB Camera', kind: 'camera' }])
  })

  test('unsubscribing stops notifications', () => {
    const client = new FakeMediaClient()
    const listener = vi.fn()

    const unsubscribe = client.onDeviceChanged(listener)
    unsubscribe()
    client.simulateDeviceChange([])

    expect(listener).not.toHaveBeenCalled()
  })

  test('a track carries a video track, so the preview element has something to show', async () => {
    const client = new FakeMediaClient()
    const stream = await client.createCameraTrack()

    expect(stream.getVideoTracks()).toHaveLength(1)
  })

  test('selecting a device is honoured, so the picker can be tested', async () => {
    const client = new FakeMediaClient()
    await client.createCameraTrack({ deviceId: 'cam-2' })

    expect(client.lastCameraDeviceId).toBe('cam-2')
  })
})
