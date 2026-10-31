import AuthForm from '@/components/auth/AuthForm';
import AuthLayout from '@/components/auth/AuthLayout';
export const metadata = { title: 'Reset your password | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <AuthLayout title="Reset your password" description="Enter your email address and we’ll send a secure password reset link."><AuthForm mode="forgot" /></AuthLayout>;
}
