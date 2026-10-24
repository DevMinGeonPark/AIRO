export type NotePin = { label: string; value: string };

/** Only promote explicitly labelled codes. Keep the original note as the source of truth. */
export function notePins(note: string): NotePin[] {
  const pattern = /(\bPIN\b(?:\s*(?:code|코드|번호))?|출입\s*(?:코드|번호|비밀번호)|도어\s*(?:코드|비밀번호)|현관\s*(?:코드|비밀번호)|비밀번호|door\s*code|access\s*code)\s*[:：=\-]?\s*([A-Z0-9*#-]{3,24})(?![A-Z0-9*#-])/gi;
  const result: NotePin[] = [];
  for (const match of note.matchAll(pattern)) {
    const value = match[2];
    if (!/\d/.test(value)) continue;
    const label = match[1].trim();
    if (!result.some(pin => pin.label.toLowerCase() === label.toLowerCase() && pin.value === value)) result.push({ label, value });
  }
  return result;
}

export const notePreview = (note: string) => note.split(/\r?\n/).map(line => line.trim()).filter(Boolean).slice(0, 3);
