/**
 * ─────────────────────────────────────────────────────────
 *  DERIV PAYMENT AGENT DEPOSIT EMAIL EXTRACTOR
 * ─────────────────────────────────────────────────────────
 *
 *  Expected email (plain text), e.g.:
 *
 *    You have received 5.00 USD in your CR4190380 account at Deriv.
 *
 *    The transaction was completed by client_611bbf6cc, CR00117693.
 *
 *  Output fields used by deriv-server webhook:
 *    - account_number   → agent CR (must match AGENT_LOGINID)
 *    - sender_loginid   → payer CR (OAuth user's linked account)
 *    - amount           → USD credited, e.g. "5.00"
 *    - client_id        → Deriv client id, e.g. client_611bbf6cc
 */
const PATTERNS = {
  // "You have received 5.00 USD in your CR4190380 account"
  amount: /received\s+([\d,]+\.\d{2})\s*USD/i,
  // Agent account that received the funds
  account_number:
    /(?:received\s+[\d,]+\.\d{2}\s*USD\s+in\s+your|in\s+your)\s+(CR\d+)\s+account/i,
  // "completed by client_611bbf6cc"
  client_id: /(?:completed\s+by|transaction\s+was\s+completed\s+by)\s+(client_[a-z0-9]+)/i,
  // "completed by client_611bbf6cc, CR00117693"
  sender_loginid:
    /(?:completed\s+by|transaction\s+was\s+completed\s+by)\s+client_[a-z0-9]+\s*,\s*(CR\d+)/i,
  // Optional — store client id here too if your pipeline expects reference_number
  reference_number:
    /(?:completed\s+by|transaction\s+was\s+completed\s+by)\s+(client_[a-z0-9]+)/i,
  // Optional extras (usually null for Deriv deposit emails)
  customer_name: null,
  date: null,
  status: null,
  phone: null,
  email: null,
};

/**
 * @param {string} body
 * @param {string} [subject]
 * @returns {Record<string, string|null|string[]>}
 */
export function extractData(body, subject = "") {
  const text = `Subject: ${subject}\n\n${body}`;
  const result = {};

  for (const [field, pattern] of Object.entries(PATTERNS)) {
    if (!pattern) {
      result[field] = null;
      continue;
    }
    const match = text.match(pattern);
    result[field] = match ? match[1].trim() : null;
  }

  // Normalize Deriv loginids
  if (result.account_number) {
    result.account_number = result.account_number.toUpperCase();
  }
  if (result.sender_loginid) {
    result.sender_loginid = result.sender_loginid.toUpperCase();
  }
  if (result.client_id) {
    result.client_id = result.client_id.toLowerCase();
  }

  // Fallback: last CR in body that is not the agent account
  if (!result.sender_loginid) {
    const allCrs = [...text.toUpperCase().matchAll(/\b(CR\d{1,10})\b/g)].map(
      (m) => m[1]
    );
    const agent = result.account_number?.toUpperCase();
    const payer = allCrs.filter((cr) => cr !== agent).pop();
    if (payer) result.sender_loginid = payer;
  }

  // Normalize amount to 2 decimal places
  if (result.amount) {
    const n = Number(result.amount.replace(/,/g, ""));
    result.amount = Number.isFinite(n) ? n.toFixed(2) : result.amount;
  }

  result._matched_fields = Object.entries(result)
    .filter(([k, v]) => v !== null && !k.startsWith("_"))
    .map(([k]) => k);

  return result;
}
