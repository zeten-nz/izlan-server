export type OtpPurpose = 'register' | 'reset';

const COPY: Record<OtpPurpose, { subject: string; title: string; lead: string; preheader: string }> = {
  register: {
    subject: "Izlan: ro'yxatdan o'tish kodi",
    title: 'Emailni tasdiqlang',
    lead: "Ro'yxatdan o'tishni yakunlash uchun quyidagi kodni kiriting.",
    preheader: "Ro'yxatdan o'tish tasdiqlash kodingiz",
  },
  reset: {
    subject: 'Izlan: parolni tiklash kodi',
    title: 'Parolni tiklash',
    lead: "Parolni qayta o'rnatish uchun quyidagi kodni kiriting.",
    preheader: 'Parolni tiklash kodingiz',
  },
};

export type RenderedMail = { subject: string; html: string; text: string };

/**
 * Email mijozlari uchun: jadval maketi, inline stillar, box-shadow/flex yo'q (Outlook/Gmail).
 * `code` faqat 6 ta raqam (generateOtp), shuning uchun HTML-escape talab qilinmaydi.
 */
export function renderOtpMail(purpose: OtpPurpose, code: string, ttlMinutes: number): RenderedMail {
  const c = COPY[purpose];
  const note = `Kod ${ttlMinutes} daqiqa amal qiladi va faqat bir marta ishlatiladi.`;
  const warn = "Agar bu so'rovni siz yubormagan bo'lsangiz, bu xatni e'tiborsiz qoldiring. Kodni hech kimga aytmang — Izlan xodimlari ham uni so'ramaydi.";
  const text = `${c.title}\n\n${c.lead}\n\nKod: ${code}\n\n${note}\n${warn}\n\nIzlan — izlan.uz`;
  const html = `<!doctype html>
<html lang="uz"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"><title>${c.subject}</title></head>
<body style="margin:0;padding:0;background:#f1eee4;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#f1eee4;">${c.preheader}: ${code}. ${note}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f1eee4;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:480px;background:#ffffff;border:3px solid #0b0b0b;border-bottom-width:7px;border-right-width:7px;">
<tr><td style="padding:28px 24px;font-family:Arial,Helvetica,sans-serif;color:#0b0b0b;">
<div style="font-weight:900;font-size:26px;letter-spacing:-1px;line-height:1;">IZLAN</div>
<h1 style="margin:22px 0 8px;font-size:22px;line-height:1.25;text-transform:uppercase;">${c.title}</h1>
<p style="margin:0 0 20px;font-size:16px;line-height:1.5;">${c.lead}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td align="center" style="background:#d6ff3d;border:3px solid #0b0b0b;padding:16px 8px;font-family:'Courier New',Courier,monospace;font-weight:700;font-size:36px;line-height:1;letter-spacing:8px;color:#0b0b0b;">${code}</td>
</tr></table>
<p style="margin:18px 0 0;font-size:14px;line-height:1.5;"><b>${note}</b></p>
<p style="margin:14px 0 0;padding-top:14px;border-top:1px solid #d9d4c3;font-size:13px;line-height:1.5;color:#444444;">${warn}</p>
</td></tr></table>
<p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#777777;">izlan.uz</p>
</td></tr></table>
</body></html>`;
  return { subject: c.subject, html, text };
}
