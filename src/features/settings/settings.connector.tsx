'use client'

import { SettingsView } from './settings.view'
import { useSettingsController } from './use-settings-controller'

export function SettingsConnector() {
  return <SettingsView {...useSettingsController()} />
}
