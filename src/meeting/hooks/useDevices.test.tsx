import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, test } from 'vitest'
import { FakeMediaClient } from '../FakeMediaClient.ts'
import { MediaProvider } from '../MediaProvider.tsx'
import { useDevices } from './useDevices.ts'

const setup = (client = new FakeMediaClient()) => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <MediaProvider client={client}>{children}</MediaProvider>
  )
  return { client, ...renderHook(() => useDevices(), { wrapper }) }
}

describe('useDevices', () => {
  test('lists cameras, microphones and speakers', async () => {
    const { result } = setup()

    await waitFor(() => expect(result.current.cameras).toHaveLength(2))
    expect(result.current.microphones).toHaveLength(2)
    expect(result.current.speakers).toHaveLength(1)
  })

  test('refreshes when a device is plugged in', async () => {
    const { client, result } = setup()
    await waitFor(() => expect(result.current.cameras).toHaveLength(2))

    act(() =>
      client.simulateDeviceChange([
        { deviceId: 'cam-1', label: 'FaceTime HD Camera', kind: 'camera' },
        { deviceId: 'cam-2', label: 'HD Pro Webcam C920', kind: 'camera' },
        { deviceId: 'cam-3', label: 'USB Camera', kind: 'camera' },
      ]),
    )

    await waitFor(() => expect(result.current.cameras).toHaveLength(3))
  })

  test('reflects a device being unplugged mid-preview', async () => {
    const { client, result } = setup()
    await waitFor(() => expect(result.current.cameras).toHaveLength(2))

    act(() => client.simulateDeviceChange([]))

    await waitFor(() => expect(result.current.cameras).toHaveLength(0))
  })

  test('stops listening on unmount, so an unplug cannot update a dead component', async () => {
    const { client, result, unmount } = setup()
    await waitFor(() => expect(result.current.cameras).toHaveLength(2))

    unmount()

    // Would warn or throw if the listener outlived the component.
    expect(() => client.simulateDeviceChange([])).not.toThrow()
  })
})
