package com.queue.metro.admin

import android.app.Application
import android.net.Uri
import android.util.Base64
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import androidx.core.net.toUri
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.security.SecureRandom
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class AdminViewModel(application: Application) : AndroidViewModel(application) {
    private val preferences = AdminPreferences(application)
    private val keys = AdminKeyManager()
    private val api = AdminApi(keys)
    private val scanner: BarcodeScanner = BarcodeScanning.getClient(
        BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build(),
    )
    private val _state = MutableStateFlow(
        AdminUiState(serverUrl = preferences.serverUrl, adminId = preferences.adminId),
    )
    val state: StateFlow<AdminUiState> = _state.asStateFlow()

    fun setServerUrl(value: String) { _state.value = _state.value.copy(serverUrl = value) }
    fun setSearch(value: String) { _state.value = _state.value.copy(search = value) }
    fun setStatusFilter(value: String) { _state.value = _state.value.copy(statusFilter = value) }
    fun setOldestFirst(value: Boolean) { _state.value = _state.value.copy(oldestFirst = value) }
    fun clearCandidate() { _state.value = _state.value.copy(candidate = null) }
    fun clearMessage() { _state.value = _state.value.copy(message = "") }

    fun saveServerUrl() {
        val normalized = _state.value.serverUrl.trim().trimEnd('/')
        preferences.serverUrl = normalized
        _state.value = _state.value.copy(serverUrl = normalized, message = "管理服務網址已儲存")
    }

    fun bootstrap(displayName: String, bootstrapCode: String) {
        launchBusy {
            val serverUrl = normalizedServer()
            val adminId = preferences.adminId.ifBlank { newAdminId() }
            keys.ensureKey()
            api.bootstrap(serverUrl, adminId, displayName.trim().ifBlank { "Owner" }, bootstrapCode)
            preferences.serverUrl = serverUrl
            preferences.adminId = adminId
            _state.value = _state.value.copy(adminId = adminId, serverUrl = serverUrl, message = "擁有者初始化完成")
            loadDevicesInternal()
        }
    }

    fun handleQr(rawValue: String) {
        launchBusy {
            val uri = rawValue.toUri()
            if (uri.scheme != "queue-metro" || uri.host != "enroll" || uri.getQueryParameter("v") != "1") {
                throw AdminApiException("這不是 Sushi Radar 授權 QR")
            }
            val expiresAt = uri.getQueryParameter("e")?.toLongOrNull() ?: 0L
            if (expiresAt <= System.currentTimeMillis()) throw AdminApiException("QR 已過期")
            val token = uri.getQueryParameter("t").orEmpty()
            if (token.isBlank()) throw AdminApiException("QR 缺少一次性代碼")
            val current = requireConfigured()
            val candidate = api.resolve(current.first, current.second, token)
            _state.value = _state.value.copy(candidate = candidate, message = "已讀取待批裝置")
        }
    }

    fun scanImage(uri: Uri) {
        launchBusy {
            val image = InputImage.fromFilePath(getApplication(), uri)
            val raw = scan(image) ?: throw AdminApiException("圖片中找不到可讀的 QR code")
            handleQrInternal(raw)
        }
    }

    fun decide(decision: String, note: String) {
        launchBusy {
            val candidate = _state.value.candidate ?: throw AdminApiException("沒有待處理申請")
            val current = requireConfigured()
            api.decide(current.first, current.second, candidate.requestId, decision, note)
            _state.value = _state.value.copy(candidate = null, message = when (decision) {
                "allow" -> "已允許此裝置"
                "block" -> "已封鎖此裝置"
                else -> "已取消申請"
            })
            loadDevicesInternal()
        }
    }

    fun loadDevices() {
        launchBusy { loadDevicesInternal() }
    }

    fun updateDevice(device: AdminDevice, action: String, note: String = device.note) {
        launchBusy {
            val current = requireConfigured()
            api.updateDevice(current.first, current.second, device.id, action, note)
            _state.value = _state.value.copy(message = when (action) {
                "unblock" -> "已解封；裝置須重新提交 QR 才可獲批"
                "block" -> "已封鎖裝置"
                "revoke" -> "已撤銷裝置授權"
                else -> "已允許裝置"
            })
            loadDevicesInternal()
        }
    }

    private suspend fun handleQrInternal(rawValue: String) {
        val uri = rawValue.toUri()
        if (uri.scheme != "queue-metro" || uri.host != "enroll" || uri.getQueryParameter("v") != "1") {
            throw AdminApiException("這不是 Sushi Radar 授權 QR")
        }
        val expiresAt = uri.getQueryParameter("e")?.toLongOrNull() ?: 0L
        if (expiresAt <= System.currentTimeMillis()) throw AdminApiException("QR 已過期")
        val token = uri.getQueryParameter("t").orEmpty()
        if (token.isBlank()) throw AdminApiException("QR 缺少一次性代碼")
        val current = requireConfigured()
        _state.value = _state.value.copy(candidate = api.resolve(current.first, current.second, token), message = "已讀取待批裝置")
    }

    private suspend fun loadDevicesInternal() {
        val current = requireConfigured()
        val snapshot = _state.value
        val devices = api.devices(
            current.first,
            current.second,
            snapshot.statusFilter,
            snapshot.search,
            snapshot.oldestFirst,
        )
        _state.value = _state.value.copy(devices = devices)
    }

    private suspend fun scan(image: InputImage): String? = suspendCancellableCoroutine { continuation ->
        scanner.process(image)
            .addOnSuccessListener { barcodes ->
                if (continuation.isActive) continuation.resume(barcodes.firstNotNullOfOrNull { it.rawValue })
            }
            .addOnFailureListener { error -> if (continuation.isActive) continuation.resumeWithException(error) }
    }

    private fun launchBusy(block: suspend () -> Unit) {
        if (_state.value.isBusy) return
        viewModelScope.launch {
            _state.value = _state.value.copy(isBusy = true, message = "")
            runCatching { block() }
                .onFailure { error -> _state.value = _state.value.copy(message = error.message ?: "管理操作失敗") }
            _state.value = _state.value.copy(isBusy = false)
        }
    }

    private fun requireConfigured(): Pair<String, String> {
        val serverUrl = normalizedServer()
        val adminId = _state.value.adminId.ifBlank { preferences.adminId }
        if (adminId.isBlank()) throw AdminApiException("請先完成擁有者初始化")
        return serverUrl to adminId
    }

    private fun normalizedServer(): String = _state.value.serverUrl.trim().trimEnd('/').ifBlank {
        throw AdminApiException("請輸入管理服務網址")
    }

    private fun newAdminId(): String {
        val bytes = ByteArray(18).also(SecureRandom()::nextBytes)
        return "adm_" + Base64.encodeToString(bytes, Base64.URL_SAFE or Base64.NO_WRAP or Base64.NO_PADDING)
    }

    override fun onCleared() {
        scanner.close()
        super.onCleared()
    }
}
