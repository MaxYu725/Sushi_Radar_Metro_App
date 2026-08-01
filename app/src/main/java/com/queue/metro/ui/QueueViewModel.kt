package com.queue.metro.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.queue.metro.QueueApplication
import com.queue.metro.data.AppLanguage
import com.queue.metro.data.DisplayMode
import com.queue.metro.data.QueueSnapshot
import com.queue.metro.data.RepositoryStatus
import com.queue.metro.data.Store
import com.queue.metro.data.UserSettings
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

data class QueueUiState(
    val stores: List<Store> = emptyList(),
    val snapshots: Map<Long, QueueSnapshot> = emptyMap(),
    val settings: UserSettings = UserSettings(),
    val repositoryStatus: RepositoryStatus = RepositoryStatus(),
)

class QueueViewModel(application: Application) : AndroidViewModel(application) {
    private val repository = (application as QueueApplication).repository

    val uiState = combine(
        repository.stores,
        repository.snapshots,
        repository.preferences.settings,
        repository.status,
    ) { stores, snapshots, settings, status ->
        QueueUiState(stores, snapshots, settings, status)
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = QueueUiState(),
    )

    private var isForeground = false
    private var visiblePage = 0
    private var refreshJob: Job? = null

    init {
        viewModelScope.launch {
            repository.initialize()
            refreshPinned(manual = false)
        }
    }

    fun setForeground(value: Boolean) {
        isForeground = value
        restartAutoRefresh()
    }

    fun setVisiblePage(index: Int) {
        visiblePage = index
        restartAutoRefresh()
    }

    fun refreshPinned(manual: Boolean = true) {
        viewModelScope.launch {
            repository.refresh(uiState.value.settings.pinnedStoreIds, manual)
        }
    }

    fun refreshStores(storeIds: Set<Long>, manual: Boolean = false) {
        viewModelScope.launch {
            repository.refresh(storeIds, manual)
        }
    }

    fun setPinned(storeId: Long, pinned: Boolean) {
        viewModelScope.launch {
            val ids = uiState.value.settings.pinnedStoreIds.toMutableSet()
            if (pinned) ids.add(storeId) else ids.remove(storeId)
            repository.preferences.setPinned(ids)
            if (pinned) repository.refresh(setOf(storeId), manual = false)
        }
    }

    fun setAccent(index: Int) = launchPreference { repository.preferences.setAccent(index) }
    fun setDisplayMode(mode: DisplayMode) = launchPreference { repository.preferences.setDisplayMode(mode) }
    fun setTextScale(value: Float) = launchPreference { repository.preferences.setTextScale(value) }
    fun setRefreshSeconds(value: Int) = launchPreference {
        repository.preferences.setRefreshSeconds(value)
        restartAutoRefresh()
    }
    fun setRadius(value: Int) = launchPreference { repository.preferences.setRadius(value) }
    fun setShowMapLabels(value: Boolean) = launchPreference {
        repository.preferences.setShowMapLabels(value)
    }
    fun setDataSaver(value: Boolean) = launchPreference { repository.preferences.setDataSaver(value) }
    fun setLanguage(value: AppLanguage) = launchPreference { repository.preferences.setLanguage(value) }

    fun clearCache() {
        viewModelScope.launch {
            repository.clearCache()
            repository.initialize()
        }
    }

    fun resetSettings() {
        viewModelScope.launch { repository.preferences.reset() }
    }

    private fun launchPreference(block: suspend () -> Unit) {
        viewModelScope.launch { block() }
    }

    private fun restartAutoRefresh() {
        refreshJob?.cancel()
        if (!isForeground || visiblePage != 0) return
        refreshJob = viewModelScope.launch {
            while (isActive) {
                val interval = uiState.value.settings.refreshSeconds
                if (interval <= 0 || uiState.value.settings.dataSaver) return@launch
                delay(interval * 1_000L)
                repository.refresh(uiState.value.settings.pinnedStoreIds, manual = false)
            }
        }
    }
}
