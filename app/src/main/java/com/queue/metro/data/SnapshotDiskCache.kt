package com.queue.metro.data

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

class SnapshotDiskCache(context: Context) {
    private val file = File(context.filesDir, "queue_snapshots.json")

    suspend fun read(): Map<Long, QueueSnapshot> = withContext(Dispatchers.IO) {
        runCatching {
            if (!file.exists()) return@runCatching emptyMap()
            val array = JSONArray(file.readText(Charsets.UTF_8))
            buildMap {
                for (index in 0 until array.length()) {
                    val item = array.getJSONObject(index)
                    val numbers = item.optJSONArray("numbers") ?: JSONArray()
                    val snapshot = QueueSnapshot(
                        storeId = item.getLong("storeId"),
                        waitingGroups = if (item.isNull("waiting")) null else item.optInt("waiting"),
                        currentNumbers = buildList {
                            for (numberIndex in 0 until numbers.length()) add(numbers.optString(numberIndex))
                        }.filter(String::isNotBlank),
                        isOpen = if (item.isNull("open")) null else item.optBoolean("open"),
                        sourceUpdatedAt = item.optLong("sourceUpdatedAt"),
                        fetchedAt = item.optLong("fetchedAt"),
                        isStale = true,
                    )
                    put(snapshot.storeId, snapshot)
                }
            }
        }.getOrDefault(emptyMap())
    }

    suspend fun write(snapshots: Collection<QueueSnapshot>) = withContext(Dispatchers.IO) {
        val array = JSONArray()
        snapshots.forEach { snapshot ->
            array.put(
                JSONObject()
                    .put("storeId", snapshot.storeId)
                    .put("waiting", snapshot.waitingGroups)
                    .put("numbers", JSONArray(snapshot.currentNumbers))
                    .put("open", snapshot.isOpen)
                    .put("sourceUpdatedAt", snapshot.sourceUpdatedAt)
                    .put("fetchedAt", snapshot.fetchedAt),
            )
        }
        val temp = File(file.parentFile, "${file.name}.tmp")
        temp.writeText(array.toString(), Charsets.UTF_8)
        if (!temp.renameTo(file)) {
            file.writeText(array.toString(), Charsets.UTF_8)
            temp.delete()
        }
    }

    suspend fun clear() = withContext(Dispatchers.IO) {
        if (file.exists()) file.delete()
    }
}
