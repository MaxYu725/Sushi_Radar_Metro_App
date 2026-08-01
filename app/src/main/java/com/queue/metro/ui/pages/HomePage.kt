package com.queue.metro.ui.pages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.queue.metro.ui.LocalMetroColors
import com.queue.metro.ui.QueueUiState
import com.queue.metro.ui.QueueViewModel
import com.queue.metro.ui.components.EmptyPanel
import com.queue.metro.ui.components.MetroButton
import com.queue.metro.ui.components.QueueTile
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import kotlinx.coroutines.delay

@Composable
fun HomePage(state: QueueUiState, viewModel: QueueViewModel) {
    val colors = LocalMetroColors.current
    val pinnedStores = state.stores.filter { it.id in state.settings.pinnedStoreIds }
    var now by remember { mutableLongStateOf(System.currentTimeMillis()) }

    LaunchedEffect(Unit) {
        while (true) {
            now = System.currentTimeMillis()
            delay(1_000)
        }
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Column {
                    Text(
                        text = statusText(state, now),
                        color = colors.muted,
                        fontSize = 13.sp,
                    )
                    state.repositoryStatus.message?.let {
                        Text(it, color = colors.accent, fontSize = 12.sp)
                    }
                }
                MetroButton(
                    text = if (state.repositoryStatus.isLoading) "更新中" else "立即更新",
                    onClick = viewModel::refreshPinned,
                    enabled = !state.repositoryStatus.isLoading,
                )
            }
        }
        if (pinnedStores.isEmpty()) {
            item {
                EmptyPanel(
                    title = "尚未釘選分店",
                    message = "前往 search，長按分店 Tile 即可釘選到 home。",
                )
            }
        } else {
            items(pinnedStores, key = { it.id }) { store ->
                QueueTile(
                    store = store,
                    snapshot = state.snapshots[store.id],
                    onLongPressAction = { viewModel.setPinned(store.id, false) },
                    longPressLabel = "取消釘選",
                )
            }
        }
        item { Spacer(Modifier.height(34.dp)) }
    }
}

private fun statusText(state: QueueUiState, now: Long): String {
    val last = state.repositoryStatus.lastSuccessfulRefresh
        ?: state.snapshots.values.maxOfOrNull { it.fetchedAt }
    val formatter = SimpleDateFormat("HH:mm:ss", Locale.TRADITIONAL_CHINESE)
    val lastText = last?.let { formatter.format(Date(it)) } ?: "尚未更新"
    val interval = state.settings.refreshSeconds
    if (interval <= 0 || state.settings.dataSaver) return "上次更新 $lastText · 自動更新已關閉"
    val elapsed = last?.let { ((now - it) / 1_000L).coerceAtLeast(0) } ?: 0
    val remaining = (interval - elapsed % interval).coerceAtLeast(0)
    return "上次更新 $lastText · ${remaining} 秒後再更新"
}
