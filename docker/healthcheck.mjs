try {
  const response = await fetch("http://127.0.0.1:3000/api/health", {
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok || (await response.json()).status !== "ok") {
    throw new Error("The application or its database is not ready.");
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : "Health check failed.");
  process.exitCode = 1;
}
