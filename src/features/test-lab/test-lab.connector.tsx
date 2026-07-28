'use client'

import { TestLabView } from './test-lab.view'
import { useTestLabController } from './use-test-lab-controller'

export function TestLabConnector() {
  return <TestLabView {...useTestLabController()} />
}
