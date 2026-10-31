import AuthForm from '@/components/auth/AuthForm';
import AuthLayout from '@/components/auth/AuthLayout';
export const metadata = { title: 'Choose a new password | Love Live Myoko', robots: { index: false, follow: false } };
export default function Page() {
    return <AuthLayout title="Choose a new password" description="Set a new password using the link sent to your email address."><AuthForm mode="reset" /></AuthLayout>;
}
