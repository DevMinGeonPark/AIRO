package com.heptivision.airo.navigation

import android.net.Uri
import androidx.browser.customtabs.CustomTabsIntent
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.AccountCircle
import androidx.compose.material.icons.outlined.Luggage
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.navigation.navArgument
import com.heptivision.airo.core.model.*
import com.heptivision.airo.core.network.wireJson
import com.heptivision.airo.feature.history.*
import com.heptivision.airo.feature.share.*
import kotlinx.serialization.encodeToString
import java.io.File
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.compose.*
import com.heptivision.airo.AppContainer
import com.heptivision.airo.core.design.*
import com.heptivision.airo.feature.auth.*
import com.heptivision.airo.feature.budget.*
import com.heptivision.airo.feature.resources.*
import com.heptivision.airo.feature.chat.*
import com.heptivision.airo.feature.transfer.*
import com.heptivision.airo.feature.itinerary.*
import com.heptivision.airo.feature.profile.ProfileScreen
import com.heptivision.airo.feature.profile.UpdateViewModel
import com.heptivision.airo.feature.trips.*
import com.heptivision.airo.feature.welcome.WelcomeScreen
import com.heptivision.airo.modelFactory

@Composable fun AiroApp(container: AppContainer, auth: AuthViewModel, share: ShareViewModel, onServerChange: (String) -> Unit) {
    val session by auth.session.collectAsStateWithLifecycle()
    val authState by auth.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val updates: UpdateViewModel = viewModel(factory = modelFactory { UpdateViewModel(container.updates) })
    val shared by share.state.collectAsStateWithLifecycle()
    val documents = File(context.cacheDir, "documents/${session?.user?.id ?: "guest"}")
    LaunchedEffect(session?.user?.id) {
        share.account(session?.user?.id)
        kotlinx.coroutines.withContext(kotlinx.coroutines.Dispatchers.IO) { context.cacheDir.resolve("documents").listFiles()?.filter { session == null || it.name != session?.user?.id }?.forEach { it.deleteRecursively() } }
    }
    LaunchedEffect(auth) {
        auth.browserEvents.collect { url ->
            try { CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(context, Uri.parse(url)) }
            catch (_: android.content.ActivityNotFoundException) { auth.report("로그인하려면 브라우저 앱을 설치해 주세요.") }
        }
    }
    // Removing the whole authenticated graph also removes account-scoped ViewModels and drafts.
    key(session?.user?.id ?: "guest") {
        val nav = rememberNavController()
        val entry by nav.currentBackStackEntryAsState()
        val route = entry?.destination?.route
        val account = session?.user
        fun resourceRoute(id: String, selection: TravelContext = TravelContext()) = "trip/$id/resources?context=${Uri.encode(wireJson.encodeToString(selection))}"
        fun chatRoute(id: String, selection: TravelContext) = "trip/$id/chat?context=${Uri.encode(wireJson.encodeToString(selection))}"
        val home = account != null && route in listOf("trips", "profile")
        Scaffold(containerColor = Ink, contentWindowInsets = WindowInsets.safeDrawing, bottomBar = {
            if (home) NavigationBar(containerColor = Ink) {
                listOf(Triple("trips", "내 여행", Icons.Outlined.Luggage), Triple("profile", "내 정보", Icons.Outlined.AccountCircle)).forEach { (destination, title, icon) ->
                    NavigationBarItem(selected = route == destination, onClick = { nav.navigate(destination) {
                        popUpTo("trips") { saveState = true }; launchSingleTop = true; restoreState = true
                    } }, icon = { Icon(icon, null) }, label = { Text(title) })
                }
            }
        }) { padding ->
            NavHost(navController = nav, startDestination = if (account == null) "welcome" else "trips", modifier = Modifier.padding(padding).consumeWindowInsets(padding)) {
                if (account == null) {
                    composable("welcome") { WelcomeScreen { nav.navigate("login") } }
                    composable("login") { LoginScreen(auth, onServerChange) { nav.popBackStack() } }
                } else {
                    composable("trips") {
                        val model: TripsViewModel = viewModel(factory = modelFactory { TripsViewModel(container.trips) })
                        TripsScreen(model, onImport = { nav.navigate("import") }) { nav.navigate("trip/$it") }
                    }
                    composable("profile") { ProfileScreen(account, updates, auth::signOut) }
                    composable("trip/{id}") { backStack ->
                        val id = requireNotNull(backStack.arguments?.getString("id"))
                        val model: ItineraryViewModel = viewModel(factory = modelFactory { ItineraryViewModel(id, container.trips) })
                        val progress: ProgressViewModel = viewModel(factory = modelFactory { ProgressViewModel(id, container.trips) })
                        val preparation: PreparationViewModel = viewModel(factory = modelFactory { PreparationViewModel(id, container.trips) })
                        ItineraryScreen(model, progress, preparation, container.photos, onBudget = { nav.navigate("trip/$id/budget") }, onResources = { nav.navigate(resourceRoute(id, it)) }, onChat = { nav.navigate(chatRoute(id, it)) }, onExport = { nav.navigate("trip/$id/export") }, onHistory = { nav.navigate("trip/$id/history") }) { nav.popBackStack() }
                    }
                    composable("trip/{id}/budget?reservation={reservation}", arguments = listOf(navArgument("reservation") { defaultValue = "" })) { backStack ->
                        val id = requireNotNull(backStack.arguments?.getString("id"))
                        val model: BudgetViewModel = viewModel(factory = modelFactory { BudgetViewModel(id, container.trips, backStack.arguments?.getString("reservation")?.ifBlank { null }) })
                        BudgetScreen(model) { nav.popBackStack() }
                    }
                    composable("trip/{id}/resources?context={context}", arguments = listOf(navArgument("context") { defaultValue = "" })) { backStack ->
                        val id = requireNotNull(backStack.arguments?.getString("id"))
                        val model: ResourcesViewModel = viewModel(factory = modelFactory { ResourcesViewModel(id, container.trips) })
                        val images: PreparationViewModel = viewModel(factory = modelFactory { PreparationViewModel(id, container.trips) })
                        val selection = decodeContext(backStack.arguments?.getString("context"))
                        val incoming = shared.item?.takeIf { it.owner == account.id && it.tripId == id }
                        ResourcesScreen(model, documents, selection, incoming?.path, incoming?.name, incoming?.link, share::clear,
                            onAI = { nav.navigate(chatRoute(id, it)) }, onBudget = { nav.navigate("trip/$id/budget?reservation=$it") }, images = images) { nav.popBackStack() }
                    }
                    composable("trip/{id}/chat?context={context}", arguments = listOf(navArgument("context") { defaultValue = "" })) { backStack ->
                        val id = requireNotNull(backStack.arguments?.getString("id"))
                        val model: ChatViewModel = viewModel(factory = modelFactory { ChatViewModel(id, container.ai, container.trips, decodeContext(backStack.arguments?.getString("context"))) })
                        ChatScreen(model, onResources = { nav.navigate(resourceRoute(id, model.context.copy(documents = emptyList()))) }, onBudget = { nav.navigate("trip/$id/budget") }) { nav.popBackStack() }
                    }
                    composable("trip/{id}/history") { backStack ->
                        val id = requireNotNull(backStack.arguments?.getString("id"))
                        val model: HistoryViewModel = viewModel(factory = modelFactory { HistoryViewModel(id, container.trips) })
                        HistoryScreen(model) { nav.popBackStack() }
                    }
                    composable("import") {
                        val model: TransferViewModel = viewModel(factory = modelFactory { TransferViewModel(null, container.trips) })
                        TransferScreen(model, onOpen = { nav.navigate("trip/$it") { popUpTo("trips") } }) { nav.popBackStack() }
                    }
                    composable("trip/{id}/export") { backStack ->
                        val id = requireNotNull(backStack.arguments?.getString("id"))
                        val model: TransferViewModel = viewModel(factory = modelFactory { TransferViewModel(id, container.trips) })
                        TransferScreen(model, onOpen = {}) { nav.popBackStack() }
                    }
                }
            }
            if (account == null && route == "welcome" && authState.busy) Surface(color = Ink.copy(alpha = .96f), modifier = Modifier.fillMaxSize()) { LoadingState("로그인을 확인하고 있어요") }
        }
        val item = shared.item
        if (shared.error != null) AlertDialog(onDismissRequest = share::clear, title = { Text("자료 공유") }, text = { Text(shared.error!!) }, confirmButton = { TextButton(share::clear) { Text("확인") } })
        if (item != null && item.tripId == null) {
            if (account == null && route != "login") AlertDialog(onDismissRequest = share::clear, title = { Text("로그인하고 자료 추가") }, text = { Text("${item.name}을 여행에 추가하려면 로그인해 주세요. 로그인 후 이어갈 수 있어요.") }, confirmButton = { TextButton({ nav.navigate("login") }) { Text("로그인") } }, dismissButton = { TextButton(share::clear) { Text("취소") } })
            else if (account != null) {
                val model: TripsViewModel = viewModel(key = "share-${item.id}", factory = modelFactory { TripsViewModel(container.trips) })
                val trips by model.state.collectAsStateWithLifecycle()
                AlertDialog(onDismissRequest = share::clear, title = { Text("자료를 보관할 여행") }, text = {
                    Column { Text(item.name); ErrorNotice(trips.error, model::refresh)
                        if (trips.loading) CircularProgressIndicator()
                        LazyColumn(Modifier.heightIn(max = 360.dp)) { items(trips.data?.trips.orEmpty(), key = { it.trip.id }) { row -> TextButton({ share.choose(row.trip.id); nav.navigate(resourceRoute(row.trip.id)) }, Modifier.fillMaxWidth()) { Text(row.trip.title) } } }
                        if (!trips.loading && trips.data?.trips.orEmpty().isEmpty()) Text("먼저 여행을 만든 뒤 자료를 추가하세요.")
                    }
                }, confirmButton = { TextButton(share::clear) { Text("취소") } })
            }
        }
        LaunchedEffect(authState.error) {
            if (account == null && authState.error != null && nav.currentDestination?.route == "welcome") nav.navigate("login")
        }
    }
}

private fun decodeContext(value: String?): TravelContext = runCatching { wireJson.decodeFromString<TravelContext>(value.orEmpty()) }.getOrDefault(TravelContext())
