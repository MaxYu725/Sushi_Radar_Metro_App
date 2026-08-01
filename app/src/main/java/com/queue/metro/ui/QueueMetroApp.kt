package com.queue.metro.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PagerState
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel as composeViewModel
import com.queue.metro.admin.AdminScreen
import com.queue.metro.admin.AdminViewModel
import com.queue.metro.ui.pages.HomePage
import com.queue.metro.ui.pages.NearbyPage
import com.queue.metro.ui.pages.SearchPage
import com.queue.metro.ui.pages.SettingsPage
import kotlinx.coroutines.flow.distinctUntilChanged

private val pivotTitles = listOf("home", "search", "nearby", "settings")
private const val PivotCount = 4

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun QueueMetroApp(
    viewModel: QueueViewModel,
    adminVisible: Boolean = false,
    onAdminEntry: () -> Unit = {},
    onAdminClose: () -> Unit = {},
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val middle = Int.MAX_VALUE / 2
    val initialPage = middle - middle.mod(PivotCount)
    val pagerState = rememberPagerState(initialPage = initialPage) { Int.MAX_VALUE }

    LaunchedEffect(pagerState) {
        snapshotFlow { pagerState.settledPage }
            .distinctUntilChanged()
            .collect { viewModel.setVisiblePage(Math.floorMod(it, PivotCount)) }
    }

    MetroTheme(state.settings) {
        if (adminVisible) {
            val adminViewModel: AdminViewModel = composeViewModel()
            AdminScreen(adminViewModel, onAdminClose)
            return@MetroTheme
        }
        val colors = LocalMetroColors.current
        Column(
            modifier = Modifier
                .fillMaxSize()
                .background(colors.background)
                .windowInsetsPadding(WindowInsets.displayCutout.only(WindowInsetsSides.Top)),
        ) {
            Spacer(Modifier.height(12.dp))
            PivotHeader(pagerState)
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize(),
                beyondViewportPageCount = 1,
                key = { it },
            ) { page ->
                when (Math.floorMod(page, PivotCount)) {
                    0 -> HomePage(state, viewModel)
                    1 -> SearchPage(state, viewModel)
                    2 -> NearbyPage(state, viewModel)
                    else -> SettingsPage(state, viewModel, onAdminEntry)
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun PivotHeader(pagerState: PagerState) {
    val colors = LocalMetroColors.current
    val currentIndex = Math.floorMod(pagerState.currentPage, PivotCount)
    Row(
        modifier = Modifier
            .height(78.dp)
            .padding(start = 22.dp)
            .graphicsLayer {
                translationX = -pagerState.currentPageOffsetFraction * 88.dp.toPx()
            },
    ) {
        repeat(4) { relative ->
            val index = (currentIndex + relative).mod(PivotCount)
            Text(
                text = pivotTitles[index],
                color = if (relative == 0) colors.foreground else colors.muted.copy(alpha = .52f),
                fontSize = 46.sp,
                fontWeight = FontWeight.Light,
                letterSpacing = (-1.5).sp,
                maxLines = 1,
            )
            Spacer(Modifier.width(28.dp))
        }
    }
}
