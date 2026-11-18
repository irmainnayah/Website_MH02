// Starts the photo reconciler and integrity check once per server process (design 3.12). Failures here must never
// prevent the application from starting; the jobs log a secret-free line and retry on their next interval.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { startPhotoJobs } = await import("./server/photos");
      startPhotoJobs();
    } catch (error) {
      console.error(`[mh02] photo jobs not started: ${(error as Error).name}`);
    }
  }
}
