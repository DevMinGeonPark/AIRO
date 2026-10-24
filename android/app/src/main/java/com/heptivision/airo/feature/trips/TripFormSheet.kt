package com.heptivision.airo.feature.trips

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.heptivision.airo.core.design.*
import com.heptivision.airo.core.model.Trip
import com.heptivision.airo.core.model.TripInput

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun TripFormSheet(trip: Trip? = null, saving: Boolean, error: String?, onDismiss: () -> Unit, onSave: (TripInput) -> Unit) {
    var title by rememberSaveable(trip?.id) { mutableStateOf(trip?.title.orEmpty()) }
    var date by rememberSaveable(trip?.id) { mutableStateOf(trip?.startDate) }
    ModalBottomSheet(onDismissRequest = { if (!saving) onDismiss() }, containerColor = Panel, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
        Column(Modifier.fillMaxWidth().imePadding().verticalScroll(rememberScrollState()).padding(start = 24.dp, end = 24.dp, bottom = 32.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Text(if (trip == null) "새로운 여행" else "여행 정보", style = MaterialTheme.typography.headlineSmall)
            Text("이름부터 정해볼까요? 나머지는 천천히 채워도 좋아요.", color = Muted, style = MaterialTheme.typography.bodyMedium)
            OutlinedTextField(title, { if (it.length <= 120) title = it }, label = { Text("여행 이름") }, placeholder = { Text("예: 로마, 느리게 걷는 3일") },
                modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(14.dp), enabled = !saving)
            DateField(date) { date = it }
            ErrorNotice(error)
            PrimaryButton(if (trip == null) "여행 만들기" else "변경 사항 저장", { onSave(TripInput(title.trim(), date)) }, busy = saving, enabled = title.isNotBlank())
        }
    }
}
