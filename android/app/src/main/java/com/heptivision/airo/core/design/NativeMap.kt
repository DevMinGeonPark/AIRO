package com.heptivision.airo.core.design

import android.content.ComponentCallbacks2
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Paint
import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.compose.foundation.layout.*
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.heptivision.airo.core.model.PlaybackPoint
import com.heptivision.airo.core.model.PlaybackLeg
import com.heptivision.airo.core.model.Stop
import com.heptivision.airo.core.model.MapLocationPoint
import com.heptivision.airo.core.model.pendingChoice
import com.heptivision.airo.core.model.withCandidate
import com.heptivision.airo.core.model.stopOrdinals
import org.maplibre.android.MapLibre
import org.maplibre.android.camera.CameraPosition
import org.maplibre.android.camera.CameraUpdateFactory
import org.maplibre.android.geometry.LatLng
import org.maplibre.android.geometry.LatLngBounds
import org.maplibre.android.maps.*
import org.maplibre.android.style.layers.*
import org.maplibre.android.style.layers.PropertyFactory.*
import org.maplibre.android.style.sources.GeoJsonSource
import org.maplibre.android.style.expressions.Expression.*
import org.maplibre.geojson.Feature
import org.maplibre.geojson.FeatureCollection
import org.maplibre.geojson.LineString
import org.maplibre.geojson.Point

/** Native MapLibre view; the composable owns its lifecycle and disposes GPU resources. */
@Composable fun NativeMap(
    stops: List<Stop>, modifier: Modifier = Modifier, offline: Boolean = false,
    roads: List<List<List<Double>>> = emptyList(), choiceRoads: List<List<List<Double>>> = emptyList(), selectedId: String? = null,
    frameKey: String = "", interactive: Boolean = true,
    onSelect: (String) -> Unit = {}, onLongPress: (Double, Double) -> Unit = { _, _ -> },
    onError: (String?) -> Unit = {}, onMapTap: () -> Unit = {},
    flights: List<List<List<Double>>> = emptyList(),
    frameInsets: PaddingValues = PaddingValues(28.dp),
    showLabels: Boolean = false,
    movingPoint: PlaybackPoint? = null, playbackLeg: PlaybackLeg? = null,
    completedIds: Set<String> = emptySet(), progressReady: Boolean = true,
    userLocation: MapLocationPoint? = null,
) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    val latestStops by rememberUpdatedState(stops)
    val select by rememberUpdatedState(onSelect)
    val longPress by rememberUpdatedState(onLongPress)
    val error by rememberUpdatedState(onError)
    val mapTap by rememberUpdatedState(onMapTap)
    val density = androidx.compose.ui.platform.LocalDensity.current
    val direction = androidx.compose.ui.platform.LocalLayoutDirection.current
    val insets = with(density) { listOf(frameInsets.calculateLeftPadding(direction).toPx(), frameInsets.calculateTopPadding().toPx(),
        frameInsets.calculateRightPadding(direction).toPx(), frameInsets.calculateBottomPadding().toPx()).map { it.toInt() } }
    val latestInsets by rememberUpdatedState(insets)
    var savedLat by rememberSaveable { mutableStateOf<Double?>(null) }
    var savedLng by rememberSaveable { mutableStateOf<Double?>(null) }
    var savedZoom by rememberSaveable { mutableDoubleStateOf(14.2) }
    var lastFrame by rememberSaveable { mutableStateOf<String?>(null) }
    var lastFocus by rememberSaveable { mutableStateOf<String?>(null) }
    var controller by remember { mutableStateOf<MapLibreMap?>(null) }
    var ready by remember { mutableStateOf(false) }
    var hasLayout by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    var attempt by remember { mutableIntStateOf(0) }
    var disposed by remember { mutableStateOf(false) }
    var foreground by remember { mutableStateOf(owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) }
    var lastCompleted by remember { mutableStateOf<Set<String>?>(null) }
    LifecycleEventEffect(Lifecycle.Event.ON_RESUME) { foreground = true }
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { foreground = false }
    val mapView = remember {
        MapLibre.getInstance(context)
        MapView(context, MapLibreMapOptions.createFromAttributes(context)
            .textureMode(true).attributionEnabled(false).logoEnabled(false)).apply { onCreate(null) }
    }
    DisposableEffect(mapView, owner) {
        val observer = LifecycleEventObserver { _, event ->
            when(event) {
                Lifecycle.Event.ON_START -> mapView.onStart()
                Lifecycle.Event.ON_RESUME -> mapView.onResume()
                Lifecycle.Event.ON_PAUSE -> mapView.onPause()
                Lifecycle.Event.ON_STOP -> mapView.onStop()
                else -> Unit
            }
        }
        val memory = object : ComponentCallbacks2 {
            override fun onTrimMemory(level: Int) { if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) mapView.onLowMemory() }
            override fun onLowMemory() { mapView.onLowMemory() }
            override fun onConfigurationChanged(newConfig: Configuration) = Unit
        }
        owner.lifecycle.addObserver(observer)
        context.registerComponentCallbacks(memory)
        onDispose {
            disposed = true
            owner.lifecycle.removeObserver(observer)
            context.unregisterComponentCallbacks(memory)
            if (owner.lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) mapView.onPause()
            if (owner.lifecycle.currentState.isAtLeast(Lifecycle.State.STARTED)) mapView.onStop()
            mapView.onDestroy()
        }
    }
    LaunchedEffect(mapView) {
        mapView.addOnDidFailLoadingMapListener {
            if (!disposed) {
                failure = "지도를 불러오지 못했어요. 연결을 확인해 주세요."
                error(failure!!)
            }
        }
        mapView.getMapAsync { map ->
            if (disposed) return@getMapAsync
            controller = map
            map.uiSettings.apply {
                isRotateGesturesEnabled = interactive; isScrollGesturesEnabled = interactive
                isZoomGesturesEnabled = interactive; isTiltGesturesEnabled = false
                isCompassEnabled = false
            }
            map.cameraPosition = CameraPosition.Builder().target(LatLng(savedLat ?: 41.899, savedLng ?: 12.477)).zoom(savedZoom).build()
            map.addOnCameraIdleListener {
                if (!disposed && ready) { val camera = map.cameraPosition; savedLat = camera.target?.latitude; savedLng = camera.target?.longitude; savedZoom = camera.zoom }
            }
            if (interactive) {
                map.addOnMapClickListener { point ->
                    val screen = map.projection.toScreenLocation(point)
                    val feature = map.queryRenderedFeatures(screen, "airo-pins").firstOrNull()
                    feature?.getStringProperty("id")?.let(select)
                    if (feature == null) mapTap()
                    true
                }
                map.addOnMapLongClickListener { longPress(it.latitude, it.longitude); true }
            }
        }
    }
    LaunchedEffect(controller, offline, attempt) {
        val map = controller ?: return@LaunchedEffect
        ready = false
        failure = null
        val style = if (offline) Style.Builder().fromJson("""{"version":8,"sources":{},"layers":[{"id":"background","type":"background","paint":{"background-color":"#101113"}}]}""")
                else Style.Builder().fromUri("https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json")
            map.setStyle(style) { loaded ->
                if (disposed) return@setStyle
                failure = null
                error(null)
                if (offline) {
                    loaded.addSource(GeoJsonSource("rome", context.assets.open("rome.geojson").bufferedReader().use { it.readText() }))
                    loaded.addLayer(FillLayer("rome-water", "rome").withFilter(eq(get("kind"), literal("water"))).withProperties(fillColor("#172B3B")))
                    loaded.addLayer(FillLayer("rome-parks", "rome").withFilter(eq(get("kind"), literal("park"))).withProperties(fillColor("#1C3029")))
                    loaded.addLayer(LineLayer("rome-roads", "rome").withFilter(eq(geometryType(), literal("LineString"))).withProperties(lineColor("#3E444F"), lineWidth(2.0f)))
                }
                loaded.addSource(GeoJsonSource("airo-route", FeatureCollection.fromFeatures(emptyArray<Feature>())))
                loaded.addLayer(LineLayer("airo-route-line", "airo-route").withProperties(lineColor("#86A5FF"), lineWidth(3.0f), lineCap(Property.LINE_CAP_ROUND), lineJoin(Property.LINE_JOIN_ROUND)))
                loaded.addSource(GeoJsonSource("airo-choice-route", FeatureCollection.fromFeatures(emptyArray<Feature>())))
                loaded.addLayer(LineLayer("airo-choice-route-line", "airo-choice-route").withProperties(lineColor("#A9BDD8"), lineWidth(2f), lineDasharray(arrayOf(3f, 3f))))
                loaded.addSource(GeoJsonSource("airo-flight", FeatureCollection.fromFeatures(emptyArray<Feature>())))
                loaded.addLayer(LineLayer("airo-flight-line", "airo-flight").withProperties(lineColor("#A9BDD8"), lineWidth(2.5f), lineDasharray(arrayOf(2f, 1.5f))))
                loaded.addSource(GeoJsonSource("airo-moving", FeatureCollection.fromFeatures(emptyArray<Feature>())))
                loaded.addImage("moving-ground", movingPin(false)); loaded.addImage("moving-flight", movingPin(true))
                loaded.addLayer(SymbolLayer("airo-moving-pin", "airo-moving").withProperties(iconImage(org.maplibre.android.style.expressions.Expression.get("image")),
                    iconRotate(org.maplibre.android.style.expressions.Expression.get("heading")), iconRotationAlignment(Property.ICON_ROTATION_ALIGNMENT_MAP), iconAllowOverlap(true), iconIgnorePlacement(true), iconSize(.75f)))
                loaded.addSource(GeoJsonSource("airo-completion", FeatureCollection.fromFeatures(emptyArray<Feature>())))
                loaded.addLayer(CircleLayer("airo-completion-pulse", "airo-completion").withProperties(circleColor("#76D8AC"), circleRadius(12f), circleOpacity(0f)))
                loaded.addSource(GeoJsonSource("airo-stops", FeatureCollection.fromFeatures(emptyArray<Feature>())))
                loaded.addSource(GeoJsonSource("airo-user-location", FeatureCollection.fromFeatures(emptyArray<Feature>())))
                loaded.addLayer(SymbolLayer("airo-pins", "airo-stops").withProperties(
                    iconImage(org.maplibre.android.style.expressions.Expression.get("pin")), iconAllowOverlap(true), iconIgnorePlacement(true), iconSize(0.8f)))
                loaded.addLayer(CircleLayer("airo-user-location-halo", "airo-user-location").withProperties(circleRadius(15f), circleColor("#3B82F6"), circleOpacity(.2f)))
                loaded.addLayer(CircleLayer("airo-user-location-dot", "airo-user-location").withProperties(circleRadius(7f), circleColor("#3B82F6"), circleStrokeWidth(3f), circleStrokeColor("#FFFFFF")))
                ready = true
            }
    }
    LaunchedEffect(ready, stops, selectedId, roads, choiceRoads, flights, showLabels, completedIds) {
        if (!ready) return@LaunchedEffect
        val style = controller?.style ?: return@LaunchedEffect
        val ordinals = stopOrdinals(stops)
        val features = stops.flatMap { stop -> if (stop.pendingChoice()) stop.choice!!.candidates.map(stop::withCandidate) else listOf(stop) }.map { stop ->
            val number = ordinals[stop.id] ?: 1
            val label = stop.name.takeIf { stop.pendingChoice() || showLabels || stop.id == selectedId }
            val done = stop.id in completedIds
            val pin = "airo-$number-${stop.id == selectedId}-${stop.mode}-$done-${label.orEmpty()}"
            if (style.getImage(pin) == null) style.addImage(pin, numberedPin(number, stop.id == selectedId, label, stop.mode == "flight", done))
            Feature.fromGeometry(Point.fromLngLat(stop.lng, stop.lat)).apply { addStringProperty("id", stop.id); addStringProperty("pin", pin); addBooleanProperty("done", done) }
        }
        style.getSourceAs<GeoJsonSource>("airo-stops")?.setGeoJson(FeatureCollection.fromFeatures(features))
        style.getSourceAs<GeoJsonSource>("airo-route")?.setGeoJson(FeatureCollection.fromFeatures(roads.filter { it.size >= 2 }.mapIndexed { index, line ->
            Feature.fromGeometry(LineString.fromLngLats(line.map { Point.fromLngLat(it[0], it[1]) }), null, "road-$index")
        }))
        style.getSourceAs<GeoJsonSource>("airo-choice-route")?.setGeoJson(FeatureCollection.fromFeatures(choiceRoads.filter { it.size >= 2 }.mapIndexed { index, line ->
            Feature.fromGeometry(LineString.fromLngLats(line.map { Point.fromLngLat(it[0], it[1]) }), null, "choice-road-$index")
        }))
        style.getSourceAs<GeoJsonSource>("airo-flight")?.setGeoJson(FeatureCollection.fromFeatures(flights.filter { it.size >= 2 }.map { line ->
            Feature.fromGeometry(LineString.fromLngLats(line.map { Point.fromLngLat(it[0], it[1]) }))
        }))
    }
    LaunchedEffect(ready, progressReady, completedIds, foreground, frameKey) {
        if (!ready || !progressReady) return@LaunchedEffect
        val previous = lastCompleted
        lastCompleted = completedIds
        val added = if (previous == null) emptySet() else completedIds - previous
        val style = controller?.style ?: return@LaunchedEffect
        val source = style.getSourceAs<GeoJsonSource>("airo-completion") ?: return@LaunchedEffect
        val layer = style.getLayerAs<CircleLayer>("airo-completion-pulse") ?: return@LaunchedEffect
        source.setGeoJson(FeatureCollection.fromFeatures(emptyArray<Feature>()))
        if (!foreground || added.isEmpty() || !android.animation.ValueAnimator.areAnimatorsEnabled()) return@LaunchedEffect
        val points = latestStops.filter { it.id in added }.map { stop -> Feature.fromGeometry(Point.fromLngLat(stop.lng, stop.lat)).apply { addStringProperty("id", stop.id) } }
        source.setGeoJson(FeatureCollection.fromFeatures(points))
        try {
            animate(0f, 1f, animationSpec = tween(650)) { value, _ ->
                if (!disposed) layer.setProperties(circleRadius(12f + 30f * value), circleOpacity(.65f * (1f - value)))
            }
        } finally {
            if (!disposed && controller?.style === style) {
                layer.setProperties(circleOpacity(0f))
                source.setGeoJson(FeatureCollection.fromFeatures(emptyArray<Feature>()))
            }
        }
    }
    LaunchedEffect(ready, hasLayout, frameKey, stops.map { Triple(it.id, it.lat, it.lng) }) {
        if (!ready || !hasLayout || latestStops.isEmpty()) return@LaunchedEffect
        val signature = frameKey + latestStops.joinToString { "${it.id}:${it.lat}:${it.lng}" }
        if (lastFrame == signature && savedLat != null) return@LaunchedEffect
        lastFrame = signature
        val points = latestStops.flatMap { stop -> if (stop.pendingChoice()) stop.choice!!.candidates.map { LatLng(it.lat, it.lng) } else listOf(LatLng(stop.lat, stop.lng)) }
        val padding = latestInsets
        if (points.distinct().size == 1) controller?.animateCamera(CameraUpdateFactory.newCameraPosition(CameraPosition.Builder()
            .target(points.first()).zoom(14.5).padding(padding.map(Int::toDouble).toDoubleArray()).build()))
        else controller?.animateCamera(CameraUpdateFactory.newLatLngBounds(LatLngBounds.Builder().includes(points).build(), padding[0], padding[1], padding[2], padding[3]))
    }
    LaunchedEffect(ready, selectedId, playbackLeg) {
        if (selectedId == null) lastFocus = null
        if (ready && playbackLeg == null && selectedId != null && selectedId != lastFocus) latestStops.find { it.id == selectedId }?.let {
            lastFocus = selectedId
            if (it.choice != null) controller?.animateCamera(CameraUpdateFactory.newLatLngBounds(LatLngBounds.Builder().includes(it.choice.candidates.map { c -> LatLng(c.lat, c.lng) }).build(), latestInsets[0], latestInsets[1], latestInsets[2], latestInsets[3]))
            else controller?.animateCamera(CameraUpdateFactory.newCameraPosition(CameraPosition.Builder().target(LatLng(it.lat, it.lng))
                .zoom(15.0).padding(latestInsets.map(Int::toDouble).toDoubleArray()).build()))
        }
    }
    LaunchedEffect(ready, movingPoint) {
        if (ready) controller?.style?.getSourceAs<GeoJsonSource>("airo-moving")?.setGeoJson(FeatureCollection.fromFeatures(movingPoint?.let {
            listOf(Feature.fromGeometry(Point.fromLngLat(it.lng, it.lat)).apply { addNumberProperty("heading", it.heading); addStringProperty("image", if (it.flight) "moving-flight" else "moving-ground") })
        } ?: emptyList()))
    }
    LaunchedEffect(ready, playbackLeg) {
        if (ready && playbackLeg != null) {
            val padding = latestInsets
            controller?.animateCamera(CameraUpdateFactory.newLatLngBounds(LatLngBounds.Builder().includes(playbackLeg.path.map { LatLng(it[1], it[0]) }).build(), padding[0], padding[1], padding[2], padding[3]), 650)
        }
    }
    LaunchedEffect(ready, hasLayout, userLocation) {
        if (!ready || !hasLayout) return@LaunchedEffect
        controller?.style?.getSourceAs<GeoJsonSource>("airo-user-location")?.setGeoJson(FeatureCollection.fromFeatures(userLocation?.let {
            listOf(Feature.fromGeometry(Point.fromLngLat(it.lng, it.lat)))
        } ?: emptyList()))
        userLocation?.let { point ->
            controller?.animateCamera(CameraUpdateFactory.newCameraPosition(CameraPosition.Builder().target(LatLng(point.lat, point.lng))
                .zoom(point.zoom).padding(latestInsets.map(Int::toDouble).toDoubleArray()).build()))
        }
    }
    Box(modifier.onSizeChanged { hasLayout = it.width > 0 && it.height > 0 }.testTag("native-map")) {
        AndroidView(factory = { mapView }, modifier = Modifier.fillMaxSize())
        if (!ready && failure == null) CircularProgressIndicator(Modifier.align(Alignment.Center).size(28.dp))
        if (failure != null) Surface(Modifier.align(Alignment.Center).padding(20.dp), color = Panel) {
            Column(Modifier.padding(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                Text(failure!!, color = Muted)
                TextButton(onClick = { attempt++ }) { Text("지도 다시 불러오기") }
            }
        }
    }
}

private fun numberedPin(number: Int, selected: Boolean, label: String? = null, flight: Boolean = false, done: Boolean = false): Bitmap {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.textSize = 24f
    val name = label?.let { if (it.length > 22) it.take(21) + "…" else it }
    val width = maxOf(64, (name?.let { paint.measureText(it) + 20 } ?: 0f).toInt())
    // Symmetric vertical padding keeps the geographic point at the numbered circle's center.
    val bitmap = Bitmap.createBitmap(width, if (name != null) 144 else 64, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val cx = width / 2f; val cy = bitmap.height / 2f
    paint.color = android.graphics.Color.parseColor(if (done) "#76D8AC" else if (selected) "#FFFFFF" else if (flight) "#A9BDD8" else "#86A5FF")
    canvas.drawCircle(cx, cy, 24f, paint)
    paint.color = android.graphics.Color.parseColor("#0A0A0A"); paint.textSize = 26f; paint.textAlign = Paint.Align.CENTER; paint.isFakeBoldText = true
    if (done) {
        paint.style = Paint.Style.STROKE; paint.strokeWidth = 5f; paint.strokeCap = Paint.Cap.ROUND; paint.strokeJoin = Paint.Join.ROUND
        canvas.drawPath(android.graphics.Path().apply { moveTo(cx - 11, cy); lineTo(cx - 3, cy + 8); lineTo(cx + 12, cy - 9) }, paint)
        paint.style = Paint.Style.FILL
    } else canvas.drawText(number.toString(), cx, cy - (paint.ascent() + paint.descent()) / 2, paint)
    if (name != null) {
        paint.color = android.graphics.Color.parseColor("#DD0A0A0A")
        canvas.drawRoundRect(0f, cy + 28, width.toFloat(), cy + 62, 5f, 5f, paint)
        paint.color = android.graphics.Color.WHITE; paint.textSize = 24f; paint.isFakeBoldText = false
        canvas.drawText(name, cx, cy + 45 - (paint.ascent() + paint.descent()) / 2, paint)
    }
    return bitmap
}

@Composable fun MapAttribution(offline: Boolean, modifier: Modifier = Modifier) {
    Text(if (offline) "© OpenStreetMap contributors · 로마 샘플 지도" else "© OpenStreetMap contributors © CARTO",
        modifier.padding(horizontal = 12.dp, vertical = 6.dp), color = Muted, style = androidx.compose.material3.MaterialTheme.typography.labelSmall)
}

private fun movingPin(flight: Boolean): Bitmap {
    val bitmap = Bitmap.createBitmap(72, 72, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap); val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.color = android.graphics.Color.WHITE; canvas.drawCircle(36f, 36f, 33f, paint)
    paint.color = android.graphics.Color.rgb(32, 43, 66)
    if (flight) { paint.textSize = 47f; paint.textAlign = Paint.Align.CENTER; canvas.drawText("✈", 36f, 52f, paint) }
    else canvas.drawPath(android.graphics.Path().apply { moveTo(36f, 12f); lineTo(56f, 57f); lineTo(36f, 47f); lineTo(16f, 57f); close() }, paint)
    return bitmap
}
