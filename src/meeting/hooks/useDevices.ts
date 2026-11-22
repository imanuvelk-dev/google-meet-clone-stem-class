import { useCallback, useEffect, useState } from 'react'
import { useMediaClient } from '../MediaClientContext.ts'
import type { Device } from '../MeetingClient.ts'

export interface Devices {
  cameras: Device[]
  microphones: Device[]
  speakers: Device[]
  refresh: () => Promise<void>
}

/**
 * The device lists behind precall's pickers, kept live through hotplug.
 *
 * Meet handles a webcam being unplugged mid-preview; so must we. The client's
 * onDeviceChanged is the only trigger, so this stays correct whether it is
 * backed by the browser's devicechange event or by the fake.
 */
export function useDevices(): Devices {
  const client = useMediaClient()
  const [cameras, setCameras] = useState<Device[]>([])
  const [microphones, setMicrophones] = useState<Device[]>([])
  const [speakers, setSpeakers] = useState<Device[]>([])

  const refresh = useCallback(async () => {
    const [nextCameras, nextMicrophones, nextSpeakers] = await Promise.all([
      client.getDevices('camera'),
      client.getDevices('microphone'),
      client.getDevices('speaker'),
    ])
    setCameras(nextCameras)
    setMicrophones(nextMicrophones)
    setSpeakers(nextSpeakers)
  }, [client])

  useEffect(() => {
    let cancelled = false

    const sync = async () => {
      await refresh()
      if (cancelled) return
    }

    void sync()
    const unsubscribe = client.onDeviceChanged(() => void sync())

    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [client, refresh])

  return { cameras, microphones, speakers, refresh }
}
