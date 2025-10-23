import { Link } from "react-router-dom";
import { PATHS } from "src/constants/paths";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-primary">
          <span className="text-2xl font-bold text-primary-foreground">S</span>
        </div>
        <h1 className="text-4xl font-bold text-foreground">Welcome to SocialApp</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Dive into a Reddit-inspired experience with a modern dark theme. Connect, share, and explore trending discussions.
        </p>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:justify-center">
          <Link
            to={PATHS.LOGIN}
            className="rounded-lg bg-primary px-6 py-3 text-center font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Log In
          </Link>
          <Link
            to={PATHS.SIGNUP}
            className="rounded-lg bg-muted px-6 py-3 text-center font-semibold text-foreground transition-colors hover:bg-muted/80"
          >
            Create an Account
          </Link>
        </div>
      </div>
    </div>
  );
}
