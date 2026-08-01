package com.queue.metro.data

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.Semaphore
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.sync.withPermit
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class QueueApi {
    private data class RemoteStore(
        val store: Store,
        val waitingGroups: Int?,
        val isOpen: Boolean?,
    )

    private data class StoreCache(
        val stores: List<RemoteStore>,
        val fetchedAt: Long,
    )

    private val storeCacheMutex = Mutex()
    private val queueSemaphore = Semaphore(MAX_CONCURRENT_QUEUE_REQUESTS)
    private var storeCache: StoreCache? = null

    suspend fun fetchStores(force: Boolean = false): List<Store> =
        fetchRemoteStores(force).map(RemoteStore::store)

    suspend fun fetchQueues(storeIds: Set<Long>): List<QueueSnapshot> {
        if (storeIds.isEmpty()) return emptyList()
        val stores = fetchRemoteStores(force = false).associateBy { it.store.id }
        return coroutineScope {
            storeIds.sorted().map { storeId ->
                async(Dispatchers.IO) {
                    queueSemaphore.withPermit {
                        val metadata = stores[storeId]
                        runCatching { fetchQueue(storeId, metadata) }
                            .getOrElse {
                                val now = System.currentTimeMillis()
                                QueueSnapshot(
                                    storeId = storeId,
                                    waitingGroups = metadata?.waitingGroups,
                                    currentNumbers = emptyList(),
                                    isOpen = metadata?.isOpen,
                                    sourceUpdatedAt = now,
                                    fetchedAt = now,
                                    isStale = true,
                                )
                            }
                    }
                }
            }.awaitAll()
        }
    }

    fun clearMemoryCache() {
        storeCache = null
    }

    private suspend fun fetchRemoteStores(force: Boolean): List<RemoteStore> =
        storeCacheMutex.withLock {
            val now = System.currentTimeMillis()
            val cached = storeCache
            if (!force && cached != null && now - cached.fetchedAt < STORE_CACHE_TTL_MS) {
                return@withLock cached.stores
            }
            val body = withContext(Dispatchers.IO) { get(STORES_URL) }
            val array = when {
                body.trimStart().startsWith("[") -> JSONArray(body)
                else -> JSONObject(body).optJSONArray("stores") ?: JSONArray()
            }
            val stores = buildList {
                for (index in 0 until array.length()) {
                    val item = array.optJSONObject(index) ?: continue
                    val id = item.longValue("id") ?: continue
                    val area = item.stringValue("district")
                        .ifBlank { item.stringValue("area") }
                        .ifBlank { "其他" }
                    val regionText = listOf(
                        item.stringValue("region"),
                        area,
                        item.stringValue("address"),
                    ).joinToString(" ")
                    val status = item.stringValue("storeStatus")
                    add(
                        RemoteStore(
                            store = Store(
                                id = id,
                                name = item.stringValue("name").ifBlank { "未命名分店" },
                                nameEn = item.stringValue("nameEn"),
                                region = Region.from(regionText),
                                district = area,
                                latitude = item.doubleValue("latitude")
                                    ?: item.doubleValue("lat"),
                                longitude = item.doubleValue("longitude")
                                    ?: item.doubleValue("lng"),
                                sortOrder = item.intValue("sortOrder") ?: 0,
                            ),
                            waitingGroups = item.intValue("waitingGroup")
                                ?: item.intValue("wait"),
                            isOpen = status.takeIf(String::isNotBlank)
                                ?.equals("OPEN", ignoreCase = true),
                        ),
                    )
                }
            }.sortedWith(compareBy({ it.store.region.sortOrder }, { it.store.sortOrder }, { it.store.name }))
            if (stores.isEmpty()) throw QueueApiException("分店服務沒有傳回資料")
            storeCache = StoreCache(stores, now)
            stores
        }

    private fun fetchQueue(storeId: Long, metadata: RemoteStore?): QueueSnapshot {
        val now = System.currentTimeMillis()
        val body = get("$QUEUES_URL?region=HK&storeid=$storeId")
        val payload = JSONObject(body)
        val numbers = when {
            payload.has("mixedQueue") -> payload.optJSONArray("mixedQueue").queueNumbers()
            payload.has("storeQueue") -> payload.optJSONArray("storeQueue").queueNumbers()
            else -> (
                payload.optJSONArray("boothQueue").queueNumbers() +
                    payload.optJSONArray("counterQueue").queueNumbers()
                ).distinct()
        }
        return QueueSnapshot(
            storeId = storeId,
            waitingGroups = metadata?.waitingGroups,
            currentNumbers = numbers,
            isOpen = metadata?.isOpen,
            sourceUpdatedAt = now,
            fetchedAt = now,
            isStale = false,
        )
    }

    private fun get(url: String): String {
        val connection = URL(url).openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "GET"
            connection.connectTimeout = 8_000
            connection.readTimeout = 8_000
            connection.useCaches = true
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("User-Agent", "QueueMetro-Android/1.1")
            val status = connection.responseCode
            if (status !in 200..299) throw QueueApiException("資料服務回應 $status")
            connection.inputStream.bufferedReader(Charsets.UTF_8).use { it.readText() }
        } finally {
            connection.disconnect()
        }
    }

    private fun JSONArray?.queueNumbers(): List<String> {
        if (this == null) return emptyList()
        return buildList {
            for (index in 0 until length()) {
                val value = opt(index)
                val number = when (value) {
                    is JSONObject -> listOf("queueNo", "queueNumber", "number", "ticket")
                        .firstNotNullOfOrNull { key ->
                            value.stringValue(key).takeIf(String::isNotBlank)
                        }
                    null, JSONObject.NULL -> null
                    else -> value.toString()
                }
                number?.trim()?.takeIf(String::isNotBlank)?.let(::add)
            }
        }.distinct()
    }

    private fun JSONObject.stringValue(key: String): String =
        opt(key)?.takeUnless { it == JSONObject.NULL }?.toString()?.trim().orEmpty()

    private fun JSONObject.longValue(key: String): Long? =
        stringValue(key).toLongOrNull()

    private fun JSONObject.intValue(key: String): Int? =
        stringValue(key).toIntOrNull()

    private fun JSONObject.doubleValue(key: String): Double? =
        stringValue(key).toDoubleOrNull()?.takeIf(Double::isFinite)

    private companion object {
        const val STORES_URL =
            "https://sushipass.sushiro.com.hk/api/2.0/info/storelist" +
                "?latitude=22&longitude=114&numresults=100&region=HK"
        const val QUEUES_URL =
            "https://sushipass.sushiro.com.hk/api/2.0/remote/groupqueues"
        const val STORE_CACHE_TTL_MS = 60_000L
        const val MAX_CONCURRENT_QUEUE_REQUESTS = 3
    }
}

class QueueApiException(message: String) : Exception(message)
