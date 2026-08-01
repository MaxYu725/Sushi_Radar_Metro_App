package com.queue.metro

import android.app.Application
import com.queue.metro.data.QueueRepository
import org.maplibre.android.MapLibre

class QueueApplication : Application() {
    val repository: QueueRepository by lazy { QueueRepository(this) }

    override fun onCreate() {
        super.onCreate()
        MapLibre.getInstance(this)
    }
}
