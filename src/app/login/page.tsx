import AuthForm from '@/components/auth/AuthForm';
import AuthLayout from '@/components/auth/AuthLayout';
export const metadata = { title: 'Sign in | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <AuthLayout title="Sign in" description="Welcome back. Sign in to manage your Property Finder account."><AuthForm mode="login" /></AuthLayout>;
}
