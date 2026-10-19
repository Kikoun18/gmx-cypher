// The design contract's machine-checkable parts (docs/design-contract.md, R1): the tests, the shortcut sheet and the
// page read them from here, and the contract quotes this module.

/** An internal reference the page never shows (R3a): a ticket, a question or a request, such as "(T35)", "(question 28)" or "(R9c)". */
export const INTERNAL_REFERENCE = /\((?:questions? \d+|T\d+|R\d+[a-z]?)\b[^)]*\)|\bquestions? \d+\b/
