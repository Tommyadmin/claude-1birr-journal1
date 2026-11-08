// Sends email through Resend (https://resend.com). Needs RESEND_API_KEY and MAIL_FROM.
// Without a key (local testing) the email is printed to the function log instead.
import { getSite } from './site.js';

const esc = (s) => String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function layout(brand, accent, title, bodyHtml, button) {
  const btn = button
    ? `<p style="margin:28px 0"><a href="${button.url}" style="background:${accent};color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;display:inline-block">${button.label}</a></p>
       <p style="color:#6b6a64;font-size:13px">If the button does not work, copy this link into your browser:<br><span style="word-break:break-all">${button.url}</span></p>`
    : '';
  return `<!doctype html><html><body style="margin:0;background:#f3f2ee;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#1d1f24">
  <div style="max-width:520px;margin:0 auto;padding:32px 20px">
    <div style="font-size:13px;letter-spacing:.06em;color:${accent};font-weight:700">${esc(brand)}</div>
    <div style="background:#fff;border:1px solid #dedbd2;border-radius:12px;padding:24px;margin-top:10px">
      <h1 style="font-size:22px;margin:0 0 14px">${title}</h1>
      ${bodyHtml}${btn}
    </div>
    <p style="color:#9a9a94;font-size:12px;margin-top:18px">${esc(brand)}. You received this because of your account on ${esc(brand)}.</p>
  </div></body></html>`;
}

export async function sendMail(to, subject, title, bodyHtml, button) {
  const site = await getSite().catch(() => ({ name: '1birr Trade', accent: '#2563eb' }));
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || `${site.name} <onboarding@resend.dev>`;
  const html = layout(site.name, site.accent, title, bodyHtml, button);
  if (!key) {
    console.log(`[mail:not-sent] to=${to} subject="${subject}"${button ? ' link=' + button.url : ''}`);
    return { ok: false, logged: true };
  }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html }),
    });
    if (!r.ok) console.error('Resend error', r.status, await r.text());
    return { ok: r.ok };
  } catch (e) {
    console.error('Resend failed', e);
    return { ok: false };
  }
}


export const mails = {
  verify: (u, url) => sendMail(u.email, 'Confirm your email', 'Confirm your email',
    `<p>Hi ${esc(u.name)},</p><p>Thanks for signing up. Confirm your email address to continue. The link works for 24 hours.</p>`,
    { url, label: 'Confirm email' }),

  otp: (u, code) => sendMail(u.email, `Your verification code: ${code}`, 'Verify your email',
    `<p>Hi ${esc(u.name)},</p><p>Enter this code to verify your email and finish creating your account. It works for 15 minutes.</p>
     <p style="font:700 34px/1.2 'JetBrains Mono',ui-monospace,Menlo,monospace;letter-spacing:.3em;margin:22px 0;color:#111827">${esc(code)}</p>
     <p style="color:#6b6a64;font-size:13px">If you did not sign up, you can ignore this email.</p>`),

  subscription: (u, title, bodyHtml, url) => sendMail(u.email, title, esc(title), `<p>Hi ${esc(u.name)},</p>${bodyHtml}`, { url, label: 'Open subscription' }),

  reset: (u, url) => sendMail(u.email, 'Reset your password', 'Reset your password',
    `<p>Hi ${esc(u.name)},</p><p>Someone asked to reset the password for this account. If it was you, choose a new password below. The link works for 1 hour.</p><p>If it was not you, ignore this email. Your password stays the same.</p>`,
    { url, label: 'Choose a new password' }),

  approved: (u, url) => sendMail(u.email, 'Your account is approved', 'You are in',
    `<p>Hi ${esc(u.name)},</p><p>Your account has been approved. You can sign in now.</p>`,
    { url, label: 'Sign in' }),

  message: (u, title, body, url) => sendMail(u.email, title, esc(title),
    `<p>Hi ${esc(u.name)},</p><p style="white-space:pre-wrap">${esc(body)}</p>`, { url, label: 'Open your inbox' }),

  adminNewUser: (adminEmail, u, url) => sendMail(adminEmail, `New sign-up: ${u.name}`, 'New account waiting for approval',
    `<p><b>${esc(u.name)}</b><br>${esc(u.email)}<br>${esc(u.phone)}</p><p>Review it on the admin page.</p>`,
    { url, label: 'Open admin page' }),
};
