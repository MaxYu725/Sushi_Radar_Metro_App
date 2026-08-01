package com.queue.metro

import android.app.Application
import com.queue.metro.data.QueueRepository

class QueueApplication : Application() {
    val repository: QueueRepository by lazy { QueueRepository(this) }
}
