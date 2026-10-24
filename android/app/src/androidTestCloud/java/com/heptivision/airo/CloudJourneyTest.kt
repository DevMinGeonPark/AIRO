package com.heptivision.airo

import android.content.Intent
import android.net.Uri
import android.graphics.pdf.PdfDocument
import android.graphics.Paint
import com.heptivision.airo.core.model.*
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import com.heptivision.airo.core.network.HttpTransport
import com.heptivision.airo.core.network.wireJson
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.*
import org.junit.Assume.assumeTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain

/** Runs only with scripts/test-mobile-api.mjs --native-ui and its disposable DB/Auth. */
class CloudJourneyTest {
    private val arguments = InstrumentationRegistry.getArguments()
    private val edition = arguments.getString("fixtureEdition")
    private val compose = createAndroidComposeRule<MainActivity>()
    @get:Rule val rules: RuleChain = RuleChain.outerRule(object : ExternalResource() {
        override fun before() {
            assumeTrue(arguments.getString("fixtureBase") == "http://127.0.0.1:3156")
            check(!BuildConfig.DEMO)
            val application = InstrumentationRegistry.getInstrumentation().targetContext.applicationContext as AiroApplication
            // A fresh test installation has no session; never sign out a real account.
            check(application.container.auth.session.value == null)
            application.selectServer("http://127.0.0.1:3156")
        }
    }).around(compose)
    private fun waitText(text: String) {
        compose.mainClock.advanceTimeBy(500)
        try { compose.waitUntil(20_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() } }
        catch (failure: Throwable) { throw AssertionError("Missing $text\n${compose.onRoot().printToString()}", failure) }
    }
    private fun trips() {
        compose.waitUntil(20_000) { compose.onAllNodesWithContentDescription("새 여행").fetchSemanticsNodes().isNotEmpty() }
    }
    @Test fun nativeLoginCreateRenameRestoreDeleteAndLogout() {
        compose.onNodeWithText("내 여행 시작하기").performScrollTo().performClick()
        if (edition == "community") {
            waitText("서버 비밀번호")
            compose.onNodeWithText("서버 비밀번호").performScrollTo().performTextInput("native-fixture-password")
            compose.onNodeWithText("서버 비밀번호").performImeAction()
        } else {
            waitText("이메일 주소")
            compose.onNodeWithText("이메일 주소").performScrollTo().performTextInput("native-ui@example.test")
            compose.onNodeWithText("이메일로 로그인 링크 받기").assertIsEnabled()
            compose.onNodeWithText("이메일 주소").performImeAction()
            waitText("메일함을 확인해 주세요")
            val callback = runBlocking {
                wireJson.parseToJsonElement(HttpTransport().request("http://127.0.0.1:3154/__fixture/callback"))
                    .jsonObject.getValue("callback").jsonPrimitive.content
            }
            // Recreate before opening the link: the PKCE verifier must survive.
            compose.activityRule.scenario.recreate()
            compose.activity.startActivity(Intent(compose.activity, MainActivity::class.java).apply {
                action = Intent.ACTION_VIEW; data = Uri.parse(callback)
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            })
        }
        trips()
        compose.onNodeWithContentDescription("새 여행").performClick()
        compose.onNodeWithText("여행 이름").performTextInput("Native $edition journey")
        compose.onNodeWithText("여행 만들기").performScrollTo().performClick()
        waitText("Native $edition journey")
        compose.onNodeWithContentDescription("여행 메뉴").performClick()
        compose.onNodeWithText("여행 정보 수정").performClick()
        compose.onNodeWithText("여행 이름").performTextReplacement("Native $edition saved")
        compose.onNodeWithText("변경 사항 저장").performScrollTo().performClick()
        waitText("Native $edition saved")
        compose.activityRule.scenario.recreate()
        waitText("Native $edition saved")
        val application = compose.activity.application as AiroApplication
        val persisted = runBlocking { application.container.trips.list() }
        assertTrue(persisted.trips.any { it.trip.title == "Native $edition saved" })
        if (edition != "community") {
            val repository = application.container.trips
            val tripId = persisted.trips.first { it.trip.title == "Native $edition saved" }.trip.id
            val pdf = PdfDocument()
            val bytes = try {
                val page = pdf.startPage(PdfDocument.PageInfo.Builder(400, 600, 1).create())
                page.canvas.drawText("Synthetic API PDF", 30f, 80f, Paint().apply { textSize = 20f }); pdf.finishPage(page)
                java.io.ByteArrayOutputStream().also(pdf::writeTo).toByteArray()
            } finally { pdf.close() }
            runBlocking {
                repository.saveStop(tripId, null, StopInput("Fixture airport", 12.48, 41.9, 1))
                val stopId = repository.detail(tripId).stops.single().id
                repository.attachDocument(tripId, DocumentInput("Cloud pass.pdf", java.util.Base64.getEncoder().encodeToString(bytes), listOf(stopId)))
            }
            compose.onNodeWithText("여행 자료").performClick()
            waitText("Cloud pass.pdf")
            compose.onNodeWithTag("resource-list").performScrollToNode(hasText("PDF 열기"))
            compose.onNodeWithText("PDF 열기").performClick()
            waitText("1 / 1")
            compose.onNodeWithContentDescription("PDF 닫기").performClick()
            compose.onNodeWithText("예약", substring = false).performClick()
            compose.onNodeWithText("예약 추가").performScrollTo().performClick()
            compose.onNodeWithText("예약 이름").performTextInput("Cloud ticket")
            compose.onNodeWithText("예약 페이지 (HTTPS)").performScrollTo().performTextInput("https://example.test/ticket")
            compose.onNodeWithContentDescription("PDF 선택: Cloud pass.pdf").performScrollTo().performClick()
            compose.onNodeWithContentDescription("연결: Fixture airport").performScrollTo().performClick()
            compose.onNodeWithText("예약 저장").performScrollTo().performClick()
            waitText("예약을 저장했어요.")
            runBlocking { assertEquals("Cloud ticket", repository.resources(tripId).reservations.entries.single().name) }
            compose.onNodeWithContentDescription("일정으로").performClick()
            compose.onNodeWithContentDescription("여행 메뉴").performClick()
            compose.onNodeWithText("변경 이력").performClick()
            waitText("예약")
            compose.onNodeWithText("예약", substring = false).performScrollTo().performClick()
            waitText("변경 내용")
            compose.onNodeWithText("이 변경 되돌리기").performScrollTo().performClick()
            compose.onNodeWithText("되돌리기", substring = false).performClick()
            waitText("선택한 변경을 되돌렸어요. 일정과 자료에서 결과를 확인하세요.")
            runBlocking { assertTrue(repository.resources(tripId).reservations.entries.isEmpty()); assertEquals(1, repository.resources(tripId).documents.size) }
            compose.onNodeWithContentDescription("일정으로").performClick()
        }
        compose.onNodeWithContentDescription("여행 메뉴").performClick()
        compose.onNodeWithText("여행 삭제").performClick()
        compose.onAllNodesWithText("여행 삭제").onLast().performClick()
        trips()
        compose.onNodeWithText("내 정보").performClick()
        compose.onNodeWithText("로그아웃").performScrollTo().performClick()
        compose.onAllNodesWithText("로그아웃").onLast().performClick()
        waitText("내 여행 시작하기")
        assertNull(application.container.auth.session.value)
    }
}
