"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await signIn("credentials", {
      username,
      redirect: false,
      callbackUrl: "/dashboard",
    });
    setLoading(false);
    if (!res) {
      setError("Unable to sign in. Please try again.");
      return;
    }
    if (res.error) {
      setError(res.error || "Invalid username.");
      return;
    }
    if (res.url) {
      router.push(res.url);
      return;
    }
    router.push("/dashboard");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 grid place-items-center px-6">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow"
      >
        <h1 className="text-2xl font-bold">Login</h1>
        <p className="mt-1 text-sm text-zinc-400">Enter a username to continue.</p>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          className="mt-4 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 outline-none focus:ring-2 focus:ring-amber-500"
        />
        {error && <p className="mt-3 text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading || !username}
          className="mt-4 w-full rounded-md bg-amber-500 px-4 py-2 font-semibold text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? "Signing in..." : "Continue"}
        </button>
      </form>
    </div>
  );
}
