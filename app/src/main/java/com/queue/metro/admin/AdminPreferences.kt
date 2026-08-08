package com.queue.metro.admin

import android.content.Context
import androidx.core.content.edit
import com.queue.metro.BuildConfig

class AdminPreferences(context: Context) {
    private val preferences = context.getSharedPreferences("queue_metro_admin", Context.MODE_PRIVATE)

    var serverUrl: String
        get() {
            val saved = preferences.getString(KEY_SERVER_URL, BuildConfig.ADMIN_API_BASE_URL).orEmpty().trimEnd('/')
            if (saved == LEGACY_SERVER_URL) {
                val current = BuildConfig.ADMIN_API_BASE_URL.trimEnd('/')
                preferences.edit { putString(KEY_SERVER_URL, current) }
                return current
            }
            return saved
        }
        set(value) { preferences.edit { putString(KEY_SERVER_URL, value.trim().trimEnd('/')) } }

    var adminId: String
        get() = preferences.getString(KEY_ADMIN_ID, "").orEmpty()
        set(value) { preferences.edit { putString(KEY_ADMIN_ID, value) } }

    companion object {
        private const val KEY_SERVER_URL = "server_url"
        private const val KEY_ADMIN_ID = "admin_id"
        private const val LEGACY_SERVER_URL = "https://queue-metro-api.maxyu0725.workers.dev"
    }
}
