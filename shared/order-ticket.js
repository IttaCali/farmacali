// El QR identifica el ticket y su autorización. Nunca se ejecutan enlaces ni código leído.
export function parseOrderTicket(value) {
  if (typeof value !== 'string' || value.length > 1000)
    throw new Error('El QR no es un ticket válido de FarmaCali.');
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('El QR no es un ticket válido de FarmaCali.');
  }
  if (!parsed || typeof parsed.ticket !== 'string' || typeof parsed.access_code !== 'string')
    throw new Error('El QR no es un ticket válido de FarmaCali.');
  const ticket = parsed.ticket.trim().toUpperCase(),
    code = parsed.access_code.trim().toUpperCase();
  if (!/^FC-(?:[A-F0-9]{6}|[A-F0-9]{12})$/.test(ticket) || !/^(?:\d{6}|[A-F0-9]{24})$/.test(code))
    throw new Error('El QR no es un ticket válido de FarmaCali.');
  return { ticket, code };
}
