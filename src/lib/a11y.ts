import type { KeyboardEvent } from 'react';

// For an element that already has an onClick and has been made focusable with tabIndex={0}: Enter (and Space) do what a
// click does, so it can be used without a mouse. It only acts when the key went to the element itself, so a button or a
// field inside it keeps its own keys.
export function clickOnEnterOrSpace(e: KeyboardEvent<HTMLElement>): void {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); // Space would otherwise scroll the page
    e.currentTarget.click();
  }
}

// Same, for something that behaves like a link: links activate on Enter only.
export function clickOnEnter(e: KeyboardEvent<HTMLElement>): void {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    e.currentTarget.click();
  }
}
