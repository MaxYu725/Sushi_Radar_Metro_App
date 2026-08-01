package com.queue.metro.data

import android.content.Context
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

class QueueRepository(context: Context) {
    val preferences = UserPreferences(context)
    private val api = QueueApi()
    private val snapshotDiskCache = SnapshotDiskCache(context)
    private val storeDiskCache = StoreDiskCache(context)
    private val refreshMutex = Mutex()
    private val lastAttemptByStore = mutableMapOf<Long, Long>()

    private val _stores = MutableStateFlow<List<Store>>(emptyList())
    val stores: StateFlow<List<Store>> = _stores.asStateFlow()

    private val _snapshots = MutableStateFlow<Map<Long, QueueSnapshot>>(emptyMap())
    val snapshots: StateFlow<Map<Long, QueueSnapshot>> = _snapshots.asStateFlow()

    private val _status = MutableStateFlow(RepositoryStatus())
    val status: StateFlow<RepositoryStatus> = _status.asStateFlow()

    suspend fun initialize() {
        val cachedStores = storeDiskCache.read()
        if (cachedStores.isNotEmpty()) _stores.value = cachedStores

        val cachedSnapshots = snapshotDiskCache.read()
        if (cachedSnapshots.isNotEmpty()) _snapshots.value = cachedSnapshots

        _status.value = _status.value.copy(isLoading = true, message = null)
        runCatching { api.fetchStores(force = true) }
            .onSuccess { remoteStores ->
                _stores.value = remoteStores
                storeDiskCache.write(remoteStores)
                _status.value = _status.value.copy(isLoading = false, message = null)
            }
            .onFailure {
                _status.value = _status.value.copy(
                    isLoading = false,
                    message = if (cachedStores.isEmpty()) {
                        "未能載入分店目錄，請檢查網絡後重試"
                    } else {
                        "分店目錄暫時使用上次離線版本"
                    },
                )
            }
    }

    suspend fun refresh(storeIds: Set<Long>, manual: Boolean = false): Boolean =
        refreshMutex.withLock {
            if (storeIds.isEmpty()) return@withLock true
            val now = System.currentTimeMillis()
            val gap = if (manual) {
                RefreshPolicy.MANUAL_MINIMUM_GAP_MS
            } else {
                RefreshPolicy.AUTOMATIC_MINIMUM_GAP_MS
            }
            val eligibleIds = storeIds.filterTo(mutableSetOf()) { storeId ->
                val previous = _snapshots.value[storeId]
                val lastAttempt = lastAttemptByStore[storeId]
                    ?: previous?.fetchedAt
                lastAttempt == null || now - lastAttempt >= gap
            }
            if (eligibleIds.isEmpty()) {
                val nextAllowed = storeIds.mapNotNull { storeId ->
                    lastAttemptByStore[storeId] ?: _snapshots.value[storeId]?.fetchedAt
                }
                    .minOrNull()
                    ?.plus(gap)
                _status.value = _status.value.copy(
                    nextRefreshAllowedAt = nextAllowed,
                    message = if (manual) "已是最新資料" else null,
                )
                return@withLock true
            }

            _status.value = _status.value.copy(isLoading = true, message = null)
            eligibleIds.forEach { lastAttemptByStore[it] = now }
            val updates = runCatching { api.fetchQueues(eligibleIds) }
                .getOrElse {
                    _snapshots.value = _snapshots.value.mapValues { (storeId, snapshot) ->
                        if (storeId in eligibleIds) snapshot.copy(isStale = true) else snapshot
                    }
                    _status.value = _status.value.copy(
                        isLoading = false,
                        message = "未能更新，正在顯示上次資料",
                    )
                    return@withLock false
                }

            val merged = _snapshots.value.toMutableMap()
            updates.forEach { update ->
                val previous = merged[update.storeId]
                merged[update.storeId] = if (update.isStale && previous != null) {
                    previous.copy(
                        waitingGroups = update.waitingGroups ?: previous.waitingGroups,
                        isOpen = update.isOpen ?: previous.isOpen,
                        isStale = true,
                    )
                } else {
                    update
                }
            }
            _snapshots.value = merged
            snapshotDiskCache.write(merged.values)

            val successful = updates.count { !it.isStale }
            val failed = updates.size - successful
            _status.value = _status.value.copy(
                isLoading = false,
                lastSuccessfulRefresh = if (successful > 0) now else _status.value.lastSuccessfulRefresh,
                nextRefreshAllowedAt = now + gap,
                message = when {
                    failed == 0 -> null
                    successful == 0 -> "未能更新，正在顯示上次資料"
                    else -> "$failed 間分店未能更新，已保留上次資料"
                },
            )
            successful > 0
        }

    suspend fun clearCache() {
        snapshotDiskCache.clear()
        storeDiskCache.clear()
        api.clearMemoryCache()
        lastAttemptByStore.clear()
        _stores.value = emptyList()
        _snapshots.value = emptyMap()
        _status.value = RepositoryStatus(message = "快取已清除")
    }
}
