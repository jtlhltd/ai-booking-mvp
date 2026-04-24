/**
 * POST /webhooks/facebook-lead/:clientKey — Facebook Lead Ads → internal new-lead (extracted from server.js).
 */
export async function handleWebhooksFacebookLead(req, res, deps) {
  const { fetchImpl, getBaseUrl, nodeEnv } = deps || {};
  const fetchFn = fetchImpl || globalThis.fetch;
  const env = nodeEnv !== undefined ? nodeEnv : process.env.NODE_ENV;

  try {
    const { clientKey } = req.params;
    const facebookData = req.body;

    console.log('[FACEBOOK WEBHOOK] Received webhook for client:', clientKey);
    console.log('[FACEBOOK WEBHOOK] Raw payload:', JSON.stringify(facebookData, null, 2));

    const entry = facebookData.entry?.[0];
    const change = entry?.changes?.[0];
    const leadData = change?.value;

    if (!leadData) {
      console.error('[FACEBOOK WEBHOOK] Invalid format - missing lead data');
      return res.status(400).json({
        error: 'Invalid Facebook webhook format',
        received: Object.keys(facebookData),
      });
    }

    const fieldData = {};
    if (Array.isArray(leadData.field_data)) {
      leadData.field_data.forEach((field) => {
        const fieldName = field.name;
        const fieldValue = Array.isArray(field.values) ? field.values[0] : field.value || '';
        fieldData[fieldName] = fieldValue;
      });
    }

    const phone =
      fieldData.phone_number ||
      fieldData.phone ||
      fieldData.mobile_number ||
      fieldData.phoneNumber ||
      '';

    const name =
      fieldData.full_name ||
      fieldData.name ||
      fieldData.first_name ||
      `${fieldData.first_name || ''} ${fieldData.last_name || ''}`.trim() ||
      'Facebook Lead';

    const email = fieldData.email || fieldData.email_address || '';
    const service =
      fieldData.service || fieldData.service_type || fieldData.interested_service || 'Consultation';

    const pain =
      fieldData.pain ||
      fieldData.symptoms ||
      fieldData.pain_they_are_suffering_from ||
      fieldData.suffering_from ||
      fieldData.condition ||
      fieldData.problem ||
      fieldData.issue ||
      fieldData.what_pain ||
      fieldData.pain_description ||
      '';

    const notes = [
      pain ? `Pain/Symptoms: ${pain}` : '',
      fieldData.message || fieldData.notes || fieldData.additional_info || '',
      fieldData.question || fieldData.custom_question || '',
      `Facebook Form ID: ${leadData.form_id || 'unknown'}`,
      `Facebook Lead ID: ${leadData.leadgen_id || 'unknown'}`,
    ]
      .filter(Boolean)
      .join(' | ');

    if (!phone) {
      console.error('[FACEBOOK WEBHOOK] Missing phone number in lead data');
      return res.status(400).json({
        error: 'Missing phone number in Facebook lead data',
        availableFields: Object.keys(fieldData),
      });
    }

    const transformedPayload = {
      phone,
      name,
      service,
      source: 'Facebook Lead Ad',
      email,
      notes,
      callPurpose: 'lead_followup',
      intentHint: pain
        ? `Lead is suffering from: ${pain}. Focus on understanding their pain and offering appropriate solutions.`
        : 'Follow up on their inquiry and book an appointment.',
      pain,
    };

    console.log('[FACEBOOK WEBHOOK] Transformed payload:', transformedPayload);

    const baseUrl =
      typeof getBaseUrl === 'function'
        ? getBaseUrl()
        : process.env.PUBLIC_BASE_URL || process.env.BASE_URL || `http://localhost:${process.env.PORT || 10000}`;

    const forwardResponse = await fetchFn(`${baseUrl}/webhooks/new-lead/${clientKey}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Request': 'true',
      },
      body: JSON.stringify(transformedPayload),
    });

    const responseData = await forwardResponse.json().catch(() => ({
      error: 'Failed to parse response',
    }));

    if (!forwardResponse.ok) {
      console.error('[FACEBOOK WEBHOOK] Forward request failed:', responseData);
      return res.status(forwardResponse.status).json({
        error: 'Failed to process lead',
        details: responseData,
        transformedPayload,
      });
    }

    console.log('[FACEBOOK WEBHOOK] Successfully processed lead:', responseData);

    return res.status(200).json({
      success: true,
      message: 'Facebook lead processed successfully',
      leadId: leadData.leadgen_id,
      callInitiated: true,
      response: responseData,
    });
  } catch (err) {
    console.error('[FACEBOOK WEBHOOK ERROR]', err);
    return res.status(500).json({
      error: 'Failed to process Facebook webhook',
      details: err.message,
      stack: env === 'development' ? err.stack : undefined,
    });
  }
}
