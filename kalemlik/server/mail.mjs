import nodemailer from 'nodemailer';

/** SMTP tanımlıysa e-posta gönderir; değilse bağlantıyı sunucu günlüğüne yazar (yönetici iletebilir). */
export function createMailer(config) {
  const {mail} = config;
  const transport = mail.host && mail.from
    ? nodemailer.createTransport({host: mail.host, port: mail.port, secure: mail.secure, auth: mail.user ? {user: mail.user, pass: mail.password} : undefined})
    : null;
  return {
    configured: !!transport,
    async send({to, subject, text}) {
      if (!transport) {
        console.log(`[Kalemlik e-posta — SMTP ayarlı değil] Alıcı: ${to}\nKonu: ${subject}\n${text}\n`);
        return false;
      }
      await transport.sendMail({from: mail.from, to, subject, text});
      return true;
    },
  };
}
