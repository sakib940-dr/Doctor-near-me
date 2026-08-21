export function normalizeWhatsAppNumber(value: string) {
  let digits = value.replace(/\D/g, '');
  if (digits.startsWith('0')) digits = `88${digits}`;
  return digits;
}

export function buildWhatsAppAppointmentUrl(value: string, entityName?: string | null) {
  const number = normalizeWhatsAppNumber(value);
  if (number.length < 10 || number.length > 15) return null;
  const target = entityName?.trim() ? ` ${entityName.trim()}-এর` : '';
  const message = `আসসালামু আলাইকুম। আমি docbd.info থেকে একজন রোগী হিসেবে যোগাযোগ করছি। আমি${target} অ্যাপয়েন্টমেন্ট নিতে চাই।`;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
