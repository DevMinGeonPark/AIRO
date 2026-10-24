package com.heptivision.airo

import android.content.Context
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.platform.app.InstrumentationRegistry
import androidx.test.uiautomator.By
import androidx.test.uiautomator.UiDevice
import androidx.test.uiautomator.Until
import java.util.regex.Pattern
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.ExternalResource
import org.junit.rules.RuleChain
import kotlinx.coroutines.runBlocking

class DemoJourneyTest {
    private val compose = createAndroidComposeRule<MainActivity>()
    @get:Rule val rules: RuleChain = RuleChain.outerRule(object : ExternalResource() {
        override fun before() {
            check(BuildConfig.DEMO) { "This journey only runs against the isolated demo app." }
            val context = InstrumentationRegistry.getInstrumentation().targetContext
            runBlocking { (context.applicationContext as AiroApplication).container.auth.signOut() }
            context
                .getSharedPreferences("airo_secure", Context.MODE_PRIVATE).edit().clear().commit()
            (context.applicationContext as AiroApplication).selectServer(BuildConfig.API_BASE_URL)
        }
    }).around(compose)
    private fun waitText(text: String) {
        compose.mainClock.advanceTimeBy(500)
        try { compose.waitUntil(10_000) { compose.onAllNodesWithText(text).fetchSemanticsNodes().isNotEmpty() } }
        catch (failure: Throwable) { throw AssertionError("Missing $text\n${compose.onRoot().printToString()}", failure) }
    }
    private fun waitTrips() {
        compose.waitUntil(10_000) { compose.onAllNodesWithContentDescription("새 여행").fetchSemanticsNodes().isNotEmpty() }
    }
    private fun controls() {
        if (compose.onAllNodesWithContentDescription("조작부 표시").fetchSemanticsNodes().isNotEmpty())
            compose.onNodeWithContentDescription("조작부 표시").performClick()
    }
    private fun enter() {
        compose.onNodeWithText("내 여행 시작하기").performScrollTo().performClick()
        compose.onNodeWithText("샘플 여행 둘러보기").performScrollTo().performClick()
        waitText("로마, 느리게 걷는 3일")
        waitTrips()
    }
    @Test fun introductionPreviewChangesDayWithoutSigningIn() {
        compose.onNodeWithText("예시 여행 둘러보기").performScrollTo().performClick()
        waitText("로마의 오후")
        compose.onNodeWithText("분수와 광장").performClick()
        compose.onNodeWithText("09:00 · 트레비 분수").performScrollTo().assertIsDisplayed()
        val application = compose.activity.application as AiroApplication
        assertTrue(application.container.auth.session.value == null)
        compose.onAllNodesWithText("내 여행 시작하기").onLast().performScrollTo().performClick()
        waitText("샘플 여행 둘러보기")
    }
    @Test fun exportedFileCanBeSelectedAndImportedThroughAndroidDocuments() {
        enter()
        compose.onNodeWithText("로마, 느리게 걷는 3일").performClick()
        controls()
        compose.onNodeWithContentDescription("여행 메뉴").performClick()
        compose.onNodeWithText("여행 내보내기").performClick()
        compose.onNodeWithText("파일로 내보내기").performScrollTo().performClick()
        val device = UiDevice.getInstance(InstrumentationRegistry.getInstrumentation())
        val filename = "airo-ui-${System.currentTimeMillis()}.json"
        try {
            val field = requireNotNull(device.wait(Until.findObject(By.clazz("android.widget.EditText")), 10_000))
            field.text = filename
            requireNotNull(device.wait(Until.findObject(By.text(Pattern.compile("SAVE|저장", Pattern.CASE_INSENSITIVE))), 5000)).click()
            waitText("여행 파일을 저장했어요.")
            compose.onNodeWithContentDescription("뒤로").performClick()
            compose.onNodeWithContentDescription("내 여행으로").performClick()
            waitTrips()
            compose.onNodeWithContentDescription("여행 가져오기").performClick()
            compose.onNodeWithText("여행 파일 선택").performScrollTo().performClick()
            requireNotNull(device.wait(Until.findObject(By.text(filename)), 10_000)).click()
            waitText("이 여행 가져오기")
            compose.onNodeWithText("이 여행 가져오기").performScrollTo().performClick()
            waitText("여행을 가져왔어요.")
            compose.onNodeWithText("여행 열기").performScrollTo().performClick()
            waitText("Day 1")
            controls()
        compose.onNodeWithContentDescription("여행 메뉴").performClick()
            compose.onNodeWithText("여행 삭제").performClick()
            compose.onAllNodesWithText("여행 삭제").onLast().performClick()
            waitTrips()
        } finally { device.executeShellCommand("rm -f /sdcard/Download/$filename") }
    }
    @Test fun editStopSurvivesRecreationAndLogoutReturnsToWelcome() {
        enter()
        compose.onNodeWithText("로마, 느리게 걷는 3일").performClick()
        controls()
        compose.onNodeWithText("일정", substring = false).performClick()
        compose.onNodeWithTag("schedule-list").performScrollToNode(hasContentDescription("판테온 편집"))
        compose.onNodeWithContentDescription("판테온 편집").performClick()
        compose.onNodeWithText("장소 이름").performTextReplacement("판테온 · 오후 방문")
        compose.onNodeWithText("변경 사항 저장").performScrollTo().performClick()
        waitText("판테온 · 오후 방문")
        compose.activityRule.scenario.recreate()
        waitText("판테온 · 오후 방문")
        compose.onNodeWithContentDescription("일정 닫기").performClick()
        compose.onNodeWithContentDescription("내 여행으로").performClick()
        waitTrips()
        compose.onNodeWithText("내 정보").performClick()
        compose.onNodeWithText("로그아웃").performScrollTo().performClick()
        compose.onAllNodesWithText("로그아웃").onLast().performClick()
        waitText("내 여행 시작하기")
    }
    @Test fun createTripSearchPlaceSaveAndDeleteTrip() {
        enter()
        compose.onNodeWithContentDescription("새 여행").performClick()
        compose.onNodeWithText("여행 이름").performTextInput("기기 테스트 여행")
        compose.onNodeWithText("여행 만들기").performScrollTo().performClick()
        waitText("Day 1")
        controls()
        compose.onNodeWithText("장소 추가").performClick()
        compose.onNodeWithText("예: 로마 판테온").performTextInput("판테온")
        compose.onNodeWithContentDescription("장소 검색").performClick()
        waitText("판테온")
        compose.onNode(hasText("판테온") and !hasSetTextAction()).performClick()
        compose.onNodeWithText("일정에 추가").performScrollTo().performClick()
        waitText("일정 완료 0 / 1")
        controls()
        compose.onNodeWithContentDescription("여행 메뉴").performClick()
        compose.onNodeWithText("여행 예산").performClick()
        compose.waitUntil(10_000) { compose.onAllNodesWithContentDescription("지출 추가").fetchSemanticsNodes().isNotEmpty() }
        compose.onNodeWithContentDescription("지출 추가").performClick()
        compose.onNodeWithText("지출 이름").performTextInput("로마 커피")
        compose.onNodeWithText("금액").performTextInput("5000")
        compose.onNodeWithText("지출 저장").performScrollTo().performClick()
        waitText("로마 커피")
        compose.onNodeWithContentDescription("일정으로").performClick()
        controls()
        compose.onNodeWithText("여행 자료").performClick()
        compose.onNodeWithText("저장 장소").performClick()
        waitText("판테온")
        compose.onNodeWithContentDescription("판테온 즐겨찾기").performClick()
        compose.onNodeWithText("즐겨찾기만").performClick()
        waitText("판테온")
        compose.onNodeWithContentDescription("일정으로").performClick()
        controls()
        compose.onNodeWithContentDescription("여행 메뉴").performClick()
        compose.onNodeWithText("여행 삭제").performClick()
        compose.onAllNodesWithText("여행 삭제").onLast().performClick()
        waitTrips()
        assertTrue(compose.onAllNodesWithText("기기 테스트 여행").fetchSemanticsNodes().isEmpty())
    }
}
