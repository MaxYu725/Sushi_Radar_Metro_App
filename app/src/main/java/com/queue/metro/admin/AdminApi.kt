package com.queue.metro.admin

import android.util.Base64
import com.queue.metro.BuildConfig
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.security.MessageDigest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject

class AdminApi(private val keys: AdminKeyManager) {
    suspend fun bootstrap(
        serverUrl: String,
        adminId: String,
        displayName: String,
        bootstrapCode: String,
    ) = withContext(Dispatchers.IO) {
        validateServerUrl(serverUrl)
        val challenge = challenge(serverUrl, null)
        val body = JSONObject()
            .put("adminId", adminId)
            .put("displayName", displayName)
            .put("publicKey", keys.publicKeySpki())
            .put("bootstrapCode", bootstrapCode)
            .toString()
        signedConnection(serverUrl, adminId, "POST", "/api/admin/bootstrap", body, challenge)
    }

    suspend fun resolve(serverUrl: String, adminId: String, approvalToken: String): ApprovalCandidate =
        withContext(Dispatchers.IO) {
            val body = JSONObject().put("approvalToken", approvalToken).toString()
            val payload = signedRequest(serverUrl, adminId, "POST", "/api/admin/resolve", body)
            ApprovalCandidate(
                requestId = payload.getString("requestId"),
                deviceId = payload.getString("deviceId"),
                userAgent = payload.optString("userAgent"),
                createdAt = payload.optLong("createdAt"),
                expiresAt = payload.optLong("expiresAt"),
                note = payload.optString("note"),
            )
        }

    suspend fun decide(
        serverUrl: String,
        adminId: String,
        requestId: String,
        decision: String,
        note: String,
    ) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("decision", decision).put("note", note).toString()
        signedRequest(
            serverUrl,
            adminId,
            "POST",
            "/api/admin/enrollment/${encode(requestId)}/decision",
            body,
        )
    }

    suspend fun devices(
        serverUrl: String,
        adminId: String,
        status: String,
        search: String,
        oldestFirst: Boolean,
    ): List<AdminDevice> = withContext(Dispatchers.IO) {
        val query = buildList {
            if (status != "all") add("status=${encode(status)}")
            if (search.isNotBlank()) add("search=${encode(search)}")
            add("sort=${if (oldestFirst) "oldest" else "newest"}")
        }.joinToString("&")
        val payload = signedRequest(serverUrl, adminId, "GET", "/api/admin/devices?$query", "")
        payload.optJSONArray("devices").toDevices()
    }

    suspend fun updateDevice(
        serverUrl: String,
        adminId: String,
        deviceId: String,
        action: String,
        note: String,
    ) = withContext(Dispatchers.IO) {
        val body = JSONObject().put("action", action).put("note", note).toString()
        signedRequest(serverUrl, adminId, "PATCH", "/api/admin/devices/${encode(deviceId)}", body)
    }

    private fun signedRequest(
        serverUrl: String,
        adminId: String,
        method: String,
        path: String,
        body: String,
    ): JSONObject {
        validateServerUrl(serverUrl)
        val challenge = challenge(serverUrl, adminId)
        return signedConnection(serverUrl, adminId, method, path, body, challenge)
    }

    private fun challenge(serverUrl: String, adminId: String?): Challenge {
        val body = JSONObject().apply { if (adminId != null) put("adminId", adminId) }.toString()
        val response = connection(serverUrl, "POST", "/api/admin/challenge", body)
        return Challenge(response.getString("challengeId"), response.optLong("expiresAt"))
    }

    private fun signedConnection(
        serverUrl: String,
        adminId: String,
        method: String,
        path: String,
        body: String,
        challenge: Challenge,
    ): JSONObject {
        if (challenge.expiresAt <= System.currentTimeMillis()) throw AdminApiException("管理員挑戰已過期")
        val timestamp = System.currentTimeMillis().toString()
        val canonical = listOf("QM1", method.uppercase(), path, challenge.id, timestamp, sha256(body)).joinToString("\n")
        val headers = mapOf(
            "X-Admin-Id" to adminId,
            "X-Admin-Challenge" to challenge.id,
            "X-Admin-Timestamp" to timestamp,
            "X-Admin-Signature" to keys.sign(canonical),
        )
        return connection(serverUrl, method, path, body, headers)
    }

    private fun connection(
        serverUrl: String,
        method: String,
        path: String,
        body: String,
        headers: Map<String, String> = emptyMap(),
    ): JSONObject {
        val connection = URL(serverUrl.trimEnd('/') + path).openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = method
            connection.connectTimeout = 10_000
            connection.readTimeout = 10_000
            connection.setRequestProperty("Accept", "application/json")
            connection.setRequestProperty("Content-Type", "application/json")
            connection.setRequestProperty("User-Agent", "QueueMetro-Admin/1.2")
            for ((name, value) in headers) connection.setRequestProperty(name, value)
            if (method != "GET") {
                connection.doOutput = true
                connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            }
            val status = connection.responseCode
            val text = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            val json = runCatching { JSONObject(text) }.getOrElse { JSONObject() }
            if (status !in 200..299) throw AdminApiException(json.optString("error").ifBlank { "管理服務回應 $status" })
            json
        } finally {
            connection.disconnect()
        }
    }

    private fun validateServerUrl(serverUrl: String) {
        val url = runCatching { URL(serverUrl) }.getOrElse { throw AdminApiException("管理服務網址格式不正確") }
        val localDebug = BuildConfig.DEBUG && (url.host == "10.0.2.2" || url.host == "localhost" || url.host == "127.0.0.1")
        if (url.protocol != "https" && !localDebug) throw AdminApiException("管理服務必須使用 HTTPS")
    }

    private fun sha256(value: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray(Charsets.UTF_8))
        return Base64.encodeToString(digest, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    private fun encode(value: String): String = URLEncoder.encode(value, Charsets.UTF_8.name())

    private fun JSONArray?.toDevices(): List<AdminDevice> = buildList {
        if (this@toDevices == null) return@buildList
        for (index in 0 until length()) {
            val item = optJSONObject(index) ?: continue
            add(
                AdminDevice(
                    id = item.optString("id"),
                    status = item.optString("status"),
                    note = item.optString("note"),
                    userAgent = item.optString("userAgent"),
                    firstSeenAt = item.optLong("firstSeenAt"),
                    lastSeenAt = item.optLong("lastSeenAt"),
                    authorizedAt = item.optLongOrNull("authorizedAt"),
                    blockedAt = item.optLongOrNull("blockedAt"),
                ),
            )
        }
    }

    private fun JSONObject.optLongOrNull(key: String): Long? =
        if (has(key) && !isNull(key)) optLong(key) else null

    private data class Challenge(val id: String, val expiresAt: Long)
}
