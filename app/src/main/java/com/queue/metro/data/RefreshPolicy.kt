package com.queue.metro.data

object RefreshPolicy {
    const val MANUAL_MINIMUM_GAP_MS = 10_000L
    const val AUTOMATIC_MINIMUM_GAP_MS = 45_000L

    fun canRefresh(now: Long, lastRefresh: Long?, manual: Boolean): Boolean {
        if (lastRefresh == null) return true
        val gap = if (manual) MANUAL_MINIMUM_GAP_MS else AUTOMATIC_MINIMUM_GAP_MS
        return now - lastRefresh >= gap
    }
}
