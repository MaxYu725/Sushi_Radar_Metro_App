package com.queue.metro.admin

data class AdminDevice(
    val id: String,
    val status: String,
    val note: String,
    val userAgent: String,
    val firstSeenAt: Long,
    val lastSeenAt: Long,
    val authorizedAt: Long?,
    val blockedAt: Long?,
)

data class ApprovalCandidate(
    val requestId: String,
    val deviceId: String,
    val userAgent: String,
    val createdAt: Long,
    val expiresAt: Long,
    val note: String,
)

data class AdminUiState(
    val serverUrl: String = "",
    val adminId: String = "",
    val isBusy: Boolean = false,
    val message: String = "",
    val devices: List<AdminDevice> = emptyList(),
    val candidate: ApprovalCandidate? = null,
    val statusFilter: String = "all",
    val search: String = "",
    val oldestFirst: Boolean = false,
)

class AdminApiException(message: String) : Exception(message)
