export function createQualityAlertsDomain({ query }) {
  if (typeof query !== 'function') throw new Error('createQualityAlertsDomain requires query');

  async function getQualityAlerts(clientKey, options = {}) {
    const { resolved = false, limit = 50 } = options;

    const { rows } = await query(
      `
      SELECT * FROM quality_alerts
      WHERE client_key = $1
        AND resolved = $2
      ORDER BY created_at DESC
      LIMIT $3
    `,
      [clientKey, resolved, limit]
    );

    return rows || [];
  }

  async function resolveQualityAlert(alertId) {
    await query(
      `
      UPDATE quality_alerts
      SET resolved = TRUE, resolved_at = NOW()
      WHERE id = $1
    `,
      [alertId]
    );
  }

  async function storeQualityAlert({
    clientKey,
    alertType,
    severity,
    metric,
    actualValue,
    expectedValue,
    message,
    action,
    impact,
    metadata,
  }) {
    const metadataJson = metadata ? JSON.stringify(metadata) : null;

    await query(
      `
      INSERT INTO quality_alerts (
        client_key, alert_type, severity, metric, actual_value, expected_value,
        message, action, impact, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    `,
      [clientKey, alertType, severity, metric, actualValue, expectedValue, message, action, impact, metadataJson]
    );
  }

  return { getQualityAlerts, resolveQualityAlert, storeQualityAlert };
}

