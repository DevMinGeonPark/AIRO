package com.heptivision.airo

import com.heptivision.airo.core.model.*
import org.junit.Assert.*
import org.junit.Test
import java.net.URI
import java.net.URLDecoder

class PlaceNoteTest {
    @Test fun codesKeepLeadingZerosAndKeypadSymbolsWithoutGuessingOtherNumbers() {
        assertEquals(listOf(NotePin("PIN", "0012#"), NotePin("출입 비밀번호", "*7890#"), NotePin("Door code", "AB-123")),
            notePins("체크인 15:00\n예약번호 12345678\nPIN: 0012#\n출입 비밀번호: *7890#\nDoor code = AB-123\nPIN: 0012#"))
        assertTrue(notePins("SPIN: 1234\n핀란드 1234\n객실 301\nPIN 미정\n2026-09-21").isEmpty())
        assertEquals("0123", notePins("긴 메모\n".repeat(100) + "숙소 PIN: 0123").single().value)
        assertEquals(listOf("체크인: 15:00", "짐 보관 가능", "PIN: 0001"), notePreview("\n 체크인: 15:00\r\n\n짐 보관 가능\nPIN: 0001\n마지막 메모"))
    }
    @Test fun googleDirectionsOnlyPassDestinationAndLetMapsResolveLiveOrigin() {
        val stop = Stop("a", "t", "호텔", 12.4, 41.9, 1, 0, mapQuery = "Hotel A&B #1")
        val url = URI(placeMapLinks(stop, false).last().second)
        val query = url.rawQuery.split('&').associate { it.substringBefore('=') to URLDecoder.decode(it.substringAfter('='), "UTF-8") }
        assertEquals(mapOf("api" to "1", "destination" to "Hotel A&B #1", "dir_action" to "navigate"), query)
        assertTrue(placeMapLinks(stop.copy(mapQuery = " "), false).last().second.contains("destination=41.9%2C12.4"))
        assertTrue(placeMapLinks(stop, true).last().second.startsWith("https://map.kakao.com/link/to/"))
    }
}
