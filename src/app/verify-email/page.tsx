import AuthForm from '@/components/auth/AuthForm';
import AuthLayout from '@/components/auth/AuthLayout';
export const metadata = { title: 'Verify your email | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <AuthLayout title="Verify your email" description="Open the confirmation link in your email, or enter its verification code below."><AuthForm mode="verify" /></AuthLayout>;
}
