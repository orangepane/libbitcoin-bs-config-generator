/** "1 warning", "2 warnings". One rule, so counts never disagree across the page. */
export function plural (n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}
