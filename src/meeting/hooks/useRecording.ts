import { useCallback, useMemo, useSyncExternalStore } from 'react'
import type { RecordingState } from '../CallClient.ts'
import { useCallClient } from '../CallContext.ts'

export interface Recording {
  isRecording: boolean
  recordingState: RecordingState
  start: () => void
  stop: () => void
}

export function useRecording(): Recording {
  const client = useCallClient()
  const getIsRecording = useCallback(() => client.getState().isRecording, [client])
  const getRecordingState = useCallback(() => client.getState().recordingState, [client])
  const isRecording = useSyncExternalStore(client.subscribe, getIsRecording)
  const recordingState = useSyncExternalStore(client.subscribe, getRecordingState)

  const commands = useMemo(
    () => ({
      start: () => client.startRecording(),
      stop: () => client.stopRecording(),
    }),
    [client],
  )

  return useMemo(
    () => ({ isRecording, recordingState, ...commands }),
    [isRecording, recordingState, commands],
  )
}
