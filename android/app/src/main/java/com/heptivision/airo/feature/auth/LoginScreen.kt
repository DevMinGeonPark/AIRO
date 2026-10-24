package com.heptivision.airo.feature.auth

import android.util.Patterns
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.outlined.ArrowBack
import androidx.compose.material.icons.outlined.CheckCircle
import androidx.compose.material.icons.outlined.MailOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.heptivision.airo.BuildConfig
import com.heptivision.airo.core.design.*
import com.heptivision.airo.data.auth.serverOrigin
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun LoginScreen(model: AuthViewModel, onServerChange: (String) -> Unit, onBack: () -> Unit) {
    val state by model.state.collectAsStateWithLifecycle()
    var email by rememberSaveable { mutableStateOf("") }
    var seconds by remember { mutableIntStateOf(0) }
    var password by remember { mutableStateOf("") }
    var serverDialog by rememberSaveable { mutableStateOf(false) }
    var server by rememberSaveable { mutableStateOf(model.repository.server) }
    var serverError by remember { mutableStateOf<String?>(null) }
    LaunchedEffect(model) { model.configure() }
    val focus = LocalFocusManager.current
    LaunchedEffect(state.retryAt) {
        do { seconds = ((state.retryAt - System.currentTimeMillis()) / 1000).toInt().coerceAtLeast(0); if (seconds > 0) delay(1000) } while (seconds > 0)
    }
    val valid = email.trim().length <= 254 && Patterns.EMAIL_ADDRESS.matcher(email.trim()).matches()
    fun send() { if (valid && !state.busy && seconds == 0) { focus.clearFocus(); model.email(email) } }
    fun login() { if (password.isNotEmpty() && !state.busy) { focus.clearFocus(); model.password(password) } }
    Scaffold(topBar = { TopAppBar(title = {}, navigationIcon = { IconButton(onBack) { Icon(Icons.AutoMirrored.Outlined.ArrowBack, "뒤로") } }, colors = TopAppBarDefaults.topAppBarColors(containerColor = Ink)) }, containerColor = Ink) { padding ->
        Column(Modifier.fillMaxSize().padding(padding).imePadding().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp).widthIn(max = 480.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
            Spacer(Modifier.height(12.dp))
            AiroLogo()
            Text("다음 여행을\n이어가 볼까요?", style = MaterialTheme.typography.headlineLarge)
            Text("웹에서 준비하던 여행 그대로,\n이제 손안에서 가볍게.", color = Muted, style = MaterialTheme.typography.bodyLarge)
            Spacer(Modifier.height(12.dp))
            if (BuildConfig.DEMO) {
                AiroCard {
                    Text("디자인 미리보기", style = MaterialTheme.typography.titleMedium)
                    Text("샘플 로마 여행으로 앱을 둘러보세요. 변경 사항은 이 기기의 데모에만 저장됩니다.", color = Muted, style = MaterialTheme.typography.bodyMedium)
                }
                PrimaryButton("샘플 여행 둘러보기", model::demo, busy = state.busy)
            } else if (state.edition == "community") {
                Text("내 서버에 로그인", style = MaterialTheme.typography.titleLarge)
                OutlinedTextField(password, { if (it.length <= 256) password = it }, label = { Text("서버 비밀번호") }, singleLine = true,
                    visualTransformation = PasswordVisualTransformation(), keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { login() }), modifier = Modifier.fillMaxWidth(), enabled = !state.busy)
                PrimaryButton("내 서버에 로그인", { login() }, busy = state.busy, enabled = password.isNotEmpty())
            } else if (state.edition == "cloud") {
                OutlinedButton(model::google, enabled = !state.busy, shape = RoundedCornerShape(16.dp), border = BorderStroke(1.dp, Hairline), modifier = Modifier.fillMaxWidth().heightIn(min = 56.dp)) {
                    Text("G", style = MaterialTheme.typography.titleLarge, color = Ivory)
                    Spacer(Modifier.width(14.dp)); Text("Google로 계속하기", color = Ivory)
                }
                Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(14.dp)) {
                    HorizontalDivider(Modifier.weight(1f)); Text("또는 이메일로", color = Muted, style = MaterialTheme.typography.labelSmall); HorizontalDivider(Modifier.weight(1f))
                }
                OutlinedTextField(email, { email = it; model.clearError() }, label = { Text("이메일 주소") }, placeholder = { Text("you@example.com") },
                    modifier = Modifier.fillMaxWidth(), singleLine = true, shape = RoundedCornerShape(14.dp), enabled = !state.busy,
                    leadingIcon = { Icon(Icons.Outlined.MailOutline, null, Modifier.size(20.dp)) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Done), keyboardActions = KeyboardActions(onDone = { send() }))
                PrimaryButton(if (seconds > 0) "${seconds}초 후 다시 보내기" else "이메일로 로그인 링크 받기", { send() }, busy = state.busy, enabled = valid && seconds == 0)
                if (state.emailSent) AiroCard {
                    Icon(Icons.Outlined.CheckCircle, null, tint = AirBlue)
                    Text("메일함을 확인해 주세요", style = MaterialTheme.typography.titleMedium)
                    Text("이 휴대폰에서 이메일 링크를 열면 앱으로 돌아옵니다. 메일이 없다면 스팸함도 확인해 주세요.", color = Muted, style = MaterialTheme.typography.bodyMedium)
                }
            }
            if (!BuildConfig.DEMO && state.edition == null && state.busy) CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp)
            ErrorNotice(state.error, if (state.edition == null && !BuildConfig.DEMO) model::configure else null)
            Text("로그인하면 내 계정의 여행을 불러옵니다.", color = Muted, style = MaterialTheme.typography.bodySmall)
            if (!BuildConfig.DEMO) TextButton({ serverDialog = true }, enabled = !state.busy) { Text("서버 변경 · ${model.repository.server}", style = MaterialTheme.typography.labelSmall) }
            Spacer(Modifier.height(28.dp))
        }
    }
    if (serverDialog) AlertDialog(onDismissRequest = { serverDialog = false }, title = { Text("연결할 서버") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("기본 AIRO 또는 직접 운영하는 Community 서버의 HTTPS 주소를 입력하세요.", color = Muted)
            OutlinedTextField(server, { server = it; serverError = null }, label = { Text("서버 주소") }, singleLine = true, keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri))
            ErrorNotice(serverError)
        }
    }, confirmButton = { TextButton({
        try { val normalized = serverOrigin(server, BuildConfig.DEBUG); serverDialog = false; onServerChange(normalized) }
        catch (error: Exception) { serverError = error.message ?: "서버 주소를 확인해 주세요." }
    }) { Text("연결") } }, dismissButton = { TextButton({ serverDialog = false }) { Text("취소") } })
}
