/**
 * ─────────────────────────────────────────────────────────
 *  EMAIL DATA EXTRACTOR  —  edit the PATTERNS object below
 *  to match the structure of emails you receive.
 * ─────────────────────────────────────────────────────────
 *
 *  Each key in PATTERNS becomes a field in the extracted output.
 *  The regex must have one capture group ( ... ) for the value.
 *
 *  Examples of common patterns:
 *    amount:       /(?:amount|total)[:\s]+\$?([\d,]+\.?\d*)/i
 *    order_id:     /order\s*(?:id|#|number)[:\s]+([A-Z0-9-]+)/i
 *    reference:    /ref(?:erence)?[:\s]+([A-Z0-9]+)/i
 *    name:         /(?:customer|client|name)[:\s]+([A-Za-z ]+)/i
 *    date:         /date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
 *    phone:        /(?:phone|tel)[:\s]+([\+\d\s\-()]{7,15})/i
 */

const PATTERNS = {
  // ── Customize these to match your actual email content ──
  reference_number: /(?:ref(?:erence)?|id|#)[:\s]+([A-Z0-9\-]+)/i,
  amount:           /(?:amount|total|sum)[:\s]*\$?([\d,]+\.?\d{0,2})/i,
  customer_name:    /(?:customer|client|name)[:\s]+([A-Za-z][A-Za-z\s\-']{1,50})/i,
  date:             /(?:date|dated)[:\s]+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i,
  status:           /(?:status)[:\s]+([A-Za-z\s]+?)(?:\n|$)/i,
  phone:            /(?:phone|mobile|tel(?:ephone)?)[:\s]+([\+\d][\d\s\-()]{6,14})/i,
  email:            /(?:email|e-mail)[:\s]+([\w.+-]+@[\w-]+\.[a-z]{2,})/i,
  account_number:   /(?:account|acct)[:\s#]+([A-Z0-9\-]{4,20})/i,
  // Add as many fields as your emails contain
};

/**
 * Run all patterns against the email body + subject.
 * Returns an object with extracted values (null if not found).
 *
 * @param {string} body     - decoded plain-text email body
 * @param {string} subject  - email subject line
 * @returns {Record<string, string|null>}
 */
export function extractData(body, subject = "") {
  const text = `Subject: ${subject}\n\n${body}`;
  const result = {};

  for (const [field, pattern] of Object.entries(PATTERNS)) {
    const match = text.match(pattern);
    result[field] = match ? match[1].trim() : null;
  }

  // Attach a summary of non-null fields for quick inspection
  result._matched_fields = Object.entries(result)
    .filter(([k, v]) => v !== null && !k.startsWith("_"))
    .map(([k]) => k);

  return result;
}
