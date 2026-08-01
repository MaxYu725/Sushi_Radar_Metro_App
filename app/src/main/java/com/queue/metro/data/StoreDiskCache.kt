package com.queue.metro.data

import android.content.Context
import java.io.File
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class StoreDiskCache(context: Context) {
    private val file = File(context.filesDir, "store_directory.json")

    suspend fun read(): List<Store> = withContext(Dispatchers.IO) {
        runCatching {
            if (!file.exists()) return@runCatching emptyList()
            val array = JSONArray(file.readText(Charsets.UTF_8))
            buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    add(
                        Store(
                            id = item.getLong("id"),
                            name = item.optString("name"),
                            nameEn = item.optString("nameEn"),
                            region = runCatching {
                                Region.valueOf(item.optString("region"))
                            }.getOrDefault(Region.UNKNOWN),
                            district = item.optString("district", "其他"),
                            address = item.optString("address"),
                            latitude = item.nullableDouble("latitude"),
                            longitude = item.nullableDouble("longitude"),
                            sortOrder = item.optInt("sortOrder", 0),
                        ),
                    )
                }
            }
        }.getOrDefault(emptyList())
    }

    suspend fun write(stores: Collection<Store>) = withContext(Dispatchers.IO) {
        val array = JSONArray()
        stores.forEach { store ->
            array.put(
                JSONObject()
                    .put("id", store.id)
                    .put("name", store.name)
                    .put("nameEn", store.nameEn)
                    .put("region", store.region.name)
                    .put("district", store.district)
                    .put("address", store.address)
                    .put("latitude", store.latitude ?: JSONObject.NULL)
                    .put("longitude", store.longitude ?: JSONObject.NULL)
                    .put("sortOrder", store.sortOrder),
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

    private fun JSONObject.nullableDouble(key: String): Double? =
        opt(key)
            ?.takeUnless { it == JSONObject.NULL }
            ?.toString()
            ?.toDoubleOrNull()
            ?.takeIf(Double::isFinite)
}
