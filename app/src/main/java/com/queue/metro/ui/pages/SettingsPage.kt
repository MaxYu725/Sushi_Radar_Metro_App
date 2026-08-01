package com.queue.metro.ui.pages

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.queue.metro.data.AppLanguage
import com.queue.metro.data.DisplayMode
import com.queue.metro.ui.AccentOptions
import com.queue.metro.ui.LocalMetroColors
import com.queue.metro.ui.QueueUiState
import com.queue.metro.ui.QueueViewModel
import com.queue.metro.ui.components.MetroButton
import com.queue.metro.ui.components.MetroChoice
import com.queue.metro.ui.components.MetroDivider
import com.queue.metro.ui.components.MetroSectionLabel
import com.queue.metro.ui.components.MetroSwitch
import kotlin.math.roundToInt

@Composable
fun SettingsPage(state: QueueUiState, viewModel: QueueViewModel, onAdminEntry: () -> Unit = {}) {
    val colors = LocalMetroColors.current
    val settings = state.settings
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(
            start = 20.dp,
            end = 20.dp,
            bottom = 38.dp,
        ),
        verticalArrangement = Arrangement.spacedBy(18.dp),
    ) {
        item {
            MetroSectionLabel("個人化")
            Spacer(Modifier.height(12.dp))
            Text("強調色", color = colors.foreground, fontSize = 22.sp, fontWeight = FontWeight.Light)
            Spacer(Modifier.height(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                AccentOptions.chunked(4).forEachIndexed { rowIndex, row ->
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.spacedBy(10.dp),
                    ) {
                        row.forEachIndexed { columnIndex, color ->
                            val index = rowIndex * 4 + columnIndex
                            AccentSwatch(
                                color = color,
                                selected = settings.accentIndex == index,
                                onClick = { viewModel.setAccent(index) },
                                modifier = Modifier.weight(1f),
                            )
                        }
                    }
                }
            }
        }
        item { MetroDivider() }
        item {
            SettingTitle("文字大小", "${(settings.textScale * 100).roundToInt()}%")
            Slider(
                value = settings.textScale,
                onValueChange = viewModel::setTextScale,
                valueRange = .8f..1.4f,
                steps = 5,
                colors = metroSliderColors(),
            )
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("較小", color = colors.muted, fontSize = 12.sp)
                Text("較大", color = colors.muted, fontSize = 12.sp)
            }
        }
        item { MetroDivider() }
        item {
            Text("顯示模式", color = colors.foreground, fontSize = 22.sp, fontWeight = FontWeight.Light)
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    DisplayMode.DARK to "深色",
                    DisplayMode.LIGHT to "淺色",
                    DisplayMode.SYSTEM to "系統",
                ).forEach { (mode, label) ->
                    MetroChoice(
                        label = label,
                        selected = settings.displayMode == mode,
                        onClick = { viewModel.setDisplayMode(mode) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        item { MetroDivider() }
        item {
            MetroSectionLabel("資料")
            Spacer(Modifier.height(12.dp))
            Text("自動更新", color = colors.foreground, fontSize = 22.sp, fontWeight = FontWeight.Light)
            Spacer(Modifier.height(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(0 to "關閉", 60 to "每 60 秒", 120 to "每 2 分鐘", 300 to "每 5 分鐘")
                    .chunked(2)
                    .forEach { row ->
                        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                            row.forEach { (seconds, label) ->
                                MetroChoice(
                                    label = label,
                                    selected = settings.refreshSeconds == seconds,
                                    onClick = { viewModel.setRefreshSeconds(seconds) },
                                    modifier = Modifier.weight(1f),
                                )
                            }
                        }
                    }
            }
            Spacer(Modifier.height(18.dp))
            ToggleSetting(
                title = "數據節省模式",
                subtitle = "關閉自動更新，只保留手動刷新",
                checked = settings.dataSaver,
                onCheckedChange = viewModel::setDataSaver,
            )
        }
        item { MetroDivider() }
        item {
            MetroSectionLabel("附近")
            Spacer(Modifier.height(12.dp))
            SettingTitle("搜尋半徑", formatRadius(settings.nearbyRadiusMeters))
            Slider(
                value = settings.nearbyRadiusMeters.toFloat(),
                onValueChange = { viewModel.setRadius(it.roundToInt()) },
                valueRange = 200f..5_000f,
                colors = metroSliderColors(),
            )
            ToggleSetting(
                title = "顯示地圖站名",
                subtitle = "縮放時保留分店名稱標籤",
                checked = settings.showMapLabels,
                onCheckedChange = viewModel::setShowMapLabels,
            )
        }
        item { MetroDivider() }
        item {
            MetroSectionLabel("語言")
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(
                    AppLanguage.SYSTEM to "系統",
                    AppLanguage.ZH_HK to "繁中",
                    AppLanguage.ENGLISH to "English",
                ).forEach { (language, label) ->
                    MetroChoice(
                        label = label,
                        selected = settings.language == language,
                        onClick = { viewModel.setLanguage(language) },
                        modifier = Modifier.weight(1f),
                    )
                }
            }
        }
        item { MetroDivider() }
        item {
            MetroSectionLabel("儲存空間")
            Spacer(Modifier.height(12.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                MetroButton("清除快取", viewModel::clearCache, Modifier.weight(1f))
                MetroButton("重設設定", viewModel::resetSettings, Modifier.weight(1f))
            }
        }
        item { MetroDivider() }
        item {
            var tapCount by remember { mutableIntStateOf(0) }
            var firstTapAt by remember { mutableLongStateOf(0L) }
            Text(
                "候位 Metro  1.2.1",
                color = colors.foreground,
                fontSize = 17.sp,
                modifier = Modifier.clickable {
                    val now = android.os.SystemClock.elapsedRealtime()
                    if (firstTapAt == 0L || now - firstTapAt > 3_000L) {
                        firstTapAt = now
                        tapCount = 1
                    } else {
                        tapCount += 1
                    }
                    if (tapCount >= 5) {
                        tapCount = 0
                        firstTapAt = 0L
                        onAdminEntry()
                    }
                },
            )
            Spacer(Modifier.height(6.dp))
            Text(
                "非官方資訊工具。輪候資料可能延遲，請以店內及官方服務顯示為準。定位只在本機計算附近距離。",
                color = colors.muted,
                fontSize = 13.sp,
                lineHeight = 20.sp,
            )
        }
    }
}

@Composable
private fun AccentSwatch(
    color: Color,
    selected: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val colors = LocalMetroColors.current
    Row(
        modifier = modifier.height(54.dp).background(color).clickable(onClick = onClick).padding(7.dp),
        horizontalArrangement = Arrangement.End,
        verticalAlignment = Alignment.Bottom,
    ) {
        if (selected) {
            Spacer(Modifier.size(18.dp).background(colors.foreground))
        }
    }
}

@Composable
private fun SettingTitle(title: String, value: String) {
    val colors = LocalMetroColors.current
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Text(title, color = colors.foreground, fontSize = 22.sp, fontWeight = FontWeight.Light)
        Text(value, color = colors.accent, fontSize = 18.sp)
    }
}

@Composable
private fun ToggleSetting(
    title: String,
    subtitle: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
) {
    val colors = LocalMetroColors.current
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, color = colors.foreground, fontSize = 18.sp)
            Text(subtitle, color = colors.muted, fontSize = 12.sp)
        }
        MetroSwitch(checked, onCheckedChange)
    }
}

@Composable
private fun metroSliderColors() = SliderDefaults.colors(
    thumbColor = LocalMetroColors.current.accent,
    activeTrackColor = LocalMetroColors.current.accent,
    inactiveTrackColor = LocalMetroColors.current.line,
    activeTickColor = Color.Transparent,
    inactiveTickColor = Color.Transparent,
)

private fun formatRadius(meters: Int): String = if (meters < 1_000) {
    "$meters 米"
} else {
    "${meters / 1_000f} 公里"
}
