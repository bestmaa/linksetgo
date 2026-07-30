import type { TaskHandler } from 'payload'

export const CLOUD_ACCOUNT_EMAIL_OUTBOX_QUEUE = 'cloud-account-email-outbox'
export const CLOUD_ACCOUNT_EMAIL_OUTBOX_TASK = 'deliver-cloud-account-email'

export type CloudAccountEmailTask = {
  input: {
    encryptedEnvelope: string
    expiresAt: string
  }
  output: {
    delivered: boolean
  }
}

// Keep the Payload config importable by its standalone CLI. The server-only
// delivery stack is loaded only when a worker actually executes this task.
export const deliverCloudAccountEmailTask: TaskHandler<CloudAccountEmailTask> = async ({
  input,
}) => {
  const { handleCloudAccountEmailTask } = await import('./cloud-account-email-outbox')
  return handleCloudAccountEmailTask(input)
}
