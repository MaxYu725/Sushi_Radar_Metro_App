package com.queue.metro.ui.pages

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Looper
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.LocationOn
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import com.queue.metro.data.Store
import com.queue.metro.ui.LocalMetroColors
import com.queue.metro.ui.QueueUiState
import com.queue.metro.ui.QueueViewModel
import com.queue.metro.ui.components.EmptyPanel
import com.queue.metro.ui.components.MetroButton
import java.util.Locale
import kotlin.math.cos
import kotlin.math.sqrt
import kotlin.random.Random

@Composable
fun NearbyPage(state: QueueUiState, viewModel: QueueViewModel) {
    val context = LocalContext.current
    val colors = LocalMetroColors.current
    var location by remember { mutableStateOf<Location?>(null) }
    var locationMessage by remember { mutableStateOf<String?>(null) }
    var selectedStore by remember { mutableStateOf<Store?>(null) }

    fun loadLocation() {
        obtainLocation(context) { result ->
            result.onSuccess {
                location = it
                locationMessage = null
            }.onFailure {
                locationMessage = "未能取得目前位置，請確認已開啟定位服務。"
            }
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions(),
    ) { result ->
        if (result.values.any { it }) loadLocation()
        else locationMessage = "定位權限已拒絕；位置只會在手機本機用於計算距離。"
    }

    LaunchedEffect(Unit) {
        if (hasLocationPermission(context)) loadLocation()
    }

    val nearbyStores = location?.let { current ->
        state.stores.mapNotNull { store ->
            if (store.latitude == null || store.longitude == null) return@mapNotNull null
            store to distanceMeters(current, store)
        }.filter { (_, distance) ->
            distance <= state.settings.nearbyRadiusMeters
        }.sortedBy { it.second }
    }.orEmpty()

    LaunchedEffect(nearbyStores.map { it.first.id }) {
        viewModel.refreshStores(nearbyStores.map { it.first.id }.toSet())
    }

    Column(modifier = Modifier.fillMaxSize()) {
        if (location == null) {
            Column(
                modifier = Modifier.fillMaxSize().padding(horizontal = 20.dp),
                verticalArrangement = Arrangement.Center,
            ) {
                Icon(
                    Icons.Outlined.LocationOn,
                    contentDescription = null,
                    tint = colors.accent,
                    modifier = Modifier.size(52.dp),
                )
                Spacer(Modifier.height(18.dp))
                EmptyPanel(
                    title = "尋找附近分店",
                    message = locationMessage
                        ?: "只要求前景定位，座標不會傳送或保存到資料服務。",
                )
                Spacer(Modifier.height(14.dp))
                MetroButton(
                    text = "允許定位",
                    onClick = {
                        permissionLauncher.launch(
                            arrayOf(
                                Manifest.permission.ACCESS_COARSE_LOCATION,
                                Manifest.permission.ACCESS_FINE_LOCATION,
                            ),
                        )
                    },
                )
            }
        } else {
            NearbyMap(
                location = location!!,
                stores = nearbyStores.map { it.first },
                selectedStore = selectedStore,
                showLabels = state.settings.showMapLabels,
                radiusMeters = state.settings.nearbyRadiusMeters,
                onSelectStore = { selectedStore = it },
            )
            selectedStore?.let { store ->
                val distance = nearbyStores.firstOrNull { it.first.id == store.id }?.second
                StoreMiniPanel(
                    store = store,
                    distance = distance,
                    state = state,
                    onPin = {
                        viewModel.setPinned(store.id, store.id !in state.settings.pinnedStoreIds)
                    },
                )
            }
            if (nearbyStores.isEmpty()) {
                EmptyPanel(
                    title = "範圍內沒有分店",
                    message = "可在 settings 增加附近搜尋半徑。",
                    modifier = Modifier.padding(20.dp),
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth().weight(1f),
                    contentPadding = androidx.compose.foundation.layout.PaddingValues(
                        start = 20.dp,
                        end = 20.dp,
                        bottom = 28.dp,
                    ),
                ) {
                    items(nearbyStores, key = { it.first.id }) { (store, distance) ->
                        NearbyListRow(
                            store = store,
                            distance = distance,
                            waitingGroups = state.snapshots[store.id]?.waitingGroups,
                            onClick = { selectedStore = store },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun NearbyMap(
    location: Location,
    stores: List<Store>,
    selectedStore: Store?,
    showLabels: Boolean,
    radiusMeters: Int,
    onSelectStore: (Store) -> Unit,
) {
    val colors = LocalMetroColors.current
    val density = LocalDensity.current
    BoxWithConstraints(
        modifier = Modifier.fillMaxWidth().height(330.dp).background(Color(0xFF090909)),
    ) {
        val widthPx = with(density) { maxWidth.toPx() }
        val heightPx = with(density) { maxHeight.toPx() }
        val projection = remember(location.latitude, location.longitude, radiusMeters, widthPx, heightPx) {
            MapProjection(
                centerLatitude = location.latitude,
                centerLongitude = location.longitude,
                radiusMeters = radiusMeters.coerceAtLeast(400),
                width = widthPx,
                height = heightPx,
            )
        }
        Canvas(
            modifier = Modifier.fillMaxSize().pointerInput(stores, projection) {
                detectTapGestures { tap ->
                    stores
                        .mapNotNull { store ->
                            val latitude = store.latitude ?: return@mapNotNull null
                            val longitude = store.longitude ?: return@mapNotNull null
                            store to projection.project(latitude, longitude)
                        }
                        .filter { (_, point) -> (point - tap).distance() < 38.dp.toPx() }
                        .minByOrNull { (_, point) -> (point - tap).distance() }
                        ?.first
                        ?.let(onSelectStore)
                }
            },
        ) {
            val random = Random(42)
            repeat(22) {
                val start = Offset(random.nextFloat() * size.width, random.nextFloat() * size.height)
                val end = Offset(
                    (start.x + random.nextInt(-260, 260).dp.toPx()).coerceIn(0f, size.width),
                    (start.y + random.nextInt(-170, 170).dp.toPx()).coerceIn(0f, size.height),
                )
                drawLine(
                    color = Color(0xFF252525),
                    start = start,
                    end = end,
                    strokeWidth = random.nextInt(2, 6).dp.toPx(),
                    cap = StrokeCap.Square,
                )
            }
            val route = Path().apply {
                moveTo(size.width * .12f, size.height * .82f)
                cubicTo(
                    size.width * .32f,
                    size.height * .65f,
                    size.width * .56f,
                    size.height * .72f,
                    size.width * .64f,
                    size.height * .44f,
                )
                cubicTo(
                    size.width * .72f,
                    size.height * .22f,
                    size.width * .78f,
                    size.height * .20f,
                    size.width * .88f,
                    0f,
                )
            }
            drawPath(route, colors.accent, style = Stroke(5.dp.toPx(), cap = StrokeCap.Square))
            stores.forEach { store ->
                val latitude = store.latitude ?: return@forEach
                val longitude = store.longitude ?: return@forEach
                val point = projection.project(latitude, longitude)
                val selected = selectedStore?.id == store.id
                drawCircle(
                    color = if (selected) colors.accent else Color.White,
                    radius = if (selected) 10.dp.toPx() else 7.dp.toPx(),
                    center = point,
                )
                drawCircle(
                    color = Color.Black,
                    radius = if (selected) 4.dp.toPx() else 2.5.dp.toPx(),
                    center = point,
                )
            }
            val userPoint = projection.project(location.latitude, location.longitude)
            drawCircle(colors.accent.copy(alpha = .22f), 20.dp.toPx(), userPoint)
            drawCircle(colors.accent, 7.dp.toPx(), userPoint)
        }
        if (showLabels) {
            stores.take(8).forEach { store ->
                val latitude = store.latitude ?: return@forEach
                val longitude = store.longitude ?: return@forEach
                val point = projection.project(latitude, longitude)
                Text(
                    text = store.name,
                    color = Color.White,
                    fontSize = 10.sp,
                    maxLines = 1,
                    modifier = Modifier
                        .width(112.dp)
                        .graphicsLayer {
                            translationX = point.x + 9.dp.toPx()
                            translationY = point.y - 9.dp.toPx()
                        },
                )
            }
        }
        Text(
            text = "${radiusMeters}m",
            color = colors.accent,
            fontSize = 12.sp,
            modifier = Modifier.align(Alignment.BottomEnd).padding(12.dp),
        )
    }
}

@Composable
private fun StoreMiniPanel(
    store: Store,
    distance: Float?,
    state: QueueUiState,
    onPin: () -> Unit,
) {
    val colors = LocalMetroColors.current
    val snapshot = state.snapshots[store.id]
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.surface)
            .padding(18.dp, 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Column(Modifier.weight(1f)) {
            Text(store.name, color = colors.foreground, fontSize = 20.sp)
            Text(
                "${distance?.let(::formatDistance) ?: "—"} · ${snapshot?.currentNumbers?.firstOrNull() ?: "暫無叫號"}",
                color = colors.muted,
                fontSize = 13.sp,
            )
        }
        Column(horizontalAlignment = Alignment.End) {
            Text(snapshot?.waitingGroups?.toString() ?: "—", color = colors.accent, fontSize = 31.sp)
            Text("輪候組", color = colors.muted, fontSize = 11.sp)
        }
        Spacer(Modifier.width(14.dp))
        MetroButton(
            text = if (store.id in state.settings.pinnedStoreIds) "取消" else "釘選",
            onClick = onPin,
        )
    }
}

@Composable
private fun NearbyListRow(store: Store, distance: Float, waitingGroups: Int?, onClick: () -> Unit) {
    val colors = LocalMetroColors.current
    Row(
        modifier = Modifier.fillMaxWidth().height(72.dp).clickable(onClick = onClick),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(formatDistance(distance), color = colors.accent, fontSize = 13.sp, modifier = Modifier.width(64.dp))
        Column(Modifier.weight(1f)) {
            Text(
                store.name,
                color = colors.foreground,
                fontSize = 17.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(store.district, color = colors.muted, fontSize = 12.sp)
        }
        Text(
            waitingGroups?.toString() ?: "—",
            color = colors.foreground,
            fontSize = 24.sp,
            fontWeight = FontWeight.Light,
        )
    }
}

private data class MapProjection(
    val centerLatitude: Double,
    val centerLongitude: Double,
    val radiusMeters: Int,
    val width: Float,
    val height: Float,
) {
    fun project(latitude: Double, longitude: Double): Offset {
        val scale = radiusMeters * 1.25
        val lonMeters = (longitude - centerLongitude) * 111_000.0 * cos(Math.toRadians(centerLatitude))
        val latMeters = (latitude - centerLatitude) * 111_000.0
        return Offset(
            x = (width / 2f + (lonMeters / scale * width / 2f)).toFloat(),
            y = (height / 2f - (latMeters / scale * height / 2f)).toFloat(),
        )
    }
}

private fun distanceMeters(location: Location, store: Store): Float {
    val latitude = store.latitude ?: return Float.POSITIVE_INFINITY
    val longitude = store.longitude ?: return Float.POSITIVE_INFINITY
    val result = FloatArray(1)
    Location.distanceBetween(
        location.latitude,
        location.longitude,
        latitude,
        longitude,
        result,
    )
    return result[0]
}

private fun Offset.distance(): Float = sqrt(x * x + y * y)

private fun formatDistance(meters: Float): String = if (meters < 1_000) {
    "${meters.toInt()}m"
} else {
    String.format(Locale.US, "%.1fkm", meters / 1_000f)
}

private fun hasLocationPermission(context: Context): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED ||
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) ==
        PackageManager.PERMISSION_GRANTED

@SuppressLint("MissingPermission")
private fun obtainLocation(context: Context, callback: (Result<Location>) -> Unit) {
    if (!hasLocationPermission(context)) {
        callback(Result.failure(SecurityException("Location permission missing")))
        return
    }
    val manager = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    val provider = when {
        manager.isProviderEnabled(LocationManager.NETWORK_PROVIDER) -> LocationManager.NETWORK_PROVIDER
        manager.isProviderEnabled(LocationManager.GPS_PROVIDER) -> LocationManager.GPS_PROVIDER
        else -> null
    }
    if (provider == null) {
        callback(Result.failure(IllegalStateException("Location provider disabled")))
        return
    }
    manager.getLastKnownLocation(provider)?.let { callback(Result.success(it)) }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        manager.getCurrentLocation(
            provider,
            CancellationSignal(),
            ContextCompat.getMainExecutor(context),
        ) { location ->
            if (location != null) callback(Result.success(location))
            else callback(Result.failure(IllegalStateException("Location unavailable")))
        }
    } else {
        val listener = object : LocationListener {
            override fun onLocationChanged(location: Location) {
                manager.removeUpdates(this)
                callback(Result.success(location))
            }

            @Deprecated("Deprecated in Android")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit
        }
        manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
    }
}
