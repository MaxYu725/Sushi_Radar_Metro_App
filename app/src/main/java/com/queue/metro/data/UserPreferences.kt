package com.queue.metro.data

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.floatPreferencesKey
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.map

private val Context.settingsDataStore by preferencesDataStore(name = "metro_settings")

class UserPreferences(private val context: Context) {
    private object Keys {
        val accent = intPreferencesKey("accent")
        val displayMode = stringPreferencesKey("display_mode")
        val textScale = floatPreferencesKey("text_scale")
        val refreshSeconds = intPreferencesKey("refresh_seconds")
        val radius = intPreferencesKey("radius")
        val showMapLabels = intPreferencesKey("show_map_labels")
        val dataSaver = intPreferencesKey("data_saver")
        val language = stringPreferencesKey("language")
        val pinned = stringPreferencesKey("pinned")
    }

    val settings: Flow<UserSettings> = context.settingsDataStore.data
        .catch { emit(androidx.datastore.preferences.core.emptyPreferences()) }
        .map { values ->
            UserSettings(
                accentIndex = values[Keys.accent] ?: 2,
                displayMode = values[Keys.displayMode]
                    ?.let { runCatching { DisplayMode.valueOf(it) }.getOrNull() }
                    ?: DisplayMode.DARK,
                textScale = (values[Keys.textScale] ?: 1f).coerceIn(.8f, 1.4f),
                refreshSeconds = values[Keys.refreshSeconds] ?: 60,
                nearbyRadiusMeters = values[Keys.radius] ?: 800,
                showMapLabels = (values[Keys.showMapLabels] ?: 1) == 1,
                dataSaver = (values[Keys.dataSaver] ?: 0) == 1,
                language = values[Keys.language]
                    ?.let { runCatching { AppLanguage.valueOf(it) }.getOrNull() }
                    ?: AppLanguage.SYSTEM,
                pinnedStoreIds = values[Keys.pinned]
                    ?.split(',')
                    ?.mapNotNull(String::toLongOrNull)
                    ?.toSet()
                    ?: emptySet(),
            )
        }

    suspend fun setAccent(index: Int) = edit { it[Keys.accent] = index }
    suspend fun setDisplayMode(value: DisplayMode) = edit { it[Keys.displayMode] = value.name }
    suspend fun setTextScale(value: Float) = edit { it[Keys.textScale] = value.coerceIn(.8f, 1.4f) }
    suspend fun setRefreshSeconds(value: Int) = edit { it[Keys.refreshSeconds] = value }
    suspend fun setRadius(value: Int) = edit { it[Keys.radius] = value }
    suspend fun setShowMapLabels(value: Boolean) = edit { it[Keys.showMapLabels] = if (value) 1 else 0 }
    suspend fun setDataSaver(value: Boolean) = edit { it[Keys.dataSaver] = if (value) 1 else 0 }
    suspend fun setLanguage(value: AppLanguage) = edit { it[Keys.language] = value.name }
    suspend fun setPinned(ids: Set<Long>) = edit { it[Keys.pinned] = ids.sorted().joinToString(",") }

    suspend fun reset() {
        context.settingsDataStore.edit { it.clear() }
    }

    private suspend fun edit(block: (androidx.datastore.preferences.core.MutablePreferences) -> Unit) {
        context.settingsDataStore.edit(block)
    }
}
