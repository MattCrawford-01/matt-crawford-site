// Email clients don't reliably support the CSS the site uses (custom fonts often get
// stripped, CSS variables aren't supported, dark mode handling varies by client) — so
// this template uses inline styles and web-safe font stacks throughout, rather than
// pulling in the site's actual stylesheet.
//
// tagLabel/heading/bodyText have defaults matching the original purchase-confirmation
// copy, but can be overridden — used by the direct-delivery feature so a hired-shoot
// handoff doesn't read like "thanks for your order" when nothing was purchased through
// the cart.
export function buildDownloadEmailHtml({
  downloadUrl,
  invoiceUrl,
  tagLabel = 'Order Confirmed',
  heading = 'Your Photos &amp; Video<br>Are Ready',
  bodyText = 'Thanks for your order — everything you purchased has been combined into one download.',
  mentionLicense = true,
}) {
  const mono = "'IBM Plex Mono', 'Courier New', monospace";
  const body = "Arial, Helvetica, sans-serif";
  return `
<body style="margin:0; padding:0; background:#0a0a0a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;">
    <tr>
      <td align="center" style="padding:48px 20px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

          <tr>
            <td style="font-family:${mono}; font-size:11px; letter-spacing:3px; text-transform:uppercase; color:#f4f3ef; padding-bottom:32px;">
              Matt Crawford
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid rgba(244,243,239,0.14); padding-top:36px;">
              <p style="font-family:${mono}; font-size:10px; letter-spacing:2px; text-transform:uppercase; color:#8c8c86; margin:0 0 14px;">${tagLabel}</p>
              <h1 style="font-family:${body}; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; font-size:24px; line-height:1.3; color:#f4f3ef; margin:0 0 22px;">${heading}</h1>
              <p style="font-family:${body}; font-size:15px; line-height:1.6; color:#f4f3ef; margin:0 0 32px;">
                ${bodyText}
              </p>

              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
                <tr>
                  <td style="background:#f4f3ef;">
                    <a href="${downloadUrl}" style="display:block; font-family:${mono}; font-size:12px; letter-spacing:1.5px; text-transform:uppercase; color:#0a0a0a; text-decoration:none; padding:16px 30px;">Download Your Files →</a>
                  </td>
                </tr>
              </table>

              ${invoiceUrl ? `<p style="margin:0 0 24px;"><a href="${invoiceUrl}" style="font-family:${mono}; font-size:11px; letter-spacing:1px; text-transform:uppercase; color:#8c8c86; text-decoration:none; border-bottom:1px solid rgba(140,140,134,0.5);">[ View Invoice / Receipt ]</a></p>` : '<div style="height:24px;"></div>'}
              ${mentionLicense ? `<p style="font-family:${body}; font-size:13px; line-height:1.6; color:#8c8c86; margin:0;">Your content license agreement is attached to this email.</p>` : ''}
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid rgba(244,243,239,0.14); padding-top:28px;">
              <p style="font-family:${mono}; font-size:10px; letter-spacing:1.5px; text-transform:uppercase; color:#8c8c86; margin:0 0 14px;">Matt Crawford — Aerial Cinematography</p>
              <p style="font-family:${body}; font-size:13px; color:#f4f3ef; margin:0 0 6px;">
                <a href="https://www.matt-crawford.com" style="color:#f4f3ef; text-decoration:none; border-bottom:1px solid rgba(244,243,239,0.28);">matt-crawford.com</a>
              </p>
              <p style="font-family:${body}; font-size:13px; color:#8c8c86; margin:0 0 6px;">
                <a href="mailto:contact@matt-crawford.com" style="color:#8c8c86; text-decoration:none;">contact@matt-crawford.com</a>
                &nbsp;·&nbsp;
                <a href="tel:+17788713118" style="color:#8c8c86; text-decoration:none;">(778) 871-3118</a>
              </p>
              <p style="font-family:${body}; font-size:13px; color:#8c8c86; margin:0 0 24px;">
                <a href="https://www.instagram.com/matt.crawf0rd/" style="color:#8c8c86; text-decoration:none;">Instagram: @matt.crawf0rd</a>
              </p>
              <p style="font-family:${mono}; font-size:10px; color:#57564f; margin:0;">© ${new Date().getFullYear()} Matt Crawford</p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>`;
}
