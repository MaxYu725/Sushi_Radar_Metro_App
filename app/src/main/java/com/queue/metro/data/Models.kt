package com.queue.metro.data

enum class Region(val label: String, val sortOrder: Int) {
    HONG_KONG("港島", 0),
    KOWLOON("九龍", 1),
    NEW_TERRITORIES("新界", 2),
    UNKNOWN("其他", 3);

    companion object {
        private val hongKongTerms = listOf(
            "港島", "Hong Kong", "中西區", "灣仔", "東區", "南區",
            "銅鑼灣", "北角", "柴灣", "黃竹坑", "上環",
        )
        private val kowloonTerms = listOf(
            "九龍", "Kowloon", "油尖旺", "深水埗", "九龍城", "黃大仙",
            "觀塘", "旺角", "尖沙咀", "黃埔", "樂富", "九龍灣",
        )
        private val newTerritoriesTerms = listOf(
            "新界", "New Territories", "離島", "葵青", "荃灣", "屯門",
            "元朗", "北區", "大埔", "沙田", "西貢", "將軍澳",
        )

        fun from(value: String): Region = when {
            hongKongTerms.any { value.contains(it, ignoreCase = true) } -> HONG_KONG
            kowloonTerms.any { value.contains(it, ignoreCase = true) } -> KOWLOON
            newTerritoriesTerms.any { value.contains(it, ignoreCase = true) } -> NEW_TERRITORIES
            else -> UNKNOWN
        }
    }
}

data class Store(
    val id: Long,
    val name: String,
    val nameEn: String,
    val region: Region,
    val district: String,
    val latitude: Double?,
    val longitude: Double?,
    val sortOrder: Int = 0,
)

data class QueueSnapshot(
    val storeId: Long,
    val waitingGroups: Int?,
    val currentNumbers: List<String>,
    val isOpen: Boolean?,
    val sourceUpdatedAt: Long,
    val fetchedAt: Long,
    val isStale: Boolean = false,
)

enum class DisplayMode { DARK, LIGHT, SYSTEM }

enum class AppLanguage { SYSTEM, ZH_HK, ENGLISH }

data class UserSettings(
    val accentIndex: Int = 2,
    val displayMode: DisplayMode = DisplayMode.DARK,
    val textScale: Float = 1f,
    val refreshSeconds: Int = 60,
    val nearbyRadiusMeters: Int = 800,
    val showMapLabels: Boolean = true,
    val dataSaver: Boolean = false,
    val language: AppLanguage = AppLanguage.SYSTEM,
    val pinnedStoreIds: Set<Long> = emptySet(),
)

data class RepositoryStatus(
    val isLoading: Boolean = false,
    val lastSuccessfulRefresh: Long? = null,
    val nextRefreshAllowedAt: Long? = null,
    val message: String? = null,
)
