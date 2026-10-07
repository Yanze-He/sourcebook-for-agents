const PICK_TITLE_UNITS = 30;

function titleUnit(character: string): number {
  return /\p{Script=Han}/u.test(character) ? 2 : 1;
}

export function truncatePickTitle(value: string, limit = PICK_TITLE_UNITS): string {
  const title = value.trim().replace(/\s+/g, " ");
  let units = 0;
  let output = "";

  for (const character of title) {
    const nextUnits = units + titleUnit(character);
    if (nextUnits > limit) return `${output}…`;
    output += character;
    units = nextUnits;
  }

  return output;
}
