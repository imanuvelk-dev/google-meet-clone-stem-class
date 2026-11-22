import { createContext, useContext } from 'react'
import type { PanelKind } from './Call.tsx'
import type { LayoutMode } from './stageLayout.ts'

export interface CallUi {
  layout: LayoutMode
  setLayout: (layout: LayoutMode) => void
  panel: PanelKind
  setPanel: (panel: PanelKind) => void
  captionsOn: boolean
  toggleCaptions: () => void
}

export const CallUiContext = createContext<CallUi | null>(null)

export function useCallUi(): CallUi {
  const ui = useContext(CallUiContext)
  if (ui === null) throw new Error('useCallUi must be used inside a CallUiContext.Provider')
  return ui
}
