package com.heptivision.airo.core.model

data class NotePin(val label: String, val value: String)

/** Promote explicit labels only; never infer a PIN from an address, date or reservation number. */
fun notePins(note: String): List<NotePin> {
    val pattern = Regex("""(\bPIN\b(?:\s*(?:code|코드|번호))?|출입\s*(?:코드|번호|비밀번호)|도어\s*(?:코드|비밀번호)|현관\s*(?:코드|비밀번호)|비밀번호|door\s*code|access\s*code)\s*[:：=\-]?\s*([A-Z0-9*#-]{3,24})(?![A-Z0-9*#-])""", RegexOption.IGNORE_CASE)
    return pattern.findAll(note).map { NotePin(it.groupValues[1].trim(), it.groupValues[2]) }
        .filter { pin -> pin.value.any { it in '0'..'9' } }.distinctBy { it.label.lowercase() to it.value }.toList()
}

fun notePreview(note: String) = note.lineSequence().map { it.trim() }.filter { it.isNotEmpty() }.take(3).toList()
