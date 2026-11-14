export function deliveryEstimate(branch, km, queued, clock = new Date()) {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Guatemala',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(clock);
  const minutes = (value) => Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
  const eta = 20 + queued * 8 + Math.ceil((km / 25) * 60);
  const open = time >= branch.opens_at && time < branch.closes_at;
  const reason =
    km > 30
      ? 'Fuera de cobertura'
      : !open
        ? 'Sucursal cerrada'
        : minutes(branch.closes_at) - minutes(time) < eta
          ? 'No alcanza antes del cierre'
          : '';
  return {
    eta_minutes: eta,
    queued_orders: queued,
    is_open: open,
    serviceable: !reason,
    unavailable_reason: reason,
  };
}
export function pickupEstimate(branch, queued, clock = new Date()) {
  const local = new Date(clock.getTime() - 6 * 3600000);
  const day = local.toISOString().slice(0, 10);
  let start = new Date(`${day}T${branch.opens_at}:00-06:00`);
  let close = new Date(`${day}T${branch.closes_at}:00-06:00`);
  const prep = 20 + queued * 8;
  if (clock > start) start = clock;
  if (start.getTime() + prep * 60000 >= close.getTime()) {
    start = new Date(new Date(`${day}T${branch.opens_at}:00-06:00`).getTime() + 86400000);
  }
  return {
    ready_at: new Date(start.getTime() + prep * 60000).toISOString(),
    eta_minutes: Math.ceil((start - clock) / 60000) + prep,
  };
}
