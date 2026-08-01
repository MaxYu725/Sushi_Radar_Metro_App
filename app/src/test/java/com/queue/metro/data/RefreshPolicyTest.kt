package com.queue.metro.data

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RefreshPolicyTest {
    @Test
    fun firstRefreshIsAlwaysAllowed() {
        assertTrue(RefreshPolicy.canRefresh(now = 1_000L, lastRefresh = null, manual = false))
    }

    @Test
    fun manualRefreshIsDebouncedForTenSeconds() {
        assertFalse(RefreshPolicy.canRefresh(now = 9_999L, lastRefresh = 0L, manual = true))
        assertTrue(RefreshPolicy.canRefresh(now = 10_000L, lastRefresh = 0L, manual = true))
    }

    @Test
    fun automaticRefreshUsesSharedCacheWindow() {
        assertFalse(RefreshPolicy.canRefresh(now = 44_999L, lastRefresh = 0L, manual = false))
        assertTrue(RefreshPolicy.canRefresh(now = 45_000L, lastRefresh = 0L, manual = false))
    }
}
