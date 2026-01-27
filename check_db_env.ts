console.log("DATABASE_URL:", process.env.DATABASE_URL ? "Set" : "Not Set");
if (process.env.DATABASE_URL) {
  console.log("URL Length:", process.env.DATABASE_URL.length);
  // Don't print the full URL to avoid leaking secrets in logs, but maybe the protocol
  console.log("Protocol:", process.env.DATABASE_URL.split("://")[0]);
}
