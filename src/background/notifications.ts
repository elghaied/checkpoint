// Browser notification creation for new chapter releases

export interface NotificationOptions {
  title: string
  chaptersAhead: number
  coverImage?: string
  providerId: string
}

/**
 * Show a browser notification for new chapters.
 */
export async function showNewChaptersNotification(options: NotificationOptions): Promise<void> {
  const { title, chaptersAhead, coverImage, providerId } = options

  const message =
    chaptersAhead === 1
      ? '1 new chapter available!'
      : `${chaptersAhead} new chapters available!`

  const notificationId = `checkpoint-${providerId}-${Date.now()}`

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: coverImage || chrome.runtime.getURL('icons/icon128.png'),
      title: `Checkpoint: ${title}`,
      message,
      priority: 1,
    })

    console.log('[notifications] Showed notification for', title, '-', message)
  } catch (err) {
    console.error('[notifications] Failed to create notification:', err)
  }
}

/**
 * Show a summary notification for multiple items with new chapters.
 */
export async function showBatchNotification(count: number): Promise<void> {
  const notificationId = `checkpoint-batch-${Date.now()}`

  try {
    await chrome.notifications.create(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title: 'Checkpoint',
      message: `${count} tracked manga have new chapters available!`,
      priority: 1,
    })

    console.log('[notifications] Showed batch notification for', count, 'items')
  } catch (err) {
    console.error('[notifications] Failed to create batch notification:', err)
  }
}
