package com.heptivision.airo

import android.content.ContentValues
import android.content.Context
import android.content.Intent
import android.graphics.Paint
import android.graphics.pdf.PdfDocument
import android.provider.MediaStore
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import com.heptivision.airo.core.model.*
import kotlinx.coroutines.runBlocking
import org.junit.Assert.*
import org.junit.Test
import org.junit.Rule
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain

/** Exercises actual DocumentsUI, Android PDF rendering and app navigation with synthetic data only. */
class ResourceJourneyTest {
    private val compose = createAndroidComposeRule<MainActivity>()
    @get:Rule val rules: RuleChain = RuleChain.outerRule(object : ExternalResource() {
        override fun before() {
            check(BuildConfig.DEMO)
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            runBlocking { (context.applicationContext as AiroApplication).container.auth.signOut() }
            context.getSharedPreferences("airo_secure", Context.MODE_PRIVATE).edit().clear().commit()
            (context.applicationContext as AiroApplication).selectServer(BuildConfig.API_BASE_URL)
        }
    }).around(compose)
    private fun waitText(text: String) {
        compose.waitUntil(15_000) { compose.onAllNodesWithText(text, substring = true).fetchSemanticsNodes().isNotEmpty() }
    }
    private fun screenshot(name: String) {
        compose.waitForIdle()
        Thread.sleep(700) // Android window transitions run outside the Compose test clock.
        val context = compose.activity
        val config = context.resources.configuration
        val values = ContentValues().apply {
            put(MediaStore.Downloads.DISPLAY_NAME, "$name.png"); put(MediaStore.Downloads.MIME_TYPE, "image/png")
            put(MediaStore.Downloads.RELATIVE_PATH, "Download/airo-uiux/${config.screenWidthDp}dp-${config.fontScale}"); put(MediaStore.Downloads.IS_PENDING, 1)
        }
        val uri = requireNotNull(context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
        val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
        context.contentResolver.openOutputStream(uri)!!.use { bitmap.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }; bitmap.recycle()
        context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
    }
    private fun resourceClick(text: String) { compose.onNodeWithTag("resource-list").performScrollToNode(hasText(text)); compose.onNodeWithText(text).performClick() }
    private fun controls() {
        if (compose.onAllNodesWithContentDescription("조작부 표시").fetchSemanticsNodes().isNotEmpty())
            compose.onNodeWithContentDescription("조작부 표시").performClick()
    }
    private fun enter() {
        compose.onNodeWithText("내 여행 시작하기").performScrollTo().performClick()
        compose.onNodeWithText("샘플 여행 둘러보기").performScrollTo().performClick()
        waitText("로마, 느리게 걷는 3일")
        compose.onNodeWithText("로마, 느리게 걷는 3일").performClick()
        waitText("Day 1")
        compose.waitUntil(20_000) {
            val bitmap = InstrumentationRegistry.getInstrumentation().uiAutomation.takeScreenshot()
            var roads = 0
            for (y in bitmap.height / 3 until bitmap.height * 2 / 3 step 3) for (x in bitmap.width / 5 until bitmap.width * 4 / 5 step 3) {
                val color = bitmap.getPixel(x, y)
                if (android.graphics.Color.red(color) in 56..66 && android.graphics.Color.green(color) in 62..72 && android.graphics.Color.blue(color) in 73..83) roads++
            }
            bitmap.recycle(); roads > 50
        }
        screenshot("map")
    }
    @Test fun pdfPickerPreviewRecreationLinkReservationAndBudgetDoNotDuplicate() {
        enter()
        compose.onNodeWithContentDescription("다음 날짜").performClick()
        waitText("Day 2")
        compose.activityRule.scenario.recreate()
        waitText("Day 2")
        controls()
        compose.onNodeWithText("여행 자료").performClick()
        waitText("PDF 추가")
        val context = compose.activity
        val filename = "airo-render-${System.currentTimeMillis()}.pdf"
        val values = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, filename); put(MediaStore.Downloads.MIME_TYPE, "application/pdf"); put(MediaStore.Downloads.IS_PENDING, 1) }
        val uri = requireNotNull(context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
        try {
            val pdf = PdfDocument()
            try {
                for (n in 1..2) { val page = pdf.startPage(PdfDocument.PageInfo.Builder(400, 600, n).create()); page.canvas.drawText("Synthetic boarding pass $n", 30f, 100f, Paint().apply { textSize = 20f }); pdf.finishPage(page) }
                context.contentResolver.openOutputStream(uri)!!.use(pdf::writeTo)
            } finally { pdf.close() }
            context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            resourceClick("PDF 추가")
            val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
            requireNotNull(device.wait(Until.findObject(By.text(filename)), 15_000)).click()
            waitText("PDF 연결")
            compose.onNodeWithText("원본 미리보기").performClick()
            waitText("1 / 2")
            compose.onNodeWithContentDescription("다음 페이지").performClick()
            waitText("2 / 2")
            compose.onNodeWithContentDescription("확대").performClick()
            compose.activityRule.scenario.recreate()
            waitText("2 / 2")
            screenshot("pdf-page-2")
            compose.onNodeWithContentDescription("PDF 닫기").performClick()
            compose.onNodeWithText("장소 또는 일차 검색").performScrollTo().performTextInput("트레비")
            compose.onNodeWithContentDescription("연결: 트레비 분수").performScrollTo().performClick()
            compose.onNodeWithText("PDF 저장").performScrollTo().performClick()
            waitText("PDF를 저장했어요.")
            compose.onNodeWithTag("resource-list").performScrollToNode(hasText("PDF 열기"))
            screenshot("documents")
            resourceClick("PDF 열기")
            waitText("1 / 2")
            compose.onNodeWithContentDescription("PDF 닫기").performClick()
            compose.onNodeWithText("예약", substring = false).performClick()
            resourceClick("예약 추가")
            compose.onNodeWithText("예약 이름").performTextInput("분수 티켓")
            compose.onNodeWithText("예약 페이지 (HTTPS)").performScrollTo().performTextInput("https://example.test/ticket")
            compose.onNodeWithText("예약 확정").performScrollTo().performClick()
            compose.onNodeWithText("예약 확정").assertIsSelected()
            compose.onNodeWithText("PDF 선택: $filename", substring = false).assertDoesNotExist()
            compose.onNodeWithContentDescription("PDF 선택: $filename").performScrollTo().performClick()
            compose.onNodeWithText("장소 또는 일차 검색").performScrollTo().performTextInput("트레비")
            compose.onNodeWithContentDescription("연결: 트레비 분수").performScrollTo().performClick()
            compose.onNodeWithText("예약 저장").performScrollTo().performClick()
            waitText("예약을 저장했어요.")
            screenshot("reservation")
            resourceClick("예산 연결")
            waitText("예약으로 지출 추가")
            compose.onNodeWithText("예약으로 지출 추가").performScrollTo().performClick()
            compose.onNodeWithText("금액").performScrollTo().performTextInput("15000")
            compose.onNodeWithText("지출 저장").performScrollTo().performClick()
            waitText("연결된 지출 · 분수 티켓")
            screenshot("budget-link")
            compose.onNodeWithContentDescription("일정으로").performClick()
            resourceClick("예산 연결")
            waitText("연결된 지출 수정")
            assertTrue(compose.onAllNodesWithText("예약으로 지출 추가").fetchSemanticsNodes().isEmpty())
            val repository = (compose.activity.application as AiroApplication).container.trips
            runBlocking {
                val resources = repository.resources("demo-rome")
                assertEquals(1, resources.documents.size)
                assertEquals(1, resources.reservations.entries.size)
                assertEquals("confirmed", resources.reservations.entries.single().bookingStatus)
                assertEquals(listOf("trevi"), resources.documents.single().stopIds)
                val budget = repository.budget("demo-rome")
                assertEquals(1, budget.entries.size)
                assertEquals(resources.reservations.entries.single().id, budget.entries.single().reservationId)
                val exported = readArchive(repository.exportArchive("demo-rome"))
                assertEquals(resources.documents.single().sha256, exported.documents().single().sha256)
                assertEquals("trevi", exported.documents().single().stopIds.single())
            }
        } finally { context.contentResolver.delete(uri, null, null) }
    }
    @Test fun sharedPdfChoosesTripAndKeepsOriginalInPreview() {
        enter()
        val context = compose.activity
        val values = ContentValues().apply { put(MediaStore.Downloads.DISPLAY_NAME, "airo-shared-${System.currentTimeMillis()}.pdf"); put(MediaStore.Downloads.MIME_TYPE, "application/pdf"); put(MediaStore.Downloads.IS_PENDING, 1) }
        val uri = requireNotNull(context.contentResolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values))
        try {
            val pdf = PdfDocument()
            try {
                val page = pdf.startPage(PdfDocument.PageInfo.Builder(400, 600, 1).create())
                page.canvas.drawText("Shared synthetic PDF", 30f, 80f, Paint().apply { textSize = 18f }); pdf.finishPage(page)
                context.contentResolver.openOutputStream(uri)!!.use(pdf::writeTo)
            } finally { pdf.close() }
            context.contentResolver.update(uri, ContentValues().apply { put(MediaStore.Downloads.IS_PENDING, 0) }, null, null)
            compose.activity.startActivity(Intent(compose.activity, MainActivity::class.java).apply {
                action = Intent.ACTION_SEND; type = "application/pdf"; putExtra(Intent.EXTRA_STREAM, uri)
                clipData = android.content.ClipData.newRawUri("Shared PDF", uri)
                flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_GRANT_READ_URI_PERMISSION
            })
            waitText("자료를 보관할 여행")
            compose.onAllNodesWithText("로마, 느리게 걷는 3일").onLast().performClick()
            waitText("PDF 연결")
            compose.activityRule.scenario.recreate()
            compose.onNodeWithText("원본 미리보기").performClick()
            waitText("1 / 1")
            compose.onNodeWithContentDescription("PDF 닫기").performClick()
            compose.onNodeWithText("PDF 저장").performScrollTo().performClick()
            waitText("PDF를 저장했어요.")
            runBlocking {
                val resources = (compose.activity.application as AiroApplication).container.trips.resources("demo-rome")
                assertEquals(1, resources.documents.size)
                assertTrue(resources.documents.single().stopIds.isEmpty())
            }
            assertTrue(context.cacheDir.resolve("incoming").listFiles().orEmpty().isEmpty())
        } finally { context.contentResolver.delete(uri, null, null) }
    }
    @Test fun mapControlsAndCardSwipeKeepMapSizeAndSelection() {
        enter()
        val mapBefore = compose.onNodeWithTag("native-map").fetchSemanticsNode().boundsInRoot
        compose.onNodeWithTag("day-card").performTouchInput { swipeLeft() }
        waitText("Day 2")
        controls()
        compose.onNodeWithContentDescription("여행 메뉴").performClick()
        compose.onNodeWithText("조작부 숨기기").performClick()
        compose.onNodeWithContentDescription("조작부 표시").assertIsDisplayed()
        assertEquals(mapBefore, compose.onNodeWithTag("native-map").fetchSemanticsNode().boundsInRoot)
        compose.onNodeWithTag("native-map").performTouchInput { swipeRight() }
        compose.onNodeWithContentDescription("조작부 표시").performClick()
        waitText("Day 2")
        controls()
        compose.onNodeWithText("일정", substring = false).performClick()
        waitText("트레비 분수")
        compose.onNodeWithContentDescription("일정 닫기").performClick()
        assertEquals(mapBefore, compose.onNodeWithTag("native-map").fetchSemanticsNode().boundsInRoot)
    }
    @Test fun sharedBookingLinkContinuesAfterLoginAndDraftSurvivesRecreation() {
        compose.activity.startActivity(Intent(compose.activity, MainActivity::class.java).apply {
            action = Intent.ACTION_SEND; type = "text/plain"; putExtra(Intent.EXTRA_TEXT, "Booking https://example.test/reservation/123"); flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        })
        waitText("로그인하고 자료 추가")
        compose.onNodeWithText("로그인", substring = false).performClick()
        compose.onNodeWithText("샘플 여행 둘러보기").performScrollTo().performClick()
        waitText("자료를 보관할 여행")
        compose.onAllNodesWithText("로마, 느리게 걷는 3일").onLast().performClick()
        waitText("예약 이름")
        compose.onNodeWithText("예약 이름").performTextInput("공유한 숙소")
        compose.activityRule.scenario.recreate()
        waitText("공유한 숙소")
        compose.onNodeWithText("https://example.test/reservation/123").assertExists()
        compose.onNodeWithText("예약 저장").performScrollTo().performClick()
        waitText("예약을 저장했어요.")
        val repository = (compose.activity.application as AiroApplication).container.trips
        runBlocking { assertEquals("https://example.test/reservation/123", repository.resources("demo-rome").reservations.entries.single().bookingUrl) }
        compose.onNodeWithContentDescription("일정으로").performClick()
        waitText("내 정보")
        compose.onNodeWithText("내 정보").performClick()
        compose.onNodeWithText("로그아웃").performScrollTo().performClick()
        compose.onAllNodesWithText("로그아웃").onLast().performClick()
        waitText("내 여행 시작하기")
        compose.waitUntil(5000) { compose.activity.cacheDir.resolve("documents").listFiles().orEmpty().isEmpty() }
        assertTrue(compose.activity.cacheDir.resolve("incoming").listFiles().orEmpty().isEmpty())
    }
}
