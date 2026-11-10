import { getSignedInUser } from "./auth";
import LoginForm from "./login-form";
import WorkspaceClient from "./workspace-client";

export const dynamic = "force-dynamic";

export default async function Home() {
  const identity = await getSignedInUser();
  if (!identity) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="login-logo"><img src="/forensys-logo.png" alt="ForenSys — your eyes on the scene" /></div>
          <span className="eyebrow">Management only</span>
          <h1>Review Hub</h1>
          <p>Sign in with the account your ForenSys administrator created for you.</p>
          <LoginForm />
          <p className="login-small">Forgot your password? Ask your administrator to reset it.</p>
        </section>
      </main>
    );
  }
  return <WorkspaceClient signedInName={identity.fullName || identity.displayName} signOutHref="/auth/signout" />;
}
