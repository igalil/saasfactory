import path from 'path';
import type { ProjectContext } from '../../core/context.js';
import { writeFile, ensureDir } from '../../utils/file-system.js';

/**
 * Generate email templates and sending utilities
 */
export async function generateEmail(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  await ensureDir(path.join(projectPath, 'emails'));
  await ensureDir(path.join(projectPath, 'lib'));

  // Generate email sending utility
  await generateEmailLib(projectPath);

  // Generate email templates
  await generateWelcomeEmail(context, projectPath);
  await generateSubscriptionEmail(context, projectPath);
  await generatePasswordResetEmail(context, projectPath);
}

async function generateEmailLib(projectPath: string): Promise<void> {
  const emailLib = `import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface SendEmailOptions {
  to: string | string[];
  subject: string;
  react: React.ReactElement;
  from?: string;
}

export async function sendEmail({ to, subject, react, from }: SendEmailOptions) {
  const fromEmail = from || process.env.EMAIL_FROM || 'noreply@example.com';

  try {
    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      react,
    });

    if (error) {
      console.error('Failed to send email:', error);
      throw new Error(error.message);
    }

    return data;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}

// Helper to send welcome email
export async function sendWelcomeEmail(email: string, name: string) {
  const { WelcomeEmail } = await import('@/emails/welcome');
  return sendEmail({
    to: email,
    subject: 'Welcome! Your account is ready',
    react: WelcomeEmail({ name }),
  });
}

// Helper to send subscription confirmation
export async function sendSubscriptionEmail(
  email: string,
  name: string,
  plan: string
) {
  const { SubscriptionEmail } = await import('@/emails/subscription-confirmed');
  return sendEmail({
    to: email,
    subject: 'Subscription Confirmed',
    react: SubscriptionEmail({ name, plan }),
  });
}
`;

  await writeFile(path.join(projectPath, 'lib', 'email.ts'), emailLib);
}

async function generateWelcomeEmail(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const email = `import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface WelcomeEmailProps {
  name: string;
}

export function WelcomeEmail({ name }: WelcomeEmailProps) {
  const previewText = \`Welcome to ${context.displayName}, \${name}!\`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Welcome to ${context.displayName}!</Heading>
          <Text style={text}>Hi {name},</Text>
          <Text style={text}>
            Thanks for signing up! We're excited to have you on board.
          </Text>
          <Text style={text}>
            ${context.description}
          </Text>
          <Section style={buttonContainer}>
            <Button
              style={button}
              href={\`\${process.env.NEXT_PUBLIC_APP_URL}/dashboard\`}
            >
              Get Started
            </Button>
          </Section>
          <Text style={text}>
            If you have any questions, just reply to this email. We're always
            happy to help!
          </Text>
          <Text style={footer}>
            Best,
            <br />
            The ${context.displayName} Team
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default WelcomeEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  borderRadius: '8px',
  maxWidth: '580px',
};

const h1 = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.25',
  marginBottom: '24px',
};

const text = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '1.5',
  marginBottom: '16px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '32px',
  marginBottom: '32px',
};

const button = {
  backgroundColor: '#4f46e5',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const footer = {
  color: '#6b7280',
  fontSize: '14px',
  marginTop: '32px',
};
`;

  await writeFile(path.join(projectPath, 'emails', 'welcome.tsx'), email);
}

async function generateSubscriptionEmail(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const email = `import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface SubscriptionEmailProps {
  name: string;
  plan: string;
}

export function SubscriptionEmail({ name, plan }: SubscriptionEmailProps) {
  const previewText = \`Your \${plan} subscription is now active!\`;

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Subscription Confirmed!</Heading>
          <Text style={text}>Hi {name},</Text>
          <Text style={text}>
            Thank you for subscribing to the <strong>{plan}</strong> plan!
            Your subscription is now active.
          </Text>
          <Section style={planBox}>
            <Text style={planText}>
              <strong>Plan:</strong> {plan}
            </Text>
            <Text style={planText}>
              <strong>Status:</strong> Active
            </Text>
          </Section>
          <Text style={text}>
            You now have access to all {plan} features. Start exploring!
          </Text>
          <Section style={buttonContainer}>
            <Button
              style={button}
              href={\`\${process.env.NEXT_PUBLIC_APP_URL}/dashboard\`}
            >
              Go to Dashboard
            </Button>
          </Section>
          <Text style={text}>
            Need to manage your subscription? Visit your{' '}
            <a href={\`\${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing\`}>
              billing settings
            </a>.
          </Text>
          <Text style={footer}>
            Thanks for choosing ${context.displayName}!
            <br />
            The ${context.displayName} Team
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default SubscriptionEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  borderRadius: '8px',
  maxWidth: '580px',
};

const h1 = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.25',
  marginBottom: '24px',
};

const text = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '1.5',
  marginBottom: '16px',
};

const planBox = {
  backgroundColor: '#f3f4f6',
  borderRadius: '6px',
  padding: '16px',
  marginBottom: '24px',
};

const planText = {
  color: '#374151',
  fontSize: '14px',
  margin: '4px 0',
};

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '32px',
  marginBottom: '32px',
};

const button = {
  backgroundColor: '#4f46e5',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const footer = {
  color: '#6b7280',
  fontSize: '14px',
  marginTop: '32px',
};
`;

  await writeFile(
    path.join(projectPath, 'emails', 'subscription-confirmed.tsx'),
    email
  );
}

async function generatePasswordResetEmail(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const email = `import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';

interface PasswordResetEmailProps {
  name: string;
  resetLink: string;
}

export function PasswordResetEmail({ name, resetLink }: PasswordResetEmailProps) {
  const previewText = 'Reset your password';

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Reset Your Password</Heading>
          <Text style={text}>Hi {name},</Text>
          <Text style={text}>
            We received a request to reset your password. Click the button
            below to choose a new password.
          </Text>
          <Section style={buttonContainer}>
            <Button style={button} href={resetLink}>
              Reset Password
            </Button>
          </Section>
          <Text style={text}>
            This link will expire in 1 hour. If you didn't request a password
            reset, you can safely ignore this email.
          </Text>
          <Text style={footer}>
            The ${context.displayName} Team
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default PasswordResetEmail;

const main = {
  backgroundColor: '#f6f9fc',
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
};

const container = {
  backgroundColor: '#ffffff',
  margin: '0 auto',
  padding: '40px 20px',
  borderRadius: '8px',
  maxWidth: '580px',
};

const h1 = {
  color: '#1f2937',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.25',
  marginBottom: '24px',
};

const text = {
  color: '#4b5563',
  fontSize: '16px',
  lineHeight: '1.5',
  marginBottom: '16px',
};

const buttonContainer = {
  textAlign: 'center' as const,
  marginTop: '32px',
  marginBottom: '32px',
};

const button = {
  backgroundColor: '#4f46e5',
  borderRadius: '6px',
  color: '#fff',
  fontSize: '16px',
  fontWeight: '600',
  textDecoration: 'none',
  textAlign: 'center' as const,
  display: 'inline-block',
  padding: '12px 24px',
};

const footer = {
  color: '#6b7280',
  fontSize: '14px',
  marginTop: '32px',
};
`;

  await writeFile(path.join(projectPath, 'emails', 'password-reset.tsx'), email);
}
