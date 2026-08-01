package com.queue.metro.ui.pages

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.queue.metro.data.Region
import com.queue.metro.ui.LocalMetroColors
import com.queue.metro.ui.QueueUiState
import com.queue.metro.ui.QueueViewModel
import com.queue.metro.ui.components.EmptyPanel
import com.queue.metro.ui.components.MetroChoice
import com.queue.metro.ui.components.QueueTile

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun SearchPage(state: QueueUiState, viewModel: QueueViewModel) {
    val colors = LocalMetroColors.current
    var selectedRegion by remember { mutableStateOf(Region.HONG_KONG) }
    var selectedDistrict by remember { mutableStateOf<String?>(null) }
    var query by remember { mutableStateOf("") }
    val regionStores = state.stores.filter { it.region == selectedRegion }
    val districts = regionStores.map { it.district }.distinct().sorted()
    val visibleStores = regionStores.filter { store ->
        val districtSelected = selectedDistrict?.let { store.district == it } ?: query.isNotBlank()
        districtSelected &&
            (query.isBlank() || store.name.contains(query, true) || store.nameEn.contains(query, true))
    }

    LaunchedEffect(visibleStores.map { it.id }) {
        viewModel.refreshStores(visibleStores.map { it.id }.toSet(), manual = false)
    }

    Column(modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            listOf(Region.HONG_KONG, Region.KOWLOON, Region.NEW_TERRITORIES).forEach { region ->
                MetroChoice(
                    label = region.label,
                    selected = selectedRegion == region,
                    onClick = {
                        selectedRegion = region
                        selectedDistrict = null
                    },
                    modifier = Modifier.weight(1f),
                )
            }
        }
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .height(48.dp)
                .background(colors.surface)
                .padding(horizontal = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(Icons.Outlined.Search, contentDescription = null, tint = colors.muted)
            Spacer(Modifier.width(10.dp))
            BasicTextField(
                value = query,
                onValueChange = { query = it },
                modifier = Modifier.weight(1f),
                textStyle = androidx.compose.ui.text.TextStyle(color = colors.foreground, fontSize = 16.sp),
                cursorBrush = SolidColor(colors.accent),
                singleLine = true,
                decorationBox = { inner ->
                    if (query.isBlank()) Text("搜尋分店", color = colors.muted, fontSize = 16.sp)
                    inner()
                },
            )
        }
        Spacer(Modifier.height(12.dp))
        Row(
            modifier = Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(18.dp),
        ) {
            districts.forEach { district ->
                DistrictLabel(district, selectedDistrict == district) { selectedDistrict = district }
            }
        }
        Spacer(Modifier.height(14.dp))
        if (selectedDistrict == null && query.isBlank()) {
            EmptyPanel(
                title = "選擇細分地區",
                message = "先選擇上方地區，再點擊細分地區載入該區分店叫號。",
                modifier = Modifier.weight(1f),
            )
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.weight(1f),
                horizontalArrangement = Arrangement.spacedBy(10.dp),
                verticalArrangement = Arrangement.spacedBy(10.dp),
            ) {
                items(visibleStores, key = { it.id }) { store ->
                    val pinned = store.id in state.settings.pinnedStoreIds
                    QueueTile(
                        store = store,
                        snapshot = state.snapshots[store.id],
                        compact = true,
                        onLongPressAction = { viewModel.setPinned(store.id, !pinned) },
                        longPressLabel = if (pinned) "取消釘選" else "釘選到 home",
                    )
                }
                item { Spacer(Modifier.height(28.dp)) }
            }
        }
    }
}

@Composable
private fun DistrictLabel(label: String, selected: Boolean, onClick: () -> Unit) {
    val colors = LocalMetroColors.current
    Text(
        text = label,
        color = if (selected) colors.accent else colors.foreground,
        fontSize = 17.sp,
        fontWeight = if (selected) FontWeight.Medium else FontWeight.Light,
        modifier = Modifier.clickable(onClick = onClick).padding(vertical = 8.dp),
    )
}
