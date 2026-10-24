package com.heptivision.airo.feature.itinerary

import android.animation.ValueAnimator
import androidx.compose.runtime.*
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.heptivision.airo.core.model.*
import kotlinx.coroutines.*

@Stable class TripPlayback {
    var playing by mutableStateOf(false); private set
    var point by mutableStateOf<PlaybackPoint?>(null); private set
    var leg by mutableStateOf<PlaybackLeg?>(null); private set
    private var job: Job? = null
    private var generation = 0
    fun stop() { generation++; job?.cancel(); job = null; playing = false; point = null; leg = null }
    fun start(scope: CoroutineScope, plan: PlaybackPlan, onSelect: (String) -> Unit) {
        if (playing) { stop(); return }
        if (!plan.ready) return
        if (!ValueAnimator.areAnimatorsEnabled()) { onSelect(plan.legs.first().from.id); return }
        val run = ++generation
        playing = true
        job = scope.launch {
            try {
                for (segment in plan.legs) {
                    leg = segment; onSelect(segment.from.id); delay(700)
                    val distances = measurePath(segment.path)
                    val duration = (distances.last() * .012).coerceIn(1600.0, 4200.0)
                    val began = android.os.SystemClock.elapsedRealtime()
                    do {
                        val t = ((android.os.SystemClock.elapsedRealtime() - began) / duration).coerceAtMost(1.0)
                        val eased = if (t < .5) 2 * t * t else 1 - (-2 * t + 2) * (-2 * t + 2) / 2
                        point = pointOnPath(segment, distances, eased)
                        if (t >= 1) break
                        delay(32)
                    } while (currentCoroutineContext().isActive)
                    onSelect(segment.to.id); delay(350)
                }
            } finally { if (run == generation) { playing = false; point = null; leg = null } }
        }
    }
}
@Composable fun rememberTripPlayback(stops: List<Stop>): TripPlayback {
    val playback = remember { TripPlayback() }
    DisposableEffect(stops) { onDispose { playback.stop() } }
    LifecycleEventEffect(Lifecycle.Event.ON_PAUSE) { playback.stop() }
    return playback
}
