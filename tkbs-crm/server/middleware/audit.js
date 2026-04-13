// Audit log middleware — tracks security-sensitive events and CRM writes.
// Best-effort: errors never block the request.

function logAudit(db, userId, action, resourceType, resourceId, metadata, ipAddress) {
  try {
    db.prepare(
      `INSERT INTO audit_log (user_id, action, resource_type, resource_id, metadata, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      userId || null,
      action,
      resourceType || null,
      resourceId != null ? String(resourceId) : null,
      metadata ? JSON.stringify(metadata) : null,
      ipAddress || null
    );
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
}

function auditMiddleware(req, res, next) {
  req.audit = (action, resourceType, resourceId, metadata) => {
    const userId = req.session?.userId || null;
    const ip = req.ip || req.headers['x-forwarded-for'] || null;
    logAudit(req.db, userId, action, resourceType, resourceId, metadata, ip);
  };
  next();
}

module.exports = { auditMiddleware, logAudit };
