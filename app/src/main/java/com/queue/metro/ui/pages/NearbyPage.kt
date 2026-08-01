package com.queue.metro.ui.pages

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Color as AndroidColor
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.os.Build
import android.os.Bundle
import android.os.CancellationSignal
import android.os.Looper
import android.view.MotionEvent
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
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
import androidx.compose.material3.Slider
import androidx.compose.material3.SliderDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.queue.metro.BuildConfig
import com.queue.metro.data.Store
import com.queue.metro.ui.LocalMetroColors
import com.queue.metro.ui.QueueUiState
import com.queue.metro.ui.QueueViewModel
import com.queue.metro.ui.components.EmptyPanel
import com.queue.metro.ui.components.MetroButton
import java.util.Locale
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.ln
import org.json.JSONArray
import org.json.JSONObject
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.maps.MapLibreMap
import org.maplibre.android.maps.MapView
import org.maplibre.android.maps.Style
import org.maplibre.android.style.layers.CircleLayer
import org.maplibre.android.style.layers.FillLayer
import org.maplibre.android.style.layers.LineLayer
import org.maplibre.android.style.layers.PropertyFactory.circleColor
import org.maplibre.android.style.layers.PropertyFactory.circleOpacity
import org.maplibre.android.style.layers.PropertyFactory.circleRadius
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeColor
import org.maplibre.android.style.layers.PropertyFactory.circleStrokeWidth
import org.maplibre.android.style.layers.PropertyFactory.fillColor
import org.maplibre.android.style.layers.PropertyFactory.fillOpacity
import org.maplibre.android.style.layers.PropertyFactory.lineColor
import org.maplibre.android.style.layers.PropertyFactory.lineOpacity
import org.maplibre.android.style.layers.PropertyFactory.lineWidth
import org.maplibre.android.style.layers.PropertyFactory.textAllowOverlap
import org.maplibre.android.style.layers.PropertyFactory.textColor
import org.maplibre.android.style.layers.PropertyFactory.textField
import org.maplibre.android.style.layers.PropertyFactory.textHaloColor
import org.maplibre.android.style.layers.PropertyFactory.textHaloWidth
import org.maplibre.android.style.layers.PropertyFactory.textSize
import org.maplibre.android.style.layers.PropertyFactory.visibility
import org.maplibre.android.style.layers.SymbolLayer
import org.maplibre.android.style.sources.GeoJsonSource

@Composable
fun NearbyPage(state: QueueUiState, viewModel: QueueViewModel) {
    val context = LocalContext.current
    val colors = LocalMetroColors.current
    var location by remember { mutableStateOf<Location?>(null) }
    var locationMessage by remember { mutableStateOf<String?>(null) }
    var selectedStoreId by remember { mutableStateOf<Long?>(null) }
    var radiusPreview by remember { mutableIntStateOf(state.settings.nearbyRadiusMeters) }

    LaunchedEffect(state.settings.nearbyRadiusMeters) {
        radiusPreview = state.settings.nearbyRadiusMeters
    }

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

    val distances = location?.let { current ->
        state.stores.mapNotNull { store ->
            if (store.latitude == null || store.longitude == null) return@mapNotNull null
            store to distanceMeters(current, store)
        }.sortedBy { it.second }
    }.orEmpty()
    val nearbyStores = distances.filter { (_, distance) -> distance <= radiusPreview }
    val committedStoreIds = distances
        .filter { (_, distance) -> distance <= state.settings.nearbyRadiusMeters }
        .map { it.first.id }
    val selectedStore = nearbyStores.firstOrNull { it.first.id == selectedStoreId }?.first
    val selectedDistance = nearbyStores.firstOrNull { it.first.id == selectedStoreId }?.second

    LaunchedEffect(committedStoreIds) {
        viewModel.refreshStores(committedStoreIds.toSet())
    }
    LaunchedEffect(nearbyStores.map { it.first.id }) {
        if (selectedStoreId !in nearbyStores.map { it.first.id }.toSet()) selectedStoreId = null
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
            RealNearbyMap(
                location = location!!,
                stores = nearbyStores.map { it.first },
                selectedStore = selectedStore,
                selectedDistance = selectedDistance,
                showLabels = state.settings.showMapLabels,
                radiusMeters = radiusPreview,
                onSelectStore = { selectedStoreId = it.id },
            )
            RadiusPreviewControl(
                radiusMeters = radiusPreview,
                onPreview = { radiusPreview = it },
                onCommit = { viewModel.setRadius(radiusPreview) },
            )
            selectedStore?.let { store ->
                StoreMiniPanel(
                    store = store,
                    state = state,
                    onPin = {
                        viewModel.setPinned(store.id, store.id !in state.settings.pinnedStoreIds)
                    },
                )
            }
            if (nearbyStores.isEmpty()) {
                EmptyPanel(
                    title = "範圍內沒有分店",
                    message = "可增加上方搜尋半徑。",
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
                            selected = selectedStoreId == store.id,
                            onClick = { selectedStoreId = store.id },
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun RealNearbyMap(
    location: Location,
    stores: List<Store>,
    selectedStore: Store?,
    selectedDistance: Float?,
    showLabels: Boolean,
    radiusMeters: Int,
    onSelectStore: (Store) -> Unit,
) {
    val context = LocalContext.current
    val colors = LocalMetroColors.current
    val density = LocalDensity.current.density
    val latestStores by rememberUpdatedState(stores)
    val latestSelect by rememberUpdatedState(onSelectStore)
    val mapView = remember {
        MapView(context).apply {
            onCreate(null)
            setOnTouchListener { view, event ->
                if (event.actionMasked == MotionEvent.ACTION_UP) view.performClick()
                view.parent?.requestDisallowInterceptTouchEvent(
                    event.actionMasked != MotionEvent.ACTION_UP && event.actionMasked != MotionEvent.ACTION_CANCEL,
                )
                false
            }
        }
    }
    var map by remember { mutableStateOf<MapLibreMap?>(null) }
    var styleReady by remember { mutableStateOf(false) }
    var mapMessage by remember { mutableStateOf("正在載入香港地圖…") }

    DisposableEffect(mapView) {
        mapView.onStart()
        mapView.onResume()
        onDispose {
            mapView.onPause()
            mapView.onStop()
            mapView.onDestroy()
        }
    }

    LaunchedEffect(mapView) {
        mapView.getMapAsync { readyMap ->
            map = readyMap
            readyMap.uiSettings.isCompassEnabled = false
            readyMap.uiSettings.isRotateGesturesEnabled = false
            readyMap.setStyle(Style.Builder().fromUri(BuildConfig.MAP_STYLE_URL)) { style ->
                configureRadarStyle(style, colors.accent.toArgb())
                styleReady = true
                mapMessage = ""
                readyMap.moveCamera(
                    CameraUpdateFactory.newCameraPosition(
                        CameraPosition.Builder()
                            .target(LatLng(location.latitude, location.longitude))
                            .zoom(zoomForRadius(radiusMeters))
                            .build(),
                    ),
                )
            }
        }
    }

    DisposableEffect(map, density) {
        val currentMap = map ?: return@DisposableEffect onDispose { }
        val listener = MapLibreMap.OnMapClickListener { point ->
            val tap = currentMap.projection.toScreenLocation(point)
            val nearest = latestStores.mapNotNull { store ->
                val latitude = store.latitude ?: return@mapNotNull null
                val longitude = store.longitude ?: return@mapNotNull null
                val marker = currentMap.projection.toScreenLocation(LatLng(latitude, longitude))
                store to hypot((marker.x - tap.x).toDouble(), (marker.y - tap.y).toDouble())
            }.minByOrNull { it.second }
            if (nearest != null && nearest.second <= 52f * density) {
                latestSelect(nearest.first)
                true
            } else {
                false
            }
        }
        currentMap.addOnMapClickListener(listener)
        onDispose { currentMap.removeOnMapClickListener(listener) }
    }

    LaunchedEffect(styleReady, map, location.latitude, location.longitude, stores, selectedStore, selectedDistance, radiusMeters, showLabels, colors.accent) {
        if (!styleReady) return@LaunchedEffect
        val currentMap = map ?: return@LaunchedEffect
        val style = currentMap.style ?: return@LaunchedEffect
        updateRadarStyle(
            style = style,
            location = location,
            stores = stores,
            selectedStore = selectedStore,
            selectedDistance = selectedDistance,
            radiusMeters = radiusMeters,
            showLabels = showLabels,
            accent = colors.accent.toArgb(),
        )
    }

    LaunchedEffect(styleReady) {
        if (!styleReady) {
            kotlinx.coroutines.delay(12_000)
            if (!styleReady) mapMessage = "真實地圖暫時未能載入，附近分店列表仍可使用。"
        }
    }

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(360.dp)
            .background(androidx.compose.ui.graphics.Color(0xFF090909)),
    ) {
        AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())
        Box(
            modifier = Modifier
                .align(Alignment.TopStart)
                .padding(14.dp)
                .size(48.dp)
                .background(androidx.compose.ui.graphics.Color(0xE6080808))
                .clickable {
                    map?.animateCamera(
                        CameraUpdateFactory.newLatLngZoom(
                            LatLng(location.latitude, location.longitude),
                            zoomForRadius(radiusMeters),
                        ),
                    )
                },
            contentAlignment = Alignment.Center,
        ) {
            Text("⌖", color = colors.accent, fontSize = 28.sp)
        }
        if (mapMessage.isNotBlank()) {
            Text(
                text = mapMessage,
                color = colors.foreground,
                fontSize = 12.sp,
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(start = 76.dp, end = 12.dp, bottom = 18.dp)
                    .background(androidx.compose.ui.graphics.Color(0xD9000000))
                    .padding(10.dp),
            )
        }
    }
}

@Composable
private fun RadiusPreviewControl(
    radiusMeters: Int,
    onPreview: (Int) -> Unit,
    onCommit: () -> Unit,
) {
    val colors = LocalMetroColors.current
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(colors.surface)
            .padding(horizontal = 20.dp, vertical = 12.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text("搜尋半徑", color = colors.foreground, fontSize = 18.sp, modifier = Modifier.weight(1f))
            Text(formatRadius(radiusMeters), color = colors.accent, fontSize = 16.sp)
        }
        Slider(
            value = radiusMeters.toFloat(),
            onValueChange = { onPreview((it / 100f).toInt() * 100) },
            onValueChangeFinished = onCommit,
            valueRange = 200f..5_000f,
            steps = 47,
            colors = SliderDefaults.colors(
                thumbColor = colors.accent,
                activeTrackColor = colors.accent,
                inactiveTrackColor = colors.line,
            ),
        )
        Row(Modifier.fillMaxWidth()) {
            Text("200 米", color = colors.muted, fontSize = 11.sp, modifier = Modifier.weight(1f))
            Text("5 公里", color = colors.muted, fontSize = 11.sp)
        }
    }
}

@Composable
private fun StoreMiniPanel(
    store: Store,
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
                store.address.ifBlank { "${store.district} · 地址資料暫缺" },
                color = colors.muted,
                fontSize = 12.sp,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                "最新叫號：${snapshot?.currentNumbers?.firstOrNull() ?: "暫無叫號"}",
                color = colors.foreground,
                fontSize = 12.sp,
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
private fun NearbyListRow(
    store: Store,
    distance: Float,
    waitingGroups: Int?,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val colors = LocalMetroColors.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .height(72.dp)
            .background(if (selected) colors.accent.copy(alpha = .16f) else androidx.compose.ui.graphics.Color.Transparent)
            .clickable(onClick = onClick),
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
            Text(
                store.address.ifBlank { store.district },
                color = colors.muted,
                fontSize = 12.sp,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Text(
            waitingGroups?.toString() ?: "—",
            color = colors.foreground,
            fontSize = 24.sp,
            fontWeight = FontWeight.Light,
        )
    }
}

private fun configureRadarStyle(style: Style, accent: Int) {
    style.addSource(GeoJsonSource(RADIUS_SOURCE, EMPTY_GEOJSON))
    style.addSource(GeoJsonSource(LINE_SOURCE, EMPTY_GEOJSON))
    style.addSource(GeoJsonSource(STORES_SOURCE, EMPTY_GEOJSON))
    style.addSource(GeoJsonSource(SELECTED_SOURCE, EMPTY_GEOJSON))
    style.addSource(GeoJsonSource(USER_SOURCE, EMPTY_GEOJSON))
    style.addSource(GeoJsonSource(DISTANCE_SOURCE, EMPTY_GEOJSON))
    style.addLayer(FillLayer(RADIUS_FILL_LAYER, RADIUS_SOURCE).withProperties(fillColor(accent), fillOpacity(.08f)))
    style.addLayer(LineLayer(RADIUS_LINE_LAYER, RADIUS_SOURCE).withProperties(lineColor(accent), lineOpacity(.5f), lineWidth(1.5f)))
    style.addLayer(LineLayer(CONNECTION_LAYER, LINE_SOURCE).withProperties(lineColor(accent), lineOpacity(.9f), lineWidth(4f)))
    style.addLayer(CircleLayer(STORE_HALO_LAYER, STORES_SOURCE).withProperties(circleRadius(8f), circleColor(AndroidColor.BLACK), circleOpacity(.86f)))
    style.addLayer(CircleLayer(STORE_LAYER, STORES_SOURCE).withProperties(circleRadius(5f), circleColor(AndroidColor.WHITE)))
    style.addLayer(
        SymbolLayer(STORE_LABEL_LAYER, STORES_SOURCE).withProperties(
            textField("{name}"),
            textSize(11f),
            textColor(AndroidColor.WHITE),
            textHaloColor(AndroidColor.BLACK),
            textHaloWidth(1.5f),
            textAllowOverlap(false),
        ),
    )
    style.addLayer(CircleLayer(SELECTED_HALO_LAYER, SELECTED_SOURCE).withProperties(circleRadius(18f), circleColor(AndroidColor.BLACK), circleOpacity(.72f)))
    style.addLayer(CircleLayer(SELECTED_LAYER, SELECTED_SOURCE).withProperties(circleRadius(10f), circleColor(accent), circleStrokeColor(AndroidColor.BLACK), circleStrokeWidth(4f)))
    style.addLayer(CircleLayer(USER_HALO_LAYER, USER_SOURCE).withProperties(circleRadius(17f), circleColor(accent), circleOpacity(.24f)))
    style.addLayer(CircleLayer(USER_LAYER, USER_SOURCE).withProperties(circleRadius(7f), circleColor(accent), circleStrokeColor(AndroidColor.BLACK), circleStrokeWidth(3f)))
    style.addLayer(
        SymbolLayer(DISTANCE_LAYER, DISTANCE_SOURCE).withProperties(
            textField("{label}"),
            textSize(12f),
            textColor(AndroidColor.WHITE),
            textHaloColor(AndroidColor.BLACK),
            textHaloWidth(2f),
            textAllowOverlap(true),
        ),
    )
}

private fun updateRadarStyle(
    style: Style,
    location: Location,
    stores: List<Store>,
    selectedStore: Store?,
    selectedDistance: Float?,
    radiusMeters: Int,
    showLabels: Boolean,
    accent: Int,
) {
    setSource(style, STORES_SOURCE, storeCollection(stores))
    setSource(style, USER_SOURCE, pointFeature(location.longitude, location.latitude))
    setSource(style, RADIUS_SOURCE, radiusFeature(location, radiusMeters))
    val selectedLatitude = selectedStore?.latitude
    val selectedLongitude = selectedStore?.longitude
    if (selectedLatitude != null && selectedLongitude != null) {
        setSource(style, SELECTED_SOURCE, pointFeature(selectedLongitude, selectedLatitude))
        setSource(style, LINE_SOURCE, lineFeature(location.longitude, location.latitude, selectedLongitude, selectedLatitude))
        setSource(
            style,
            DISTANCE_SOURCE,
            pointFeature(
                longitude = (location.longitude + selectedLongitude) / 2,
                latitude = (location.latitude + selectedLatitude) / 2,
                properties = JSONObject().put("label", selectedDistance?.let(::formatDistance) ?: "—"),
            ),
        )
    } else {
        setSource(style, SELECTED_SOURCE, EMPTY_GEOJSON)
        setSource(style, LINE_SOURCE, EMPTY_GEOJSON)
        setSource(style, DISTANCE_SOURCE, EMPTY_GEOJSON)
    }
    (style.getLayer(RADIUS_FILL_LAYER) as? FillLayer)?.setProperties(fillColor(accent))
    (style.getLayer(RADIUS_LINE_LAYER) as? LineLayer)?.setProperties(lineColor(accent))
    (style.getLayer(CONNECTION_LAYER) as? LineLayer)?.setProperties(lineColor(accent))
    (style.getLayer(SELECTED_LAYER) as? CircleLayer)?.setProperties(circleColor(accent))
    (style.getLayer(USER_HALO_LAYER) as? CircleLayer)?.setProperties(circleColor(accent))
    (style.getLayer(USER_LAYER) as? CircleLayer)?.setProperties(circleColor(accent))
    (style.getLayer(STORE_LABEL_LAYER) as? SymbolLayer)?.setProperties(visibility(if (showLabels) "visible" else "none"))
}

private fun setSource(style: Style, id: String, json: String) {
    (style.getSource(id) as? GeoJsonSource)?.setGeoJson(json)
}

private fun storeCollection(stores: List<Store>): String {
    val features = JSONArray()
    stores.forEach { store ->
        val latitude = store.latitude ?: return@forEach
        val longitude = store.longitude ?: return@forEach
        features.put(
            JSONObject(pointFeature(longitude, latitude))
                .put("properties", JSONObject().put("id", store.id).put("name", store.name)),
        )
    }
    return JSONObject().put("type", "FeatureCollection").put("features", features).toString()
}

private fun pointFeature(
    longitude: Double,
    latitude: Double,
    properties: JSONObject = JSONObject(),
): String = JSONObject()
    .put("type", "Feature")
    .put("geometry", JSONObject().put("type", "Point").put("coordinates", JSONArray().put(longitude).put(latitude)))
    .put("properties", properties)
    .toString()

private fun lineFeature(
    fromLongitude: Double,
    fromLatitude: Double,
    toLongitude: Double,
    toLatitude: Double,
): String {
    val coordinates = JSONArray()
        .put(JSONArray().put(fromLongitude).put(fromLatitude))
        .put(JSONArray().put(toLongitude).put(toLatitude))
    return JSONObject()
        .put("type", "Feature")
        .put("geometry", JSONObject().put("type", "LineString").put("coordinates", coordinates))
        .put("properties", JSONObject())
        .toString()
}

private fun radiusFeature(location: Location, radiusMeters: Int): String {
    val latitudeScale = radiusMeters / 111_320.0
    val longitudeScale = latitudeScale / cos(Math.toRadians(location.latitude)).coerceAtLeast(.15)
    val ring = JSONArray()
    repeat(65) { index ->
        val angle = index / 64.0 * Math.PI * 2
        ring.put(
            JSONArray()
                .put(location.longitude + kotlin.math.cos(angle) * longitudeScale)
                .put(location.latitude + kotlin.math.sin(angle) * latitudeScale),
        )
    }
    return JSONObject()
        .put("type", "Feature")
        .put("geometry", JSONObject().put("type", "Polygon").put("coordinates", JSONArray().put(ring)))
        .put("properties", JSONObject())
        .toString()
}

private fun distanceMeters(location: Location, store: Store): Float {
    val latitude = store.latitude ?: return Float.POSITIVE_INFINITY
    val longitude = store.longitude ?: return Float.POSITIVE_INFINITY
    val result = FloatArray(1)
    Location.distanceBetween(location.latitude, location.longitude, latitude, longitude, result)
    return result[0]
}

private fun formatDistance(meters: Float): String = if (meters < 1_000) {
    "${meters.toInt()} 米"
} else {
    String.format(Locale.US, "%.1f 公里", meters / 1_000f)
}

private fun formatRadius(meters: Int): String = if (meters < 1_000) {
    "$meters 米"
} else {
    String.format(Locale.US, "%.1f 公里", meters / 1_000f)
}

private fun zoomForRadius(radiusMeters: Int): Double =
    (15.2 - ln(radiusMeters.coerceAtLeast(200) / 500.0) / ln(2.0)).coerceIn(10.8, 16.2)

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
        ) { current ->
            if (current != null) callback(Result.success(current))
            else callback(Result.failure(IllegalStateException("Location unavailable")))
        }
    } else {
        val listener = object : LocationListener {
            override fun onLocationChanged(current: Location) {
                manager.removeUpdates(this)
                callback(Result.success(current))
            }

            @Deprecated("Deprecated in Android")
            override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) = Unit
            override fun onProviderEnabled(provider: String) = Unit
            override fun onProviderDisabled(provider: String) = Unit
        }
        manager.requestSingleUpdate(provider, listener, Looper.getMainLooper())
    }
}

private const val EMPTY_GEOJSON = "{\"type\":\"FeatureCollection\",\"features\":[]}"
private const val RADIUS_SOURCE = "radar-radius"
private const val LINE_SOURCE = "radar-line"
private const val STORES_SOURCE = "radar-stores"
private const val SELECTED_SOURCE = "radar-selected"
private const val USER_SOURCE = "radar-user"
private const val DISTANCE_SOURCE = "radar-distance"
private const val RADIUS_FILL_LAYER = "radar-radius-fill"
private const val RADIUS_LINE_LAYER = "radar-radius-line"
private const val CONNECTION_LAYER = "radar-connection"
private const val STORE_HALO_LAYER = "radar-store-halo"
private const val STORE_LAYER = "radar-store-points"
private const val STORE_LABEL_LAYER = "radar-store-labels"
private const val SELECTED_HALO_LAYER = "radar-selected-halo"
private const val SELECTED_LAYER = "radar-selected-point"
private const val USER_HALO_LAYER = "radar-user-halo"
private const val USER_LAYER = "radar-user-point"
private const val DISTANCE_LAYER = "radar-distance-label"
