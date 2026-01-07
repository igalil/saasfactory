import path from 'path';
import type { ProjectContext } from '../../core/context.js';
import { writeFile, ensureDir } from '../../utils/file-system.js';

/**
 * Generate legal documents (Privacy Policy, Terms of Service)
 */
export async function generateLegal(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  await ensureDir(path.join(projectPath, 'app', '(marketing)', 'privacy'));
  await ensureDir(path.join(projectPath, 'app', '(marketing)', 'terms'));

  // Generate Privacy Policy
  await generatePrivacyPolicy(context, projectPath);

  // Generate Terms of Service
  await generateTermsOfService(context, projectPath);
}

async function generatePrivacyPolicy(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const page = `export const metadata = {
  title: 'Privacy Policy - ${context.displayName}',
  description: 'Privacy Policy for ${context.displayName}',
};

export default function PrivacyPolicyPage() {
  return (
    <div className="container max-w-4xl py-16">
      <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
      <p className="text-muted-foreground mb-8">Last updated: ${currentDate}</p>

      <div className="prose prose-gray dark:prose-invert max-w-none">
        <h2>1. Introduction</h2>
        <p>
          Welcome to ${context.displayName} ("we," "our," or "us"). We respect your privacy
          and are committed to protecting your personal data. This privacy policy explains
          how we collect, use, and safeguard your information when you use our service.
        </p>

        <h2>2. Information We Collect</h2>
        <h3>2.1 Information You Provide</h3>
        <ul>
          <li><strong>Account Information:</strong> Name, email address, and password when you create an account</li>
          <li><strong>Payment Information:</strong> Billing details processed securely through Stripe</li>
          <li><strong>Profile Information:</strong> Any additional information you add to your profile</li>
          <li><strong>Communications:</strong> Messages you send to us for support or feedback</li>
        </ul>

        <h3>2.2 Information Collected Automatically</h3>
        <ul>
          <li><strong>Usage Data:</strong> How you interact with our service</li>
          <li><strong>Device Information:</strong> Browser type, operating system, device identifiers</li>
          <li><strong>Log Data:</strong> IP address, access times, pages viewed</li>
          ${context.features.analytics !== 'none' ? '<li><strong>Analytics:</strong> Anonymized usage patterns via PostHog</li>' : ''}
        </ul>

        <h2>3. How We Use Your Information</h2>
        <p>We use your information to:</p>
        <ul>
          <li>Provide and maintain our service</li>
          <li>Process transactions and send related information</li>
          <li>Send you technical notices, updates, and support messages</li>
          <li>Respond to your comments and questions</li>
          <li>Analyze usage patterns to improve our service</li>
          <li>Detect, prevent, and address technical issues</li>
        </ul>

        <h2>4. Data Sharing</h2>
        <p>We do not sell your personal data. We may share your information with:</p>
        <ul>
          <li><strong>Service Providers:</strong> Third parties that help us operate our service (e.g., Stripe for payments, Clerk for authentication)</li>
          <li><strong>Legal Requirements:</strong> When required by law or to protect our rights</li>
          <li><strong>Business Transfers:</strong> In connection with a merger or acquisition</li>
        </ul>

        <h2>5. Data Security</h2>
        <p>
          We implement appropriate security measures to protect your personal data.
          However, no method of transmission over the Internet is 100% secure.
        </p>

        <h2>6. Your Rights</h2>
        <p>Depending on your location, you may have the right to:</p>
        <ul>
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion of your data</li>
          <li>Object to processing of your data</li>
          <li>Export your data</li>
        </ul>

        <h2>7. Cookies</h2>
        <p>
          We use cookies and similar technologies to enhance your experience.
          You can control cookies through your browser settings.
        </p>

        <h2>8. Children's Privacy</h2>
        <p>
          Our service is not intended for children under 13. We do not knowingly
          collect data from children under 13.
        </p>

        <h2>9. Changes to This Policy</h2>
        <p>
          We may update this privacy policy from time to time. We will notify you
          of any changes by posting the new policy on this page.
        </p>

        <h2>10. Contact Us</h2>
        <p>
          If you have questions about this privacy policy, please contact us at{' '}
          <a href="mailto:privacy@${context.domain || 'example'}.com">
            privacy@${context.domain || 'example'}.com
          </a>
        </p>
      </div>
    </div>
  );
}
`;

  await writeFile(
    path.join(projectPath, 'app', '(marketing)', 'privacy', 'page.tsx'),
    page
  );
}

async function generateTermsOfService(
  context: ProjectContext,
  projectPath: string,
): Promise<void> {
  const currentDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const page = `export const metadata = {
  title: 'Terms of Service - ${context.displayName}',
  description: 'Terms of Service for ${context.displayName}',
};

export default function TermsOfServicePage() {
  return (
    <div className="container max-w-4xl py-16">
      <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
      <p className="text-muted-foreground mb-8">Last updated: ${currentDate}</p>

      <div className="prose prose-gray dark:prose-invert max-w-none">
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using ${context.displayName} ("the Service"), you agree to be bound
          by these Terms of Service. If you do not agree to these terms, please do not
          use our Service.
        </p>

        <h2>2. Description of Service</h2>
        <p>
          ${context.displayName} is a ${context.saasType} software-as-a-service platform that
          ${context.description.toLowerCase()}.
        </p>

        <h2>3. Account Registration</h2>
        <p>To use certain features, you must create an account. You agree to:</p>
        <ul>
          <li>Provide accurate and complete information</li>
          <li>Maintain the security of your account credentials</li>
          <li>Notify us immediately of any unauthorized access</li>
          <li>Accept responsibility for all activities under your account</li>
        </ul>

        <h2>4. Subscription and Payments</h2>
        <h3>4.1 Billing</h3>
        <p>
          ${context.pricing.type === 'freemium'
            ? 'We offer both free and paid subscription plans.'
            : context.pricing.type === 'subscription'
            ? 'Access to our Service requires a paid subscription.'
            : 'We offer various pricing options for our Service.'}
          Paid subscriptions are billed in advance on a ${context.pricing.tiers[1]?.interval || 'monthly'} basis.
        </p>

        <h3>4.2 Refunds</h3>
        <p>
          Refunds are handled on a case-by-case basis. Contact our support team
          if you believe you are entitled to a refund.
        </p>

        <h3>4.3 Cancellation</h3>
        <p>
          You may cancel your subscription at any time. Access will continue until
          the end of your current billing period.
        </p>

        <h2>5. Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Violate any applicable laws or regulations</li>
          <li>Infringe on intellectual property rights</li>
          <li>Transmit malicious code or interfere with the Service</li>
          <li>Attempt to gain unauthorized access to our systems</li>
          <li>Use the Service for any illegal or unauthorized purpose</li>
          <li>Resell or redistribute the Service without permission</li>
        </ul>

        <h2>6. Intellectual Property</h2>
        <p>
          The Service and its original content, features, and functionality are owned
          by ${context.displayName} and are protected by international copyright, trademark,
          and other intellectual property laws.
        </p>

        <h2>7. User Content</h2>
        <p>
          You retain ownership of any content you submit to the Service. By submitting
          content, you grant us a license to use, modify, and display that content
          as necessary to provide the Service.
        </p>

        <h2>8. Limitation of Liability</h2>
        <p>
          To the maximum extent permitted by law, ${context.displayName} shall not be liable
          for any indirect, incidental, special, consequential, or punitive damages
          resulting from your use of the Service.
        </p>

        <h2>9. Disclaimer of Warranties</h2>
        <p>
          The Service is provided "as is" without warranties of any kind, either
          express or implied. We do not guarantee that the Service will be
          uninterrupted, secure, or error-free.
        </p>

        <h2>10. Termination</h2>
        <p>
          We may terminate or suspend your account at any time for violations of
          these terms. Upon termination, your right to use the Service will
          immediately cease.
        </p>

        <h2>11. Changes to Terms</h2>
        <p>
          We reserve the right to modify these terms at any time. We will notify
          users of material changes via email or through the Service.
        </p>

        <h2>12. Governing Law</h2>
        <p>
          These terms shall be governed by and construed in accordance with the
          laws of the jurisdiction in which we operate, without regard to its
          conflict of law provisions.
        </p>

        <h2>13. Contact</h2>
        <p>
          For questions about these Terms, please contact us at{' '}
          <a href="mailto:legal@${context.domain || 'example'}.com">
            legal@${context.domain || 'example'}.com
          </a>
        </p>
      </div>
    </div>
  );
}
`;

  await writeFile(
    path.join(projectPath, 'app', '(marketing)', 'terms', 'page.tsx'),
    page
  );
}
