// Plain constants with no imports, so UI components can use them without loading the Supabase client.
export const MAX_IMAGES_PER_FINDING = 10
export const SIGNED_URL_TTL_SECONDS = 3600

// Task attachments. The server enforces the same numbers (task_attachments migration).
export const MAX_ATTACHMENTS_PER_TASK = 10
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024
