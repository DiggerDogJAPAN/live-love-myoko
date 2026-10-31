import AuthForm from '@/components/auth/AuthForm';
import AuthLayout from '@/components/auth/AuthLayout';
export const metadata = { title: 'Create your account | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <AuthLayout title="Create your account" description="Begin with an account. Membership purchasing will follow in a later phase."><AuthForm mode="register" /></AuthLayout>;
}
