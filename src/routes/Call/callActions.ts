import type { IconName } from '@design/primitives/index.ts'
import { useCall } from '@meeting/hooks/useCall.ts'
import { useChatUnreadCount } from '@meeting/hooks/useChat.ts'
import { useParticipants } from '@meeting/hooks/useParticipants.ts'
import { useRaisedHands } from '@meeting/hooks/useRaisedHands.ts'
import { useRecording } from '@meeting/hooks/useRecording.ts'
import { useWhiteboard } from '@meeting/hooks/useWhiteboard.ts'
import { useCallUi } from './CallUiContext.ts'
import { useMuteEveryone } from './hostActions.ts'
import { LAYOUTS } from './stageLayout.ts'
import { useFullscreen } from './useFullscreen.ts'

export type CallActionId =
  | 'layout'
  | 'fullscreen'
  | 'whiteboard'
  | 'recording'
  | 'mute-everyone'
  | 'raise-hand'
  | 'captions'
  | 'people'
  | 'chat'

export interface ActionBadge {
  count: number
  testId: string
}

interface ActionBase {
  id: CallActionId
  label: string
  icon: IconName
  dismisses: boolean
  disabled: { reason: string } | null
  badge: ActionBadge | null
}

export interface CommandAction extends ActionBase {
  kind: 'command'
  activate: () => void
}

export interface ToggleAction extends ActionBase {
  kind: 'toggle'
  on: boolean
  activate: () => void
}

export interface ChoiceOption {
  id: string
  label: string
  icon: IconName
  selected: boolean
  select: () => void
}

export interface ChoiceAction {
  kind: 'choice'
  id: CallActionId
  label: string
  dismisses: boolean
  options: ChoiceOption[]
}

export type CallAction = CommandAction | ToggleAction | ChoiceAction

export type CallActions = { [K in CallActionId]: CallAction | null }

export function useCallActions(): CallActions {
  const { layout, setLayout, panel, setPanel, captionsOn, toggleCaptions } = useCallUi()
  const call = useCall()
  const participantIds = useParticipants()
  const unreadCount = useChatUnreadCount()
  const hands = useRaisedHands()
  const { isRecording, recordingState, start, stop } = useRecording()
  const whiteboard = useWhiteboard()
  const fullscreen = useFullscreen()
  const muteEveryone = useMuteEveryone()

  const handRaised = call.localParticipantId !== null && hands.ids.includes(call.localParticipantId)
  const recordingChanging = recordingState === 'starting' || recordingState === 'stopping'

  return {
    layout: {
      kind: 'choice',
      id: 'layout',
      label: 'Layout',
      dismisses: true,
      options: LAYOUTS.map((option) => ({
        id: option.mode,
        label: option.label,
        icon: option.icon,
        selected: option.mode === layout,
        select: () => setLayout(option.mode),
      })),
    },

    fullscreen: fullscreen.supported
      ? {
          kind: 'command',
          id: 'fullscreen',
          label: fullscreen.active ? 'Exit full screen' : 'Full screen',
          icon: 'fullscreen',
          dismisses: true,
          disabled: null,
          badge: null,
          activate: fullscreen.toggle,
        }
      : null,

    whiteboard: {
      kind: 'command',
      id: 'whiteboard',
      label: whiteboard.isActive ? 'Close whiteboard' : 'Whiteboard',
      icon: 'edit_square',
      dismisses: true,
      disabled: null,
      badge: null,
      activate: () => {
        if (whiteboard.isActive) whiteboard.stop()
        else whiteboard.start()
      },
    },

    recording: call.isHost
      ? {
          kind: 'command',
          id: 'recording',
          label: isRecording ? 'Stop recording' : 'Start recording',
          icon: 'radio_button_checked',
          dismisses: true,
          disabled: recordingChanging ? { reason: 'Recording is changing' } : null,
          badge: null,
          activate: () => {
            if (isRecording) stop()
            else start()
          },
        }
      : null,

    'mute-everyone': call.isHost
      ? {
          kind: 'command',
          id: 'mute-everyone',
          label: 'Mute everyone',
          icon: 'lock_person',
          dismisses: true,
          disabled: null,
          badge: null,
          activate: muteEveryone,
        }
      : null,

    'raise-hand': {
      kind: 'toggle',
      id: 'raise-hand',
      label: handRaised ? 'Lower hand' : 'Raise hand',
      icon: 'back_hand',
      dismisses: false,
      disabled: null,
      badge: null,
      on: handRaised,
      activate: () => hands.setRaised(!handRaised),
    },

    captions: {
      kind: 'toggle',
      id: 'captions',
      label: captionsOn ? 'Turn off captions' : 'Turn on captions',
      icon: 'closed_caption',
      dismisses: false,
      disabled: null,
      badge: null,
      on: captionsOn,
      activate: toggleCaptions,
    },

    people: {
      kind: 'toggle',
      id: 'people',
      label: 'People',
      icon: 'group',
      dismisses: true,
      disabled: null,
      badge: { count: participantIds.length, testId: 'people-count' },
      on: panel === 'people',
      activate: () => setPanel(panel === 'people' ? null : 'people'),
    },

    chat: {
      kind: 'toggle',
      id: 'chat',
      label: 'Chat',
      icon: 'chat',
      dismisses: true,
      disabled: null,
      badge:
        unreadCount > 0 && panel !== 'chat' ? { count: unreadCount, testId: 'chat-unread' } : null,
      on: panel === 'chat',
      activate: () => setPanel(panel === 'chat' ? null : 'chat'),
    },
  }
}
