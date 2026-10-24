package com.heptivision.airo.data.trips

import android.content.Context
import com.heptivision.airo.core.model.RoadRoute
import com.heptivision.airo.core.network.wireJson

/** Five real OSM/Valhalla pedestrian legs, bundled on 2026-09-18; no runtime network in Demo. */
fun readDemoRoads(context: Context): Map<String, RoadRoute> = context.assets.open("rome-routes.json").bufferedReader().use {
    wireJson.decodeFromString(it.readText())
}
