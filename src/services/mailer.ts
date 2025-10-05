import nodemailer, { type Transporter } from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASSWORD = process.env.SMTP_PASSWORD;
const SMTP_SECURE = process.env.SMTP_SECURE === "true";
const SMTP_FROM = process.env.SMTP_FROM ?? SMTP_USER ?? "no-reply@talentflow.local";

let transporter: Transporter | null = null;

if (SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASSWORD) {
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASSWORD,
    },
  });

  transporter
    .verify()
    .then(() => console.log("[mailer] SMTP connection verified"))
    .catch((error: unknown) => console.error("[mailer] SMTP verification error", error));
} else {
  console.warn("[mailer] SMTP configuration incomplete, emails will be logged only");
}

type SendInvitationParams = {
  to: string;
  nombre?: string | null;
  companyName?: string | null;
  acceptUrl: string;
  expiresAt?: string | null;
};

type SendInvitationResult = {
  attempted: boolean;
  success: boolean;
  message: string;
  providerId?: string;
};

export async function sendInvitationEmail(params: SendInvitationParams): Promise<SendInvitationResult> {
  const { to, nombre, companyName, acceptUrl, expiresAt } = params;
  const subject = "Talent Flow - Activacion de acceso";
  const lines = [
    `Hola ${nombre ?? ""}`.trim(),
    "\nTe invitamos a unirte a la plataforma Talent Flow.",
  ];

  if (companyName) {
    lines.push(`Empresa: ${companyName}.`);
  }

  lines.push("\nPara activar tu cuenta, abre el siguiente enlace:");
  lines.push(acceptUrl);

  if (expiresAt) {
    lines.push(`\nEste enlace expira el ${new Date(expiresAt).toLocaleString()}.`);
  }

  lines.push("\nSi no reconoces este mensaje, puedes ignorarlo.");

  const text = lines.join("\n");
  const html = text.replace(/\n/g, "<br/>");

  if (!transporter) {
    console.log("[mailer] Email (simulado)", { to, subject, text });
    return { attempted: false, success: false, message: "SMTP no configurado" };
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
    console.log("[mailer] Invitation email sent", info.messageId);
    return { attempted: true, success: true, message: "Email enviado", providerId: info.messageId };
  } catch (error) {
    console.error("[mailer] Error enviando email", error);
    return { attempted: true, success: false, message: (error as Error)?.message ?? "Error enviando email" };
  }
}

type SendPublicApplicationParams = {
  to: string[];
  jobTitle: string;
  companyName: string;
  candidateName: string;
  candidateEmail: string;
  candidatePhone?: string | null;
  message?: string | null;
  jobUrl?: string | null;
};

export async function sendPublicApplicationNotification(
  params: SendPublicApplicationParams,
): Promise<SendInvitationResult> {
  if (!params.to?.length) {
    return { attempted: false, success: false, message: "No hay destinatarios" };
  }

  const lines = [
    `Se recibió una nueva postulación para "${params.jobTitle}".`,
    '',
    `Candidato: ${params.candidateName} <${params.candidateEmail}>`,
  ];

  if (params.candidatePhone) {
    lines.push(`Teléfono: ${params.candidatePhone}`);
  }

  if (params.jobUrl) {
    lines.push('', `Revisar vacante: ${params.jobUrl}`);
  }

  if (params.message) {
    lines.push('', 'Mensaje del candidato:', params.message);
  }

  const text = lines.join('\n');
  const html = text.replace(/\n/g, '<br/>');

  if (!transporter) {
    console.log('[mailer] Notificación de postulación (simulada)', {
      to: params.to,
      subject: `Nueva postulación - ${params.jobTitle}`,
      text,
    });
    return { attempted: false, success: false, message: 'SMTP no configurado' };
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to: params.to,
      subject: `Nueva postulación - ${params.jobTitle}`,
      text,
      html,
    });
    console.log('[mailer] Notificación de postulación enviada', info.messageId);
    return { attempted: true, success: true, message: 'Email enviado', providerId: info.messageId };
  } catch (error) {
    console.error('[mailer] Error enviando notificación de postulación', error);
    return { attempted: true, success: false, message: (error as Error)?.message ?? 'Error enviando email' };
  }
}

