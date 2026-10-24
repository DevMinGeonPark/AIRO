package com.heptivision.airo.feature.budget

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.Add
import androidx.compose.material.icons.outlined.Edit
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.*
import java.util.UUID
import kotlin.math.roundToLong

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun BudgetScreen(model: BudgetViewModel, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    val budget = state.budget
    var editor by rememberSaveable { mutableStateOf(false) }
    var entryId by rememberSaveable { mutableStateOf<String?>(null) }
    var fromReservation by rememberSaveable { mutableStateOf(false) }
    var choosingExisting by rememberSaveable { mutableStateOf(false) }
    var reserveEditor by rememberSaveable { mutableStateOf(false) }
    var reserveText by rememberSaveable { mutableStateOf("") }
    Scaffold(containerColor = Ink, topBar = {
        TopAppBar(title = { Text("여행 예산") }, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "일정으로") } }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Ink))
    }, floatingActionButton = {
        if (budget != null) ExtendedFloatingActionButton(onClick = { entryId = null; fromReservation = false; model.clearForm(); editor = true }, icon = { Icon(Icons.Outlined.Add, null) }, text = { Text("지출 추가") }, modifier = Modifier.semantics { contentDescription = "지출 추가" }, containerColor = AirBlue, contentColor = Ink)
    }) { padding ->
        if (state.loading && budget == null) LoadingState("예산을 불러오고 있어요")
        else LazyColumn(Modifier.fillMaxSize().padding(padding), contentPadding = PaddingValues(24.dp, 16.dp, 24.dp, 100.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            item { ErrorNotice(state.error, model::refresh) }
            if (budget != null) {
                state.reservation?.let { reservation -> item { AiroCard {
                    Text(reservation.name, style = MaterialTheme.typography.titleMedium)
                    val linked = budget.entries.find { it.reservationId == reservation.id }
                    if (linked != null) {
                        Text("연결된 지출 · ${linked.name}", color = AirBlue)
                        TextButton({ entryId = linked.id; fromReservation = false; model.clearForm(); editor = true }) { Text("연결된 지출 수정") }
                    } else {
                        Text("금액은 직접 확인해 입력하세요. 기존 지출이 있으면 연결하여 중복을 피할 수 있어요.", color = Muted)
                        TextButton({ entryId = null; fromReservation = true; model.clearForm(); editor = true }) { Text("예약으로 지출 추가") }
                        if (budget.entries.any { it.reservationId == null }) TextButton({ choosingExisting = true; model.clearForm() }) { Text("기존 지출 연결") }
                    }
                } } }

                item { AiroCard {
                    val paid = budget.entries.filter { it.paid }.sumOf { it.won() }
                    val planned = budget.entries.filterNot { it.paid }.sumOf { it.won() }
                    Text("예상 총예산", color = Muted)
                    Text(wonLabel(paid + planned + budget.reserve.roundToLong()), style = MaterialTheme.typography.headlineLarge)
                    Text("결제 완료 ${wonLabel(paid)}\n예정 지출 ${wonLabel(planned)}", color = Muted, style = MaterialTheme.typography.bodyMedium)
                    TextButton(onClick = { reserveText = budget.reserve.toLong().toString(); model.clearForm(); reserveEditor = true }) { Text("예비비 ${wonLabel(budget.reserve.roundToLong())} · 수정") }
                } }
                if (state.conflict) item { ErrorNotice("다른 곳에서 예산이 바뀌었어요. 입력 내용은 유지됩니다. 최신 예산을 불러온 뒤 저장해 주세요.", model::refresh) }
                if (budget.entries.isEmpty()) item { AiroCard { Text("얼마나 쓸지, 한눈에", style = MaterialTheme.typography.titleLarge); Text("숙소와 항공권부터 커피 한 잔까지 기록하세요. 환율은 직접 정할 수 있어요.", color = Muted) } }
                items(budget.entries, key = { it.id }) { entry ->
                    Surface(onClick = { entryId = entry.id; fromReservation = false; model.clearForm(); editor = true }, color = Panel, shape = RoundedCornerShape(16.dp)) {
                        Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                Text(entry.name, style = MaterialTheme.typography.titleMedium)
                                Text("${expenseCategories[entry.category]} · ${if (entry.paid) "결제 완료" else "결제 예정"}${entry.day?.let { " · ${dayLabel(it)}" }.orEmpty()}", color = Muted, style = MaterialTheme.typography.bodySmall)
                                Text(wonLabel(entry.won()), color = AirBlue)
                                if (entry.currency != "KRW") Text("${entry.amount} ${entry.currency} · 환율 ${entry.exchangeRate}", color = Muted, style = MaterialTheme.typography.bodySmall)
                            }
                            Icon(Icons.Outlined.Edit, "${entry.name} 수정", tint = Muted)
                        }
                    }
                }
            }
        }
    }
    val seed = if (fromReservation) state.reservation?.let { Expense(it.id, it.name, "other", state.reservationDay, 0.0, "KRW", 1.0, it.paymentStatus == "paid", it.id) } else null
    if (editor && budget != null) ExpenseEditor(budget.entries.find { it.id == entryId } ?: seed, state, { editor = false }, model::refresh,
        { entry -> model.entry(entry) { editor = false } }, entryId?.let { id -> { model.remove(id) { editor = false } } }, newReservation = fromReservation)
    if (choosingExisting && budget != null) ModalBottomSheet(onDismissRequest = { if (!state.saving) choosingExisting = false }, containerColor = Panel) {
        LazyColumn(contentPadding = PaddingValues(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            item { Text("기존 지출 연결", style = MaterialTheme.typography.headlineSmall); ErrorNotice(state.formError, if (state.conflict) model::refresh else null) }
            items(budget.entries.filter { it.reservationId == null }, key = { it.id }) { entry -> OutlinedButton({ model.link(entry) { choosingExisting = false } }, Modifier.fillMaxWidth(), enabled = !state.saving && !state.loading && !state.conflict) {
                Text("${entry.name} · ${wonLabel(entry.won())}")
            } }
        }
    }
    if (reserveEditor) AlertDialog(onDismissRequest = { if (!state.saving) reserveEditor = false }, title = { Text("예비비") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedTextField(reserveText, { reserveText = it }, label = { Text("금액 (원)") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), enabled = !state.saving)
            ErrorNotice(state.formError, if (state.conflict) model::refresh else null)
        }
    }, confirmButton = { val number = reserveText.toDoubleOrNull(); TextButton(onClick = { model.reserve(number!!) { reserveEditor = false } }, enabled = !state.saving && !state.loading && !state.conflict && number != null && number.isFinite() && number in 0.0..1e12) { Text("저장") } }, dismissButton = { TextButton(onClick = { reserveEditor = false }, enabled = !state.saving) { Text("취소") } })
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable private fun ExpenseEditor(entry: Expense?, state: BudgetState, onDismiss: () -> Unit, reload: () -> Unit, save: (Expense) -> Unit, remove: (() -> Unit)?, newReservation: Boolean = false) {
    val id = rememberSaveable { entry?.id ?: UUID.randomUUID().toString() }
    var name by rememberSaveable { mutableStateOf(entry?.name.orEmpty()) }
    var category by rememberSaveable { mutableStateOf(entry?.category ?: "food") }
    var amount by rememberSaveable { mutableStateOf(if (newReservation) "" else entry?.amount?.toString().orEmpty()) }
    var currency by rememberSaveable { mutableStateOf(entry?.currency ?: "KRW") }
    var rate by rememberSaveable { mutableStateOf(entry?.exchangeRate?.toString() ?: "1") }
    var paid by rememberSaveable { mutableStateOf(entry?.paid ?: false) }
    var day by rememberSaveable { mutableStateOf(entry?.day) }
    var deleting by rememberSaveable { mutableStateOf(false) }
    val number = amount.toDoubleOrNull()
    val exchange = if (currency == "KRW") 1.0 else rate.toDoubleOrNull()
    val valid = name.isNotBlank() && name.length <= 200 && number != null && number.isFinite() && number >= 0 && exchange != null && exchange.isFinite() && exchange > 0 && exchange <= 1e6 && number * exchange <= 1e12
    ModalBottomSheet(onDismissRequest = { if (!state.saving) onDismiss() }, containerColor = Panel, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(24.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
            Text(if (entry == null || newReservation) "지출 추가" else "지출 수정", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(name, { if (it.length <= 200) name = it }, label = { Text("지출 이름") }, singleLine = true, modifier = Modifier.fillMaxWidth(), enabled = !state.saving)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { items(expenseCategories.toList()) { (key, label) -> FilterChip(category == key, { category = key }, label = { Text(label) }, enabled = !state.saving) } }
            OutlinedTextField(amount, { amount = it }, label = { Text("금액") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(), enabled = !state.saving)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) { items(expenseCurrencies) { code -> FilterChip(currency == code, { currency = code }, label = { Text(code) }, enabled = !state.saving) } }
            if (currency != "KRW") OutlinedTextField(rate, { rate = it }, label = { Text("1 $currency 당 원화 환율") }, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal), modifier = Modifier.fillMaxWidth(), enabled = !state.saving)
            Row(verticalAlignment = Alignment.CenterVertically) { Checkbox(paid, { paid = it }, enabled = !state.saving); Text("이미 결제했어요") }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(day != null, { day = if (it) 1 else null }, enabled = !state.saving)
                Text("방문일 지정", Modifier.weight(1f))
                if (day != null) { TextButton({ day = (day!! - 1).coerceAtLeast(0) }, enabled = !state.saving) { Text("−") }; Text(dayLabel(day!!)); TextButton({ day = (day!! + 1).coerceAtMost(3650) }, enabled = !state.saving) { Text("+") } }
            }
            ErrorNotice(state.formError, if (state.conflict) reload else null)
            PrimaryButton("지출 저장", { save(Expense(id, name.trim(), category, day, number!!, currency, exchange!!, paid, entry?.reservationId)) }, busy = state.saving || state.loading, enabled = valid && !state.conflict)
            if (remove != null) TextButton({ deleting = true }, enabled = !state.saving && !state.loading && !state.conflict, modifier = Modifier.fillMaxWidth()) { Text("지출 삭제", color = MaterialTheme.colorScheme.error) }
        }
    }
    if (deleting) AlertDialog(onDismissRequest = { deleting = false }, title = { Text("지출을 삭제할까요?") }, text = { Text(name) }, confirmButton = { TextButton({ deleting = false; remove?.invoke() }) { Text("삭제") } }, dismissButton = { TextButton({ deleting = false }) { Text("취소") } })
}
